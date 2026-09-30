import { ipcMain, net } from "electron";
import { settingsRepository } from "../repositories/settings.repository";
import { auditRepository } from "../repositories/audit.repository";
import { usersRepository } from "../repositories/users.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { getCurrentActor } from "./session";
import { listPrinters, testPrint } from "../lib/printer";
import type { IpcResult, AuditLogInput } from "../../types/ipc.types";
import {
  redactSettings,
  type UpdateSettingsInput,
  type SyncTestResult,
} from "../../shared/settings";

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

function logSettingsChange(action: string, extra?: Partial<AuditLogInput>): void {
  const actor = getCurrentActor();
  const actorName = actor ? usersRepository.getById(actor)?.name : null;
  auditRepository.log({
    userId: actor ?? 0,
    userName: actorName ?? "النظام",
    action,
    entityType: "settings",
    entityId: 1,
    ...extra,
  });
}

export function registerSettingsIpc(): void {
  ipcMain.handle("settings:get", () =>
    handle(() => settingsRepository.get())
  );

  ipcMain.handle("settings:getPaymentMethods", () =>
    handle(() => settingsRepository.getEnabledPaymentMethods())
  );

  ipcMain.handle("settings:update", (_e, input: UpdateSettingsInput) =>
    handle(() => {
      const before = settingsRepository.get();
      const updated = settingsRepository.update(input, getCurrentActor());
      // لو اتغير إعداد الإخفاء التلقائي، صالح حالة توفر كل المنتجات فوراً
      if (
        input.autoHideOutOfStock !== undefined &&
        input.autoHideOutOfStock !== before.autoHideOutOfStock
      ) {
        inventoryRepository.applyAutoHideSetting(
          input.autoHideOutOfStock,
          getCurrentActor()
        );
      }
      // ⚠️ منقّاة: السجل بيتخزّن plain في قاعدة المحل، وكان بيتكتب فيه المفتاح
      // السري في **كل** تغيير إعدادات — يعني المفتاح القديم يفضل مقروء حتى
      // بعد ما يتدوّر.
      logSettingsChange("تغيير الإعدادات", {
        oldValue: redactSettings(before),
        newValue: redactSettings(updated),
      });
      return updated;
    })
  );

  ipcMain.handle("settings:saveLogo", (_e, input: { dataUrl: string }) =>
    handle(() => {
      const updated = settingsRepository.saveLogo(
        input.dataUrl,
        getCurrentActor()
      );
      logSettingsChange("تغيير شعار المحل");
      return updated;
    })
  );

  ipcMain.handle("settings:removeLogo", () =>
    handle(() => {
      const updated = settingsRepository.removeLogo(getCurrentActor());
      logSettingsChange("حذف شعار المحل");
      return updated;
    })
  );

  ipcMain.handle("settings:getPrinters", () => handleAsync(() => listPrinters()));

  ipcMain.handle("settings:testPrint", (_e, input: { printerName?: string }) =>
    handleAsync(() => testPrint(input?.printerName))
  );

  ipcMain.handle("settings:testSync", () =>
    handleAsync<SyncTestResult>(() => testSyncConnection())
  );
}

// اختبار الاتصال بسيرفر المزامنة فقط (مفيش إرسال بيانات فعلي — PRD-02)
function testSyncConnection(): Promise<SyncTestResult> {
  const url = settingsRepository.getSyncServerUrl();

  return new Promise<SyncTestResult>((resolve) => {
    if (!url || !/^https?:\/\//.test(url)) {
      resolve({ reachable: false, message: "رابط السيرفر غير صحيح" });
      return;
    }

    let settled = false;
    const finish = (result: SyncTestResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const request = net.request({ method: "GET", url });
      const timeout = setTimeout(() => {
        request.abort();
        finish({ reachable: false, message: "انتهت مهلة الاتصال" });
      }, 8000);

      request.on("response", (response) => {
        clearTimeout(timeout);
        finish({
          reachable: true,
          message: `الاتصال ناجح (HTTP ${response.statusCode})`,
        });
      });

      request.on("error", (err) => {
        clearTimeout(timeout);
        finish({ reachable: false, message: `تعذر الاتصال: ${err.message}` });
      });

      request.end();
    } catch (err) {
      finish({
        reachable: false,
        message:
          err instanceof Error ? `تعذر الاتصال: ${err.message}` : "تعذر الاتصال",
      });
    }
  });
}
