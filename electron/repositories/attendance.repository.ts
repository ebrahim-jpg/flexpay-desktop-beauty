import { BaseRepository } from "./base.repository";
import { verifyPinHash } from "../lib/crypto";
import { businessDateKey, shiftDateKey } from "../../shared/business-day";
import type { AttendanceLogRow } from "../../types/database.types";
import type {
  StaffStatusDTO,
  AttendanceRowDTO,
  AttendanceLogDTO,
  AttendanceQuery,
  AttendanceType,
  ClockByCodeResult,
  PresentSessionDTO,
} from "../../shared/management";
import type { Role } from "../../shared/permissions";

export class AttendanceRepository extends BaseRepository {
  private businessDayStart(): number {
    const row = this.db
      .prepare("SELECT business_day_start FROM settings WHERE id = 1")
      .get() as { business_day_start: number } | undefined;
    return row?.business_day_start ?? 0;
  }

  private today(): string {
    return businessDateKey(new Date(), this.businessDayStart());
  }

  // آخر حدث للموظف (أي تاريخ) — لتحديد إن كان حاضر دلوقتي
  private lastEvent(userId: number): AttendanceLogRow | null {
    const row = this.db
      .prepare(
        "SELECT * FROM attendance_logs WHERE user_id = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1"
      )
      .get(userId) as AttendanceLogRow | undefined;
    return row ?? null;
  }

  private findLog(id: number): AttendanceLogRow | null {
    const row = this.db
      .prepare("SELECT * FROM attendance_logs WHERE id = ? AND is_deleted = 0")
      .get(id) as AttendanceLogRow | undefined;
    return row ?? null;
  }

  // تعديل وقت سجل. القاعدة: اليوم التجاري للجلسة بيتحدد بالحضور، والانصراف بيتبعه.
  updateLog(id: number, timestamp: string, actorId: number | null): void {
    const log = this.findLog(id);
    if (!log) throw new Error("السجل غير موجود");

    if (log.type === "clock_out") {
      // الانصراف بيفضل في يوم الحضور بتاعه — نغيّر الوقت بس، اليوم التجاري ثابت
      this.applyLogUpdate(id, timestamp, log.business_date, actorId);
      return;
    }

    // حضور: نعيد حساب اليوم التجاري من الوقت الجديد
    const bizDate = businessDateKey(new Date(timestamp), this.businessDayStart());
    this.applyLogUpdate(id, timestamp, bizDate, actorId);

    // ونحرّك الانصراف المرتبط بنفس الجلسة لنفس اليوم (الأحداث بتتبادل حضور→انصراف)
    const pairedOut = this.db
      .prepare(
        "SELECT * FROM attendance_logs WHERE user_id = ? AND id > ? AND is_deleted = 0 ORDER BY id ASC LIMIT 1"
      )
      .get(log.user_id, id) as AttendanceLogRow | undefined;
    if (
      pairedOut &&
      pairedOut.type === "clock_out" &&
      pairedOut.business_date !== bizDate
    ) {
      this.applyLogUpdate(pairedOut.id, pairedOut.timestamp, bizDate, actorId);
    }
  }

  // يطبّق تعديل صف واحد (وقت + يوم تجاري) ويضيفه لطابور المزامنة
  private applyLogUpdate(
    id: number,
    timestamp: string,
    businessDate: string,
    actorId: number | null
  ): void {
    this.db
      .prepare(
        `UPDATE attendance_logs SET timestamp = @ts, business_date = @biz,
         updated_by = @actor, updated_at = @now, sync_status = 'pending' WHERE id = @id`
      )
      .run({ id, ts: timestamp, biz: businessDate, actor: actorId, now: this.now() });
    const updated = this.findLog(id)!;
    this.enqueue("attendance", "UPDATED", updated.local_id, {
      local_id: updated.local_id,
      user_id: updated.user_id,
      type: updated.type,
      timestamp: updated.timestamp,
      business_date: updated.business_date,
    });
  }

  deleteLog(id: number, actorId: number | null): void {
    const log = this.findLog(id);
    if (!log) throw new Error("السجل غير موجود");
    this.db
      .prepare(
        `UPDATE attendance_logs SET is_deleted = 1, deleted_by = @actor, deleted_at = @now, sync_status = 'pending' WHERE id = @id`
      )
      .run({ id, actor: actorId, now: this.now() });
    this.enqueue("attendance", "DELETED", log.local_id, { local_id: log.local_id });
  }

  isPresent(userId: number): boolean {
    const last = this.lastEvent(userId);
    return last?.type === "clock_in";
  }

  private insert(
    userId: number,
    userName: string,
    type: AttendanceType,
    note: string | null,
    actorId: number | null,
    businessDate?: string
  ): void {
    const localId = this.newLocalId();
    const ts = this.now();
    // الانصراف بيرث اليوم التجاري بتاع الحضور المفتوح (عشان الجلسة متتقطعش لو عدّت الحاجز)
    const bizDate = businessDate ?? this.today();
    this.db
      .prepare(
        `INSERT INTO attendance_logs (
          local_id, user_id, user_name, type, timestamp, business_date, note, created_by, sync_status
        ) VALUES (
          @local_id, @user_id, @user_name, @type, @ts, @biz, @note, @actor, 'pending'
        )`
      )
      .run({
        local_id: localId,
        user_id: userId,
        user_name: userName,
        type,
        ts,
        biz: bizDate,
        note,
        actor: actorId,
      });
    this.enqueue("attendance", "CREATED", localId, {
      local_id: localId,
      user_id: userId,
      user_name: userName,
      type,
      timestamp: ts,
      business_date: bizDate,
      note,
    });
  }

  private userName(userId: number): string {
    const row = this.db
      .prepare("SELECT name FROM users WHERE id = ?")
      .get(userId) as { name: string } | undefined;
    return row?.name ?? "موظف";
  }

  clockIn(userId: number, note: string | null, actorId: number | null): void {
    if (this.isPresent(userId)) throw new Error("الموظف مسجّل حضور بالفعل");
    this.insert(userId, this.userName(userId), "clock_in", note, actorId);
  }

  clockOut(userId: number, note: string | null, actorId: number | null): void {
    const last = this.lastEvent(userId);
    if (!last || last.type !== "clock_in") throw new Error("الموظف مش مسجّل حضور");
    // الانصراف يتسجّل في نفس اليوم التجاري بتاع الحضور — حتى لو عدّى منتصف اليوم التجاري
    this.insert(
      userId,
      this.userName(userId),
      "clock_out",
      note,
      actorId,
      last.business_date
    );
  }

  // ===== التسجيل الذاتي بالكود (بديل البصمة) =====
  // الموظف بيكتب كوده → نعرفه من الكود → toggle (حاضر→انصراف، غائب→حضور).
  // مفيش اختيار موظف من حد تاني → يمنع أي تلاعب.
  clockByCode(code: string): ClockByCodeResult {
    if (!/^\d{5}$/.test(code)) throw new Error("الكود لازم يكون 5 أرقام");
    const users = this.db
      .prepare(
        "SELECT id, name, attendance_code_hash FROM users WHERE is_active = 1 AND is_deleted = 0 AND attendance_code_hash IS NOT NULL"
      )
      .all() as { id: number; name: string; attendance_code_hash: string }[];
    const match = users.find((u) => verifyPinHash(code, u.attendance_code_hash));
    if (!match) throw new Error("كود غير صحيح");

    const present = this.isPresent(match.id);
    if (present) this.clockOut(match.id, null, match.id);
    else this.clockIn(match.id, null, match.id);

    return { userId: match.id, name: match.name, action: present ? "out" : "in", time: this.now() };
  }

  // انصراف تلقائي (للمؤقت الخلفي) — actor = النظام
  autoClockOut(userId: number, atWarn?: boolean): boolean {
    if (!this.isPresent(userId)) return false;
    this.clockOut(userId, atWarn ? "انصراف تلقائي (مش موجود)" : "انصراف تلقائي (تجاوز الحد)", null);
    return true;
  }

  // القيم العامة للحدود من الإعدادات (0 = متعطّل)
  private globalLimits(): { max: number; warn: number } {
    const row = this.db
      .prepare("SELECT auto_clockout_hours, attendance_warn_hours FROM settings WHERE id = 1")
      .get() as { auto_clockout_hours: number | null; attendance_warn_hours: number | null } | undefined;
    return { max: row?.auto_clockout_hours ?? 0, warn: row?.attendance_warn_hours ?? 0 };
  }

  // الحاضرون الآن + حدودهم الفعّالة (تخصيص الموظف يغلب القيمة العامة)
  getPresentSessions(): PresentSessionDTO[] {
    const limits = this.globalLimits();
    const users = this.db
      .prepare(
        "SELECT id, name, auto_clockout_hours, warn_hours FROM users WHERE is_active = 1 AND is_deleted = 0"
      )
      .all() as {
      id: number;
      name: string;
      auto_clockout_hours: number | null;
      warn_hours: number | null;
    }[];
    const out: PresentSessionDTO[] = [];
    for (const u of users) {
      const last = this.lastEvent(u.id);
      if (last?.type !== "clock_in") continue;
      out.push({
        user_id: u.id,
        name: u.name,
        since: last.timestamp,
        maxHours: u.auto_clockout_hours ?? limits.max,
        warnHours: u.warn_hours ?? limits.warn,
      });
    }
    return out;
  }

  // يتأكد من كود الموظف قبل تسجيل يدوي (لو الموظف ليه كود). مفيش كود → يعدّي عادي.
  assertUserCode(userId: number, code?: string | null): void {
    const row = this.db
      .prepare("SELECT attendance_code_hash FROM users WHERE id = ? AND is_deleted = 0")
      .get(userId) as { attendance_code_hash: string | null } | undefined;
    const hash = row?.attendance_code_hash;
    if (!hash) return;
    if (!code || !verifyPinHash(code, hash)) {
      throw new Error("الكود السري للموظف غير صحيح");
    }
  }

  getCurrentStatus(): StaffStatusDTO[] {
    const users = this.db
      .prepare(
        "SELECT id, name, role, attendance_code_hash FROM users WHERE is_active = 1 AND is_deleted = 0 ORDER BY role = 'owner' DESC, name ASC"
      )
      .all() as { id: number; name: string; role: Role; attendance_code_hash: string | null }[];

    return users.map((u) => {
      const last = this.lastEvent(u.id);
      const present = last?.type === "clock_in";
      return {
        user_id: u.id,
        name: u.name,
        role: u.role,
        present,
        since: present ? last!.timestamp : null,
        hasCode: !!u.attendance_code_hash,
      };
    });
  }

  getToday(): AttendanceLogDTO[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM attendance_logs WHERE business_date = ? AND is_deleted = 0 ORDER BY id DESC"
      )
      .all(this.today()) as AttendanceLogRow[];
    return rows.map((r) => this.toLogDTO(r));
  }

  private toLogDTO(r: AttendanceLogRow): AttendanceLogDTO {
    return {
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name,
      type: r.type as AttendanceType,
      timestamp: r.timestamp,
      business_date: r.business_date,
      note: r.note,
    };
  }

  // آخر 30 يوم — مجمّعة في صفوف (حضور/انصراف لكل موظف لكل يوم)
  getLast30Days(query: AttendanceQuery): AttendanceRowDTO[] {
    const today = this.today();
    const floor = shiftDateKey(today, -29);
    const from = query.dateFrom && query.dateFrom > floor ? query.dateFrom : floor;
    const to = query.dateTo && query.dateTo < today ? query.dateTo : today;

    const params: unknown[] = [from, to];
    let where = "business_date >= ? AND business_date <= ? AND is_deleted = 0";
    if (query.userId) {
      where += " AND user_id = ?";
      params.push(query.userId);
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM attendance_logs WHERE ${where}
         ORDER BY user_id ASC, business_date ASC, id ASC`
      )
      .all(...params) as AttendanceLogRow[];

    // تجميع حسب user + business_date
    const map = new Map<string, AttendanceRowDTO>();
    for (const r of rows) {
      const key = `${r.user_id}|${r.business_date}`;
      let row = map.get(key);
      if (!row) {
        row = {
          user_id: r.user_id,
          user_name: r.user_name,
          business_date: r.business_date,
          clock_in: null,
          clock_out: null,
          clock_in_id: null,
          clock_out_id: null,
          duration_minutes: null,
        };
        map.set(key, row);
      }
      if (r.type === "clock_in" && !row.clock_in) {
        row.clock_in = r.timestamp;
        row.clock_in_id = r.id;
      }
      if (r.type === "clock_out") {
        row.clock_out = r.timestamp;
        row.clock_out_id = r.id;
      }
    }

    const result = Array.from(map.values()).map((row) => {
      if (row.clock_in && row.clock_out) {
        const mins = Math.max(
          0,
          Math.round(
            (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) /
              60000
          )
        );
        row.duration_minutes = mins;
      }
      return row;
    });

    // الأحدث أولاً
    result.sort((a, b) =>
      b.business_date.localeCompare(a.business_date) ||
      a.user_name.localeCompare(b.user_name)
    );
    return result;
  }
}

export const attendanceRepository = new AttendanceRepository();
