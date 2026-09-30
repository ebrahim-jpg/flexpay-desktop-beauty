import { ipcMain } from "electron";
import { onlineOrdersRepository } from "../repositories/online-orders.repository";
import { settingsRepository } from "../repositories/settings.repository";
import { printOnlineOrderTicket } from "../lib/printer";
import { getSyncEngine } from "../sync/sync-engine";
import type { IpcResult } from "../../types/ipc.types";

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

// طلبات المتجر الإلكتروني — عرض النهارده + أرشيف + طباعة تذكرة تجهيز + إلغاء.
export function registerOnlineOrdersIpc(): void {
  // فتح شاشة طلبات المتجر = نشاط صريح → رجّع السحب لأسرع فاصل فوراً
  // (الفاصل بيتمدّد لوحده وقت الخمول عشان يوفّر طلبات السيرفر).
  ipcMain.handle("onlineOrders:list", () =>
    handle(() => {
      getSyncEngine()?.resumeFastPull();
      onlineOrdersRepository.purgeOld(); // تنظيف الأقدم من 30 يوم
      return onlineOrdersRepository.listToday();
    })
  );

  ipcMain.handle("onlineOrders:listForDate", (_e, date: string) =>
    handle(() => onlineOrdersRepository.listForDate(date))
  );

  ipcMain.handle("onlineOrders:archiveDays", () =>
    handle(() => onlineOrdersRepository.archiveDays())
  );

  ipcMain.handle("onlineOrders:count", () =>
    handle(() => onlineOrdersRepository.newCount())
  );

  ipcMain.handle("onlineOrders:get", (_e, localId: string) =>
    handle(() => onlineOrdersRepository.getByLocalId(localId))
  );

  ipcMain.handle(
    "onlineOrders:cancel",
    (_e, input: { localId: string; reason?: string | null }) =>
      handle(() => {
        onlineOrdersRepository.cancel(input.localId, input.reason);
        return onlineOrdersRepository.newCount();
      })
  );

  // طباعة تذكرة تجهيز للبائع (من غير أسعار)
  ipcMain.handle("onlineOrders:printTicket", (_e, localId: string) =>
    handleAsync(async () => {
      const order = onlineOrdersRepository.getByLocalId(localId);
      if (!order) throw new Error("الطلب غير موجود");
      const settings = settingsRepository.get();
      // ⚠️ دي **تذكرة مطبخ** مش فاتورة → طابعة المطبخ، ولو مش متظبّطة طابعة
      // الفاتورة (المطعم الصغير بطابعة واحدة). كانت بتطلع على طابعة الفاتورة دايماً.
      const printed = await printOnlineOrderTicket(
        order,
        settings.kitchenPrinterName ?? settings.printerName,
        settings.shopName
      );
      if (printed) onlineOrdersRepository.markTicketPrinted(localId);
      return printed;
    })
  );
}
