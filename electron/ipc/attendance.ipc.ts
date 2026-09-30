import { ipcMain } from "electron";
import { attendanceRepository } from "../repositories/attendance.repository";
import { auditRepository } from "../repositories/audit.repository";
import { usersRepository } from "../repositories/users.repository";
import { getCurrentActor } from "./session";
import type { IpcResult } from "../../types/ipc.types";
import type {
  ClockInput,
  AttendanceQuery,
  UpdateAttendanceLogInput,
} from "../../shared/management";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

function actorName(): string {
  const actor = getCurrentActor();
  if (actor == null) return "النظام";
  return usersRepository.getById(actor)?.name ?? "النظام";
}

// يتأكد إن الفاعل عنده صلاحية الحضور والانصراف
function requireAttendancePermission(): void {
  const actor = getCurrentActor();
  const user = actor ? usersRepository.getById(actor) : null;
  if (!user || !user.permissions.canManageAttendance) {
    throw new Error("مالكش صلاحية تسجيل الحضور والانصراف");
  }
}

export function registerAttendanceIpc(): void {
  ipcMain.handle("attendance:clockIn", (_e, input: ClockInput) =>
    handle(() => {
      requireAttendancePermission();
      attendanceRepository.assertUserCode(input.userId, input.code); // كود الموظف لو ليه كود
      const actor = getCurrentActor();
      attendanceRepository.clockIn(input.userId, input.note ?? null, actor);
      const u = usersRepository.getById(input.userId);
      auditRepository.log({
        userId: actor ?? input.userId,
        userName: actorName(),
        action: `تسجيل حضور: ${u?.name ?? input.userId}`,
        entityType: "attendance",
        entityId: input.userId,
      });
      return true;
    })
  );

  ipcMain.handle("attendance:clockOut", (_e, input: ClockInput) =>
    handle(() => {
      requireAttendancePermission();
      attendanceRepository.assertUserCode(input.userId, input.code); // كود الموظف لو ليه كود
      const actor = getCurrentActor();
      attendanceRepository.clockOut(input.userId, input.note ?? null, actor);
      const u = usersRepository.getById(input.userId);
      auditRepository.log({
        userId: actor ?? input.userId,
        userName: actorName(),
        action: `تسجيل انصراف: ${u?.name ?? input.userId}`,
        entityType: "attendance",
        entityId: input.userId,
      });
      return true;
    })
  );

  // تسجيل ذاتي بالكود — مفيش صلاحية مطلوبة (الكود نفسه هو الأمان)
  ipcMain.handle("attendance:clockByCode", (_e, input: { code: string }) =>
    handle(() => {
      const res = attendanceRepository.clockByCode(input.code);
      auditRepository.log({
        userId: res.userId,
        userName: res.name,
        action: `تسجيل ${res.action === "in" ? "حضور" : "انصراف"} ذاتي: ${res.name}`,
        entityType: "attendance",
        entityId: res.userId,
      });
      return res;
    })
  );

  // انصراف تلقائي (المؤقت الخلفي) — بيستدعيه النظام
  ipcMain.handle(
    "attendance:autoClockOut",
    (_e, input: { userId: number; atWarn?: boolean }) =>
      handle(() => {
        const ok = attendanceRepository.autoClockOut(input.userId, input.atWarn);
        if (ok) {
          const u = usersRepository.getById(input.userId);
          auditRepository.log({
            userId: input.userId,
            userName: "النظام",
            action: `انصراف تلقائي: ${u?.name ?? input.userId}`,
            entityType: "attendance",
            entityId: input.userId,
          });
        }
        return ok;
      })
  );

  ipcMain.handle("attendance:getPresentSessions", () =>
    handle(() => attendanceRepository.getPresentSessions())
  );

  ipcMain.handle("attendance:getCurrentStatus", () =>
    handle(() => attendanceRepository.getCurrentStatus())
  );

  ipcMain.handle("attendance:getToday", () =>
    handle(() => attendanceRepository.getToday())
  );

  ipcMain.handle("attendance:getLast30Days", (_e, query: AttendanceQuery) =>
    handle(() => attendanceRepository.getLast30Days(query ?? {}))
  );

  ipcMain.handle("attendance:updateLog", (_e, input: UpdateAttendanceLogInput) =>
    handle(() => {
      requireAttendancePermission();
      const actor = getCurrentActor();
      attendanceRepository.updateLog(input.id, input.timestamp, actor);
      auditRepository.log({
        userId: actor ?? 0,
        userName: actorName(),
        action: `تعديل سجل حضور #${input.id}`,
        entityType: "attendance",
        entityId: input.id,
        newValue: { timestamp: input.timestamp },
      });
      return true;
    })
  );

  ipcMain.handle("attendance:deleteLog", (_e, id: number) =>
    handle(() => {
      requireAttendancePermission();
      const actor = getCurrentActor();
      attendanceRepository.deleteLog(id, actor);
      auditRepository.log({
        userId: actor ?? 0,
        userName: actorName(),
        action: `حذف سجل حضور #${id}`,
        entityType: "attendance",
        entityId: id,
      });
      return true;
    })
  );
}
