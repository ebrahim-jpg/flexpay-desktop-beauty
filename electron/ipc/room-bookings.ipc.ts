import { ipcMain } from "electron";
import { roomBookingsRepository } from "../repositories/room-bookings.repository";
import { gamingRepository } from "../repositories/gaming.repository";
import { auditRepository } from "../repositories/audit.repository";
import { getSyncEngine } from "../sync/sync-engine";
import { requireActor, can } from "./access";
import type { IpcResult, SafeUser } from "../../types/ipc.types";
import type { BookingDTO } from "../../shared/booking";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

/** تشغيل الغرف = اللي يقدر يرد على الحجوزات (نفس صلاحية فتح الجلسات) */
function requirePos(): SafeUser {
  const user = requireActor();
  if (!can(user, "canAccessPOS")) throw new Error("مالكش صلاحية الرد على الحجوزات");
  return user;
}

/** الرفض/الإلغاء بيضيّع زبون — نفس صلاحية إلغاء الفاتورة/الجلسة */
function requireCancel(): SafeUser {
  const user = requirePos();
  if (!can(user, "canCancelOrder")) throw new Error("رفض الحجز للمدير أو المالك بس");
  return user;
}

function logDecision(user: SafeUser, action: string, before: BookingDTO | null, after: BookingDTO) {
  auditRepository.log({
    userId: user.id,
    userName: user.name,
    action,
    entityType: "room_booking",
    entityId: after.id,
    oldValue: before ? { status: before.status } : undefined,
    newValue: {
      status: after.status,
      room: after.room_name,
      starts_at: after.starts_at,
      customer: after.customer_phone,
      reason: after.decision_reason,
    },
  });
}

// ===== طلبات حجز الغرف (الحجز الأونلاين) =====
// ⚠️ الصلاحيات بتتفحص هنا في الـmain — الواجهة بتخفي الأزرار بس.
// ⚠️ الحجز **مايحجزش الغرفة فعلياً**: التأكيد بيدّي تنبيه للموظف، والجلسة مابتتفتحش
// إلا لما هو يدوس «حوّل لجلسة». مفيش أي قفل تلقائي لأي جلسة شغّالة.
export function registerRoomBookingsIpc(): void {
  ipcMain.handle("bookings:list", () =>
    handle(() => {
      requireActor();
      getSyncEngine()?.resumeFastPull(); // فتح الشاشة = رجّع السحب لأسرع فاصل
      roomBookingsRepository.purgeOld();
      return roomBookingsRepository.listToday();
    })
  );

  ipcMain.handle("bookings:upcoming", (_e, input?: { days?: number }) =>
    handle(() => (requireActor(), roomBookingsRepository.listUpcoming(input?.days ?? 7)))
  );

  // اللي شاشة الغرف بتستخدمه للتنبيه (المتأكّد القريب بس)
  ipcMain.handle("bookings:board", () =>
    handle(() => (requireActor(), roomBookingsRepository.activeForBoard()))
  );

  ipcMain.handle("bookings:listForDate", (_e, date: string) =>
    handle(() => (requireActor(), roomBookingsRepository.listForDate(date)))
  );

  ipcMain.handle("bookings:archiveDays", () =>
    handle(() => (requireActor(), roomBookingsRepository.archiveDays()))
  );

  ipcMain.handle("bookings:count", () => handle(() => roomBookingsRepository.pendingCount()));

  /**
   * حجوزات وصل ميعادها ولسه مااتنبّهش عليها — بترجّع **وبتعلّم في نفس النداء**
   * عشان التنبيه يظهر مرة واحدة بس. العلم في الداتابيز فبيعيش بعد إعادة التشغيل.
   */
  ipcMain.handle("bookings:due", () =>
    handle(() => {
      requireActor();
      const due = roomBookingsRepository.dueForAlert();
      if (due.length > 0) roomBookingsRepository.markAlerted(due.map((b) => b.id));
      return due;
    })
  );

  ipcMain.handle("bookings:confirm", (_e, input: { id: number; note?: string | null; table_id?: number | null }) =>
    handle(() => {
      const user = requirePos();
      const before = roomBookingsRepository.getById(input.id);
      // حجز الطاولة: الموظف بيختار الطاولة هنا — حجز الغرفة مابيبعتهاش
      const after = roomBookingsRepository.confirm(input.id, user, input.note ?? null, input.table_id ?? null);
      logDecision(user, `تأكيد حجز ${after.room_name}`, before, after);
      return after;
    })
  );

  ipcMain.handle("bookings:reject", (_e, input: { id: number; reason: string }) =>
    handle(() => {
      const user = requireCancel();
      const before = roomBookingsRepository.getById(input.id);
      const after = roomBookingsRepository.reject(input.id, user, input.reason);
      logDecision(user, `رفض حجز ${after.room_name}`, before, after);
      return after;
    })
  );

  ipcMain.handle("bookings:cancel", (_e, input: { id: number; reason: string }) =>
    handle(() => {
      const user = requireCancel();
      const before = roomBookingsRepository.getById(input.id);
      const after = roomBookingsRepository.cancel(input.id, user, input.reason);
      logDecision(user, `إلغاء حجز ${after.room_name}`, before, after);
      return after;
    })
  );

  ipcMain.handle("bookings:noShow", (_e, id: number) =>
    handle(() => {
      const user = requirePos();
      const before = roomBookingsRepository.getById(id);
      const after = roomBookingsRepository.markNoShow(id, user);
      logDecision(user, `حجز مجاش — ${after.room_name}`, before, after);
      return after;
    })
  );

  /**
   * تحويل الحجز لجلسة — بيفتح جلسة حقيقية بمدة الحجز ويربطهم.
   * ⚠️ لو الغرفة عليها جلسة شغّالة، `openSession` بيرمي من الفهرس الفريد ورسالته
   * بتوصل للموظف زي ما هي — القرار يفضل عنده (ينقل الناس ولا يستنى).
   */
  ipcMain.handle("bookings:convert", (_e, id: number) =>
    handle(() => {
      const user = requirePos();
      const booking = roomBookingsRepository.getById(id);
      if (!booking) throw new Error("الحجز مش موجود");
      if (booking.room_id == null) {
        throw new Error("أكّد الحجز واختار الطاولة الأول");
      }
      if (booking.status !== "confirmed" && booking.status !== "new") {
        throw new Error("الحجز ده اتقفل خلاص");
      }
      const session = gamingRepository.openSession(
        {
          room_id: booking.room_id,
          notes: [booking.customer_name, booking.notes, booking.confirm_note]
            .filter(Boolean)
            .join(" · ") || null,
        },
        user
      );
      const after = roomBookingsRepository.attachSession(id, session.id, user);
      logDecision(user, `تحويل حجز لجلسة — ${after.room_name}`, booking, after);
      return { booking: after, session };
    })
  );
}
