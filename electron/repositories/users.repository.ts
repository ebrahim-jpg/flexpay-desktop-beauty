import { BaseRepository } from "./base.repository";
import { hashPassword, hashPin, verifyPasswordHash, verifyPinHash } from "../lib/crypto";
import { effectivePermissions, canLogin, isAssignableRole, ASSIGNABLE_ROLES } from "../../shared/permissions";
import type { User } from "../../types/database.types";
import type {
  SafeUser,
  CreateUserInput,
  UpdateUserInput,
} from "../../types/ipc.types";

export class UsersRepository extends BaseRepository {
  // يحوّل صف قاعدة البيانات لنسخة آمنة (بدون hashes) تُرسل للـ Renderer
  private toSafeUser(row: User): SafeUser {
    let stored: Record<string, boolean> = {};
    try {
      stored = row.permissions ? JSON.parse(row.permissions) : {};
    } catch {
      stored = {};
    }
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      username: row.username,
      role: row.role,
      permissions: effectivePermissions(row.role, stored),
      is_active: row.is_active === 1,
      last_login_at: row.last_login_at,
      has_password: !!row.password_hash,
      has_pin: !!row.pin_hash,
      has_attendance_code: !!row.attendance_code_hash,
      auto_clockout_hours: row.auto_clockout_hours ?? null,
      warn_hours: row.warn_hours ?? null,
      seller_categories: this.parseSellerCats(row.seller_categories),
    };
  }

  // فئات البائع: null/فاضي = بائع عام (كل الفئات)
  private parseSellerCats(raw: string | null): number[] | null {
    if (!raw) return null;
    try {
      const arr = JSON.parse(raw);
      const ids = Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isFinite(n)) : [];
      return ids.length ? ids : null;
    } catch {
      return null;
    }
  }

  private sellerCatsJson(cats?: number[] | null): string | null {
    return cats && cats.length ? JSON.stringify(cats) : null;
  }

  // كود الحضور لازم 5 أرقام وفريد بين كل الموظفين (عشان الـ toggle مايتلخبطش)
  private assertValidCode(code: string): void {
    if (!/^\d{5}$/.test(code)) throw new Error("كود الحضور لازم يكون 5 أرقام");
  }

  private assertCodeUnique(code: string, excludeId?: number): void {
    const rows = this.db
      .prepare(
        "SELECT id, attendance_code_hash FROM users WHERE is_deleted = 0 AND attendance_code_hash IS NOT NULL AND id != ?"
      )
      .all(excludeId ?? -1) as { id: number; attendance_code_hash: string }[];
    for (const r of rows) {
      if (verifyPinHash(code, r.attendance_code_hash)) {
        throw new Error("الكود ده مستخدم لموظف تاني — اختر كود مختلف");
      }
    }
  }

  private findRowById(id: number): User | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE id = ? AND is_deleted = 0")
      .get(id) as User | undefined;
    return row ?? null;
  }

  private findRowByUsername(username: string): User | null {
    const row = this.db
      .prepare(
        "SELECT * FROM users WHERE username = ? AND is_deleted = 0 AND is_active = 1"
      )
      .get(username) as User | undefined;
    return row ?? null;
  }

  getAllActive(): SafeUser[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM users WHERE is_deleted = 0 ORDER BY role = 'owner' DESC, name ASC"
      )
      .all() as User[];
    return rows.map((r) => this.toSafeUser(r));
  }

  /** اللي بيقفلوا فواتير فعلاً — الكاشير والنادل (فلتر الوردية في التقارير) */
  getActiveCashiers(): SafeUser[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM users
         WHERE role IN ('cashier', 'waiter') AND is_active = 1 AND is_deleted = 0
         ORDER BY name ASC`
      )
      .all() as User[];
    return rows.map((r) => this.toSafeUser(r));
  }

  getById(id: number): SafeUser | null {
    const row = this.findRowById(id);
    return row ? this.toSafeUser(row) : null;
  }

  usernameExists(username: string, excludeId?: number): boolean {
    const row = this.db
      .prepare(
        "SELECT id FROM users WHERE username = ? AND is_deleted = 0 AND id != ?"
      )
      .get(username, excludeId ?? -1) as { id: number } | undefined;
    return !!row;
  }

  // نسخة البلايستيشن: مفيش ديليفري ولا بائعين — الفحص هنا في الـmain مش في القائمة بس
  private assertAssignableRole(role: string): void {
    if (!isAssignableRole(role)) {
      throw new Error(`الدور ده مش متاح — الأدوار المتاحة: ${ASSIGNABLE_ROLES.join(" · ")}`);
    }
  }

  create(input: CreateUserInput, actorId: number | null): SafeUser {
    this.assertAssignableRole(input.role);
    const localId = this.newLocalId();
    const now = this.now();

    const passwordHash =
      input.password && input.password.length > 0
        ? hashPassword(input.password)
        : null;
    const pinHash =
      input.pin && input.pin.length > 0 ? hashPin(input.pin) : null;

    let attendanceCodeHash: string | null = null;
    if (input.attendanceCode && input.attendanceCode.length > 0) {
      this.assertValidCode(input.attendanceCode);
      this.assertCodeUnique(input.attendanceCode);
      attendanceCodeHash = hashPin(input.attendanceCode);
    }

    const permissions = effectivePermissions(input.role, input.permissions);

    return this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO users (
            local_id, name, username, password_hash, pin_hash, role,
            permissions, is_active, attendance_code_hash, auto_clockout_hours, warn_hours,
            seller_categories, created_by, updated_by, created_at, updated_at, sync_status
          ) VALUES (
            @local_id, @name, @username, @password_hash, @pin_hash, @role,
            @permissions, 1, @attendance_code_hash, @auto_clockout_hours, @warn_hours,
            @seller_categories, @actor, @actor, @now, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          name: input.name,
          username: input.username,
          password_hash: passwordHash,
          pin_hash: pinHash,
          role: input.role,
          permissions: JSON.stringify(permissions),
          attendance_code_hash: attendanceCodeHash,
          auto_clockout_hours: input.autoClockoutHours ?? null,
          warn_hours: input.warnHours ?? null,
          seller_categories: this.sellerCatsJson(input.sellerCategories),
          actor: actorId,
          now,
        });

      const created = this.findRowById(Number(result.lastInsertRowid))!;
      this.enqueue("user", "CREATED", localId, this.toSyncPayload(created));
      return this.toSafeUser(created);
    });
  }

  update(input: UpdateUserInput, actorId: number | null): SafeUser {
    const existing = this.findRowById(input.id);
    if (!existing) throw new Error("المستخدم غير موجود");

    const role = input.role ?? existing.role;
    // مستخدم قديم بدور اتشال يتعدّل اسمه/بياناته عادي، بس مفيش حد يتحوّل لدور مش متاح
    if (input.role !== undefined && input.role !== existing.role) this.assertAssignableRole(input.role);

    const fields: string[] = ["updated_at = @now", "updated_by = @actor", "sync_status = 'pending'"];
    const params: Record<string, unknown> = {
      id: input.id,
      now: this.now(),
      actor: actorId,
    };

    if (input.name !== undefined) {
      fields.push("name = @name");
      params.name = input.name;
    }
    if (input.username !== undefined) {
      fields.push("username = @username");
      params.username = input.username;
    }
    if (input.role !== undefined) {
      fields.push("role = @role");
      params.role = input.role;
    }
    if (input.password) {
      fields.push("password_hash = @password_hash");
      params.password_hash = hashPassword(input.password);
    }
    if (input.pin) {
      fields.push("pin_hash = @pin_hash");
      params.pin_hash = hashPin(input.pin);
    }
    if (input.permissions !== undefined || input.role !== undefined) {
      const merged = effectivePermissions(role, {
        ...this.parsePermissions(existing.permissions),
        ...(input.permissions ?? {}),
      });
      fields.push("permissions = @permissions");
      params.permissions = JSON.stringify(merged);
    }
    // حدود الحضور لكل موظف (تسمح بـ null = ارجع للقيمة العامة)
    if (input.autoClockoutHours !== undefined) {
      fields.push("auto_clockout_hours = @auto_clockout_hours");
      params.auto_clockout_hours = input.autoClockoutHours;
    }
    if (input.warnHours !== undefined) {
      fields.push("warn_hours = @warn_hours");
      params.warn_hours = input.warnHours;
    }
    // فئات البائع (null = عام)
    if (input.sellerCategories !== undefined) {
      fields.push("seller_categories = @seller_categories");
      params.seller_categories = this.sellerCatsJson(input.sellerCategories);
    }

    return this.transaction(() => {
      this.db
        .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = @id`)
        .run(params);

      const updated = this.findRowById(input.id)!;
      this.enqueue("user", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return this.toSafeUser(updated);
    });
  }

  deactivate(id: number, actorId: number | null): boolean {
    const existing = this.findRowById(id);
    if (!existing) throw new Error("المستخدم غير موجود");
    if (existing.role === "owner") {
      throw new Error("لا يمكن تعطيل المالك");
    }

    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE users
           SET is_active = 0, updated_at = @now, updated_by = @actor, sync_status = 'pending'
           WHERE id = @id`
        )
        .run({ id, now: this.now(), actor: actorId });

      const updated = this.findRowById(id)!;
      this.enqueue("user", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return true;
    });
  }

  reactivate(id: number, actorId: number | null): boolean {
    const existing = this.findRowById(id);
    if (!existing) throw new Error("المستخدم غير موجود");

    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE users
           SET is_active = 1, updated_at = @now, updated_by = @actor, sync_status = 'pending'
           WHERE id = @id`
        )
        .run({ id, now: this.now(), actor: actorId });

      const updated = this.findRowById(id)!;
      this.enqueue("user", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return true;
    });
  }

  verifyPassword(username: string, password: string): SafeUser | null {
    const row = this.findRowByUsername(username);
    if (!row || !row.password_hash) return null;
    if (!canLogin(row.role)) return null; // موظف/ديليفري مالهمش دخول
    if (!verifyPasswordHash(password, row.password_hash)) return null;
    this.touchLastLogin(row.id);
    return this.toSafeUser({ ...row, last_login_at: this.now() });
  }

  verifyPin(userId: number, pin: string): SafeUser | null {
    const row = this.findRowById(userId);
    if (!row || row.is_active !== 1 || !row.pin_hash) return null;
    if (!canLogin(row.role)) return null; // موظف/ديليفري مالهمش دخول
    if (!verifyPinHash(pin, row.pin_hash)) return null;
    this.touchLastLogin(row.id);
    return this.toSafeUser({ ...row, last_login_at: this.now() });
  }

  changePassword(userId: number, newPassword: string, actorId: number | null): boolean {
    const row = this.findRowById(userId);
    if (!row) throw new Error("المستخدم غير موجود");
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE users SET password_hash = @hash, updated_at = @now, updated_by = @actor, sync_status = 'pending'
           WHERE id = @id`
        )
        .run({ id: userId, hash: hashPassword(newPassword), now: this.now(), actor: actorId });
      const updated = this.findRowById(userId)!;
      this.enqueue("user", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return true;
    });
  }

  // تعيين/تغيير كود الحضور (بديل البصمة) — 5 أرقام فريدة
  setAttendanceCode(userId: number, code: string, actorId: number | null): boolean {
    const row = this.findRowById(userId);
    if (!row) throw new Error("المستخدم غير موجود");
    this.assertValidCode(code);
    this.assertCodeUnique(code, userId);
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE users SET attendance_code_hash = @hash, updated_at = @now, updated_by = @actor, sync_status = 'pending'
           WHERE id = @id`
        )
        .run({ id: userId, hash: hashPin(code), now: this.now(), actor: actorId });
      const updated = this.findRowById(userId)!;
      this.enqueue("user", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return true;
    });
  }

  changePin(userId: number, newPin: string, actorId: number | null): boolean {
    const row = this.findRowById(userId);
    if (!row) throw new Error("المستخدم غير موجود");
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE users SET pin_hash = @hash, updated_at = @now, updated_by = @actor, sync_status = 'pending'
           WHERE id = @id`
        )
        .run({ id: userId, hash: hashPin(newPin), now: this.now(), actor: actorId });
      const updated = this.findRowById(userId)!;
      this.enqueue("user", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return true;
    });
  }

  private touchLastLogin(id: number): void {
    const now = this.now();
    this.db
      .prepare("UPDATE users SET last_login_at = @now, sync_status = 'pending' WHERE id = @id")
      .run({ id, now });
    // وقت آخر دخول بيتزامن كمان (للتحليل على الويب)
    const row = this.findRowById(id);
    if (row) {
      this.enqueue("user", "UPDATED", row.local_id, this.toSyncPayload(row));
    }
  }

  private parsePermissions(raw: string): Record<string, boolean> {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  // الـ payload المرسل للسيرفر — بدون hashes حساسة
  private toSyncPayload(row: User) {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      username: row.username,
      role: row.role,
      permissions: this.parsePermissions(row.permissions),
      is_active: row.is_active === 1,
      last_login_at: row.last_login_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ===== الملف الشخصي: تغيير المستخدم لكلمة سره (بالتحقق من القديمة) =====
  changeOwnPassword(userId: number, oldPassword: string, newPassword: string): void {
    const row = this.findRowById(userId);
    if (!row) throw new Error("المستخدم غير موجود");
    if (!newPassword || newPassword.length < 4) {
      throw new Error("كلمة السر الجديدة لازم 4 أحرف على الأقل");
    }
    // لو عنده كلمة سر، لازم القديمة تكون صح
    if (row.password_hash && !verifyPasswordHash(oldPassword, row.password_hash)) {
      throw new Error("كلمة السر الحالية غير صحيحة");
    }
    this.db
      .prepare("UPDATE users SET password_hash = @h, updated_at = @now WHERE id = @id")
      .run({ id: userId, h: hashPassword(newPassword), now: this.now() });
  }

}

export const usersRepository = new UsersRepository();
