import { ipcMain } from "electron";
import { usersRepository } from "../repositories/users.repository";
import { auditRepository } from "../repositories/audit.repository";
import { getCurrentActor, setCurrentActor } from "./session";
import { ROLE_LABELS } from "../../shared/permissions";
import type {
  IpcResult,
  CreateUserInput,
  UpdateUserInput,
  VerifyPasswordInput,
  VerifyPinInput,
  ChangePasswordInput,
  ChangePinInput,
  AuditLogInput,
} from "../../types/ipc.types";

// غلاف موحد: مفيش throw عبر حدود الـ IPC — بنرجع نتيجة واضحة
function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

export function registerUsersIpc(): void {
  ipcMain.handle("session:setActor", (_e, userId: number | null) =>
    handle(() => {
      setCurrentActor(userId);
      return true;
    })
  );

  ipcMain.handle("users:getAll", () =>
    handle(() => usersRepository.getAllActive())
  );

  ipcMain.handle("users:getActiveCashiers", () =>
    handle(() => usersRepository.getActiveCashiers())
  );

  ipcMain.handle("users:getById", (_e, id: number) =>
    handle(() => usersRepository.getById(id))
  );

  ipcMain.handle("users:create", (_e, input: CreateUserInput) =>
    handle(() => {
      const actor = getCurrentActor();
      // دور "مالك" يعيّنه المالك فقط
      if (input.role === "owner" && actorRole(actor) !== "owner") {
        throw new Error("دور المالك يقدر يعيّنه المالك فقط");
      }
      if (usersRepository.usernameExists(input.username)) {
        throw new Error("اسم المستخدم مستخدم بالفعل");
      }
      const created = usersRepository.create(input, actor);
      auditRepository.log({
        userId: actor ?? created.id,
        userName: actorName(actor),
        action: `إضافة مستخدم: ${created.name} (${ROLE_LABELS[created.role]})`,
        entityType: "user",
        entityId: created.id,
        newValue: { name: created.name, username: created.username, role: created.role },
      });
      return created;
    })
  );

  ipcMain.handle("users:update", (_e, input: UpdateUserInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const before = usersRepository.getById(input.id);
      // حساب المالك يعدّله المالك فقط، ودور "مالك" يعيّنه المالك فقط
      if (
        (before?.role === "owner" || input.role === "owner") &&
        actorRole(actor) !== "owner"
      ) {
        throw new Error("حساب المالك يعدّله المالك فقط");
      }
      if (input.username && usersRepository.usernameExists(input.username, input.id)) {
        throw new Error("اسم المستخدم مستخدم بالفعل");
      }
      const updated = usersRepository.update(input, actor);
      auditRepository.log({
        userId: actor ?? updated.id,
        userName: actorName(actor),
        action: `تعديل مستخدم: ${updated.name}`,
        entityType: "user",
        entityId: updated.id,
        oldValue: before,
        newValue: updated,
      });
      return updated;
    })
  );

  ipcMain.handle("users:deactivate", (_e, id: number) =>
    handle(() => {
      const actor = getCurrentActor();
      const before = usersRepository.getById(id);
      const ok = usersRepository.deactivate(id, actor);
      auditRepository.log({
        userId: actor ?? id,
        userName: actorName(actor),
        action: `تعطيل مستخدم: ${before?.name ?? id}`,
        entityType: "user",
        entityId: id,
        oldValue: before,
      });
      return ok;
    })
  );

  ipcMain.handle("users:reactivate", (_e, id: number) =>
    handle(() => {
      const actor = getCurrentActor();
      const before = usersRepository.getById(id);
      const ok = usersRepository.reactivate(id, actor);
      auditRepository.log({
        userId: actor ?? id,
        userName: actorName(actor),
        action: `إعادة تفعيل مستخدم: ${before?.name ?? id}`,
        entityType: "user",
        entityId: id,
        oldValue: before,
      });
      return ok;
    })
  );

  ipcMain.handle("users:verifyPassword", (_e, input: VerifyPasswordInput) =>
    handle(() => {
      const user = usersRepository.verifyPassword(input.username, input.password);
      if (user) {
        setCurrentActor(user.id);
        auditRepository.log({
          userId: user.id,
          userName: user.name,
          action: "تسجيل دخول",
          entityType: "user",
          entityId: user.id,
        });
      }
      return user;
    })
  );

  ipcMain.handle("users:verifyPIN", (_e, input: VerifyPinInput) =>
    handle(() => {
      const user = usersRepository.verifyPin(input.userId, input.pin);
      if (user) {
        setCurrentActor(user.id);
        auditRepository.log({
          userId: user.id,
          userName: user.name,
          action: "تسجيل دخول (PIN)",
          entityType: "user",
          entityId: user.id,
        });
      }
      return user;
    })
  );

  ipcMain.handle("users:changePassword", (_e, input: ChangePasswordInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const ok = usersRepository.changePassword(input.userId, input.newPassword, actor);
      auditRepository.log({
        userId: actor ?? input.userId,
        userName: actorName(actor),
        action: "تغيير الباسورد",
        entityType: "user",
        entityId: input.userId,
      });
      return ok;
    })
  );

  ipcMain.handle("users:changePIN", (_e, input: ChangePinInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const ok = usersRepository.changePin(input.userId, input.newPin, actor);
      auditRepository.log({
        userId: actor ?? input.userId,
        userName: actorName(actor),
        action: "تغيير الـ PIN",
        entityType: "user",
        entityId: input.userId,
      });
      return ok;
    })
  );

  ipcMain.handle(
    "users:setAttendanceCode",
    (_e, input: { userId: number; code: string }) =>
      handle(() => {
        const actor = getCurrentActor();
        const ok = usersRepository.setAttendanceCode(input.userId, input.code, actor);
        auditRepository.log({
          userId: actor ?? input.userId,
          userName: actorName(actor),
          action: "تعيين كود حضور",
          entityType: "user",
          entityId: input.userId,
        });
        return ok;
      })
  );

  ipcMain.handle("audit:log", (_e, input: AuditLogInput) =>
    handle(() => {
      auditRepository.log(input);
      return true;
    })
  );

  // ===== الملف الشخصي (المستخدم الحالي) =====
  ipcMain.handle(
    "profile:changePassword",
    (_e, input: { oldPassword: string; newPassword: string }) =>
      handle(() => {
        const actor = getCurrentActor();
        if (actor == null) throw new Error("مفيش مستخدم مسجّل دخول");
        usersRepository.changeOwnPassword(actor, input.oldPassword, input.newPassword);
        auditRepository.log({
          userId: actor,
          userName: actorName(actor),
          action: "غيّر كلمة سره",
          entityType: "user",
          entityId: actor,
        });
        return true;
      })
  );

  ipcMain.handle("profile:getShortcuts", () =>
    handle(() => {
      const actor = getCurrentActor();
      if (actor == null) throw new Error("مفيش مستخدم مسجّل دخول");
      return usersRepository.getShortcuts(actor);
    })
  );

  ipcMain.handle(
    "profile:setShortcut",
    (_e, input: { key: string; product_id: number }) =>
      handle(() => {
        const actor = getCurrentActor();
        if (actor == null) throw new Error("مفيش مستخدم مسجّل دخول");
        usersRepository.setShortcut(actor, input.key, input.product_id);
        return true;
      })
  );

  ipcMain.handle("profile:deleteShortcut", (_e, key: string) =>
    handle(() => {
      const actor = getCurrentActor();
      if (actor == null) throw new Error("مفيش مستخدم مسجّل دخول");
      usersRepository.deleteShortcut(actor, key);
      return true;
    })
  );
}

// اسم المستخدم الفاعل للسجل — يقرأه من قاعدة البيانات
function actorName(actorId: number | null): string {
  if (actorId == null) return "النظام";
  const u = usersRepository.getById(actorId);
  return u?.name ?? "النظام";
}

// دور المستخدم الفاعل — للتحقق من صلاحيات الإدارة
function actorRole(actorId: number | null): string | null {
  if (actorId == null) return null;
  return usersRepository.getById(actorId)?.role ?? null;
}
