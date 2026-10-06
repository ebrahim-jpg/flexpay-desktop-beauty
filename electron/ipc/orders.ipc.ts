import { ipcMain } from "electron";
import { ordersRepository } from "../repositories/orders.repository";
import { settingsRepository } from "../repositories/settings.repository";
import { auditRepository } from "../repositories/audit.repository";
import { usersRepository } from "../repositories/users.repository";
import { getCurrentActor } from "./session";
import { requireReports } from "./access";
import { effectivePermissions } from "../../shared/permissions";
import { formatReceiptNumber } from "../../shared/orders";
import { buildReceiptHtml } from "../lib/receipt-html";
import { printReceipt } from "../lib/printer";
import type { IpcResult } from "../../types/ipc.types";
import type {
  CreateOrderInput,
  CalculateTotalsInput,
  CancelOrderInput,
} from "../../shared/orders";
import type { SafeUser } from "../../types/ipc.types";

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
export function registerOrdersIpc(): void {
  // ⚠️ `orders:create` و`orders:calculateTotals` اتشالوا كـ**قنوات**:
  //   • `orders:create` كان الكاشير هو الوحيد اللي بينداها، والكاشير اتشال.
  //     **والدالة `ordersRepository.create` فاضلة** — حساب الجلسة ماشي عليها
  //     (`gaming.repository.ts → createSessionOrder`).
  //   • `orders:calculateTotals` ماكانش ليها ولا نداء من الواجهة أصلاً.
  // قناة مفتوحة بلا مستخدم = باب بيع بضاعة لسه مفتوح من الـrenderer.
  ipcMain.handle("orders:cancel", (_e, input: CancelOrderInput) =>
    handle(() => {
      const user = requireActor();
      if (!can(user, "canCancelOrder")) {
        throw new Error("مالكش صلاحية إلغاء الطلبات");
      }
      if (!input.reason || !input.reason.trim()) {
        throw new Error("اكتب سبب الإلغاء");
      }
      const before = ordersRepository.getById(input.id);
      const order = ordersRepository.cancel(input.id, input.reason.trim(), user.id);
      auditRepository.log({
        userId: user.id,
        userName: user.name,
        action: `إلغاء طلب ${formatReceiptNumber(order.receipt_number)}`,
        entityType: "order",
        entityId: order.id,
        oldValue: { total: before?.total, status: "paid" },
        newValue: { status: "cancelled", reason: input.reason.trim() },
      });
      return order;
    })
  );

  // قوايم الفواتير المجمّعة = مبيعات اليوم → للمدير/المالك بس (canViewReports).
  // فاتورة بعينها (getById) تفضل لأي حد داخل: سجل مشتريات العميل والإيصال.
  ipcMain.handle("orders:getRecent", (_e, input: { limit?: number }) =>
    handle(() => {
      requireReports();
      return ordersRepository.getRecent(input?.limit ?? 10);
    })
  );

  ipcMain.handle("orders:getByDate", (_e, input: { businessDate: string }) =>
    handle(() => {
      requireReports();
      return ordersRepository.getByDate(input.businessDate);
    })
  );

  ipcMain.handle("orders:getById", (_e, id: number) =>
    handle(() => ordersRepository.getById(id))
  );

  // طباعة الفاتورة صامتة على الطابعة المحددة (يُستدعى تلقائياً بعد البيع)
  ipcMain.handle("orders:printReceipt", (_e, orderId: number) =>
    handleAsync(async () => {
      const order = ordersRepository.getById(orderId);
      if (!order) throw new Error("الطلب غير موجود");
      const settings = settingsRepository.get();
      const html = buildReceiptHtml(order, {
        shopName: settings.shopName,
        receiptHeader: settings.receiptHeader,
        receiptFooter: settings.receiptFooter,
        currencySymbol: settings.currencySymbol,
      });
      return printReceipt(html, settings.printerName);
    })
  );

}
