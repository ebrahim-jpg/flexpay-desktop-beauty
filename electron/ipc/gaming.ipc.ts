import { ipcMain } from "electron";
import { gamingRepository } from "../repositories/gaming.repository";
import { auditRepository } from "../repositories/audit.repository";
import { usersRepository } from "../repositories/users.repository";
import { getCurrentActor } from "./session";
import { effectivePermissions } from "../../shared/permissions";
import type { IpcResult, SafeUser } from "../../types/ipc.types";
import type {
  AddSessionItemInput,
  CheckoutSessionInput,
  OpenSessionInput,
  SaveRoomInput,
  SplitCheckoutInput,
} from "../../shared/gaming";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

async function handleAsync<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

function requireActor(): SafeUser {
  const id = getCurrentActor();
  if (id == null) throw new Error("لازم تسجّل دخول الأول");
  const user = usersRepository.getById(id);
  if (!user) throw new Error("المستخدم غير موجود");
  return user;
}

function can(user: SafeUser, key: keyof SafeUser["permissions"]): boolean {
  if (user.role === "owner") return true;
  return !!effectivePermissions(user.role, user.permissions)[key];
}

function requirePos(): SafeUser {
  const user = requireActor();
  if (!can(user, "canAccessPOS")) throw new Error("مالكش صلاحية تشغيل الطاولات");
  return user;
}

/** نفس تدقيق الفاتورة بالحرف — مركز الأمان بيشوف فاتورة الطاولة زي أي فاتورة */
function logOrder(
  user: SafeUser,
  result: { order: { id: number; is_free: boolean; receipt_label: string; total: number; items: unknown[]; payment_method: string; discount_amount: number }; session: { session_label: string } },
  split = false
): void {
  auditRepository.log({
    userId: user.id,
    userName: user.name,
    action: `${result.order.is_free ? "فاتورة مجانية" : "إنشاء طلب"} ${result.order.receipt_label}`,
    entityType: "order",
    entityId: result.order.id,
    newValue: {
      total: result.order.total,
      items_count: result.order.items.length,
      payment_method: result.order.payment_method,
      discount_amount: result.order.discount_amount,
      is_free: result.order.is_free,
      session: result.session.session_label,
      ...(split ? { split: true } : {}),
    },
  });
}

// ===== الطاولات (نسخة «كافيه» بس) =====
// الصلاحيات بتتفحص هنا في الـmain — الواجهة بتخفي الأزرار بس، والحارس الحقيقي هنا.
// ⚠️ مفيش قنوات غرف (مدة/وضع) — الحارس scripts/verify-cafe-no-rooms.js.
export function registerGamingIpc(): void {
  ipcMain.handle("gaming:board", () => handle(() => (requirePos(), gamingRepository.getBoard())));

  // تقرير أداء الحلاقين — **للي معاه تقارير بس** (فيه فلوس وعمولات)
  ipcMain.handle("gaming:stylistPerformance", (_e, input: { from: string; to: string }) =>
    handle(() => {
      const user = requireActor();
      if (!can(user, "canViewReports")) throw new Error("مالكش صلاحية التقارير");
      return gamingRepository.stylistPerformance(input.from, input.to);
    })
  );

  ipcMain.handle("gaming:summary:today", () => handle(() => (requireActor(), gamingRepository.todaySummary())));

  ipcMain.handle("gaming:rooms:list", (_e, input?: { includeInactive?: boolean }) =>
    handle(() => (requireActor(), gamingRepository.listRooms(!!input?.includeInactive)))
  );

  ipcMain.handle("gaming:rooms:save", (_e, input: SaveRoomInput) =>
    handle(() => {
      const user = requireActor();
      if (!can(user, "canManageProducts")) throw new Error("إدارة الطاولات للمدير أو المالك بس");
      const { room, before } = gamingRepository.saveRoom(input, user.id);
      auditRepository.log({
        userId: user.id,
        userName: user.name,
        action: before == null ? `إضافة طاولة ${room.name}` : `تعديل طاولة ${room.name}`,
        entityType: "gaming_room",
        entityId: room.id,
        oldValue: before ?? undefined,
        newValue: room,
      });
      return room;
    })
  );

  ipcMain.handle("gaming:rooms:delete", (_e, id: number) =>
    handle(() => {
      const user = requireActor();
      if (!can(user, "canManageProducts")) throw new Error("إدارة الطاولات للمدير أو المالك بس");
      const room = gamingRepository.deleteRoom(id, user.id);
      auditRepository.log({
        userId: user.id,
        userName: user.name,
        action: `حذف طاولة ${room.name}`,
        entityType: "gaming_room",
        entityId: room.id,
        oldValue: room,
      });
      return true;
    })
  );

  ipcMain.handle("gaming:session:open", (_e, input: OpenSessionInput) =>
    handle(() => {
      const user = requirePos();
      return gamingRepository.openSession(input, { id: user.id, name: user.name });
    })
  );

  ipcMain.handle("gaming:session:setCustomer", (_e, input: { session_id: number; customer_id: number | null }) =>
    handle(() => (requirePos(), gamingRepository.setCustomer(input.session_id, input.customer_id)))
  );

  ipcMain.handle("gaming:session:addItem", (_e, input: AddSessionItemInput) =>
    handle(() => {
      const user = requirePos();
      return gamingRepository.addItem(input, { id: user.id, name: user.name });
    })
  );

  ipcMain.handle("gaming:session:updateItem", (_e, input: { item_id: number; quantity: number }) =>
    handle(() => (requirePos(), gamingRepository.updateItemQuantity(input.item_id, input.quantity)))
  );

  ipcMain.handle("gaming:session:removeItem", (_e, itemId: number) =>
    handle(() => (requirePos(), gamingRepository.removeItem(itemId)))
  );

  ipcMain.handle(
    "gaming:session:quote",
    (_e, input: { session_id: number; discount_type?: "none" | "percentage" | "fixed"; discount_value?: number }) =>
      handle(
        () => (
          requirePos(),
          gamingRepository.quote(input.session_id, input.discount_type ?? "none", input.discount_value ?? 0)
        )
      )
  );

  ipcMain.handle("gaming:session:checkout", (_e, input: CheckoutSessionInput) =>
    handleAsync(async () => {
      const user = requirePos();
      const hasDiscount = input.discount_type !== "none" && input.discount_value > 0;
      if (hasDiscount && !can(user, "canGiveDiscount")) throw new Error("مالكش صلاحية إعطاء خصم");

      // ⚠️ **قرار المالك: كل صنف بياخد تذكرة تجهيز أياً كان.** فلو النادل حاسب
      // وفيه أصناف ماراحتش للمطبخ، بتتطبع **قبل** الفاتورة — مش بتتعدّى بصمت.
      const result = gamingRepository.checkout(input, { id: user.id, name: user.name });
      logOrder(user, result);
      return result;
    })
  );

  ipcMain.handle("gaming:session:cancel", (_e, input: { session_id: number; reason: string }) =>
    handle(() => {
      const user = requirePos();
      // ⚠️ أهم باب سرقة: الطلبات اتقدّمت والحساب اتلغى فالفلوس مالهاش فاتورة.
      // نفس صلاحية إلغاء الطلب — موظف الصالة مايقدرش بدورُه (المدير/المالك بس).
      if (!can(user, "canCancelOrder")) throw new Error("إلغاء الحساب للمدير أو المالك بس");
      const { session, minutes } = gamingRepository.cancelSession(input.session_id, input.reason, {
        id: user.id,
        name: user.name,
      });
      auditRepository.log({
        userId: user.id,
        userName: user.name,
        // «طاولة» في نص الفعل = مركز الأمان على الويب بيعرضه «إلغاء حساب طاولة»
        action: `إلغاء ${session.session_label} — طاولة: ${session.room_name}`,
        entityType: "gaming_session",
        entityId: session.id,
        oldValue: {
          room_name: session.room_name,
          minutes: Math.floor(minutes),
          items_count: session.items.length,
          cancel_reason: session.cancel_reason,
        },
        newValue: { status: "cancelled" },
      });
      return session;
    })
  );

  // ===== نقل · دمج · تقسيم — شغل موظف الصالة العادي (مفيش فلوس بتتلغي) =====
  ipcMain.handle("gaming:session:transfer", (_e, input: { session_id: number; to_room_id: number }) =>
    handle(() => {
      const user = requirePos();
      const before = gamingRepository.getSession(input.session_id);
      const session = gamingRepository.transferSession(input.session_id, input.to_room_id);
      auditRepository.log({
        userId: user.id,
        userName: user.name,
        action: `نقل ${session.session_label} من طاولة ${before?.room_name ?? "—"} إلى ${session.room_name}`,
        entityType: "gaming_session",
        entityId: session.id,
        oldValue: { room_name: before?.room_name ?? null },
        newValue: { room_name: session.room_name },
      });
      return session;
    })
  );

  ipcMain.handle("gaming:session:merge", (_e, input: { from_session_id: number; into_session_id: number }) =>
    handle(() => {
      const user = requirePos();
      const from = gamingRepository.getSession(input.from_session_id);
      const session = gamingRepository.mergeSessions(input.from_session_id, input.into_session_id, {
        id: user.id,
        name: user.name,
      });
      auditRepository.log({
        userId: user.id,
        userName: user.name,
        action: `دمج طاولة ${from?.room_name ?? "—"} في ${session.room_name}`,
        entityType: "gaming_session",
        entityId: session.id,
        oldValue: { room_name: from?.room_name ?? null, session: from?.session_label ?? null },
        newValue: { room_name: session.room_name, session: session.session_label },
      });
      return session;
    })
  );

  ipcMain.handle(
    "gaming:session:quoteSplit",
    (
      _e,
      input: {
        session_id: number;
        lines: SplitCheckoutInput["lines"];
        discount_type?: "none" | "percentage" | "fixed";
        discount_value?: number;
      }
    ) =>
      handle(
        () => (
          requirePos(),
          gamingRepository.quoteSplit(input.session_id, input.lines, input.discount_type ?? "none", input.discount_value ?? 0)
        )
      )
  );

  ipcMain.handle("gaming:session:splitCheckout", (_e, input: SplitCheckoutInput) =>
    handle(() => {
      const user = requirePos();
      const hasDiscount = input.discount_type !== "none" && input.discount_value > 0;
      if (hasDiscount && !can(user, "canGiveDiscount")) throw new Error("مالكش صلاحية إعطاء خصم");
      const result = gamingRepository.splitCheckout(input, { id: user.id, name: user.name });
      logOrder(user, result, true);
      return result;
    })
  );
}
