import { ipcMain } from "electron";
import { settingsRepository } from "../repositories/settings.repository";
import { activateRequest } from "../sync/activation-client";
import { reactivate } from "../sync/reactivate";
import { getSyncEngine } from "../sync/sync-engine";
import type { IpcResult } from "../../types/ipc.types";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "حصل خطأ غير متوقع" };
  }
}

async function handleAsync<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "حصل خطأ غير متوقع" };
  }
}

export function registerActivationIpc(): void {
  ipcMain.handle("activation:status", () =>
    handle(() => {
      const s = settingsRepository.getActivationState();
      return { activated: s.activated, serverUrl: s.serverUrl };
    })
  );

  ipcMain.handle(
    "activation:activate",
    (_e, input: { code: string; serverUrl: string }) =>
      handleAsync(async () => {
        const code = (input?.code ?? "").trim();
        const serverUrl = (input?.serverUrl ?? "").trim().replace(/\/+$/, "");
        if (!code) throw new Error("اكتب كود التفعيل");
        if (!/^https?:\/\//.test(serverUrl)) throw new Error("رابط السيرفر غير صحيح");

        const creds = await activateRequest(serverUrl, code);
        settingsRepository.setActivation({
          shopCode: creds.shopCode,
          secretKey: creds.secretKey,
          serverUrl,
        });
        // نبدأ المزامنة فوراً بعد التفعيل
        void getSyncEngine()?.syncNow();
        return { activated: true, shopName: creds.shopName };
      })
  );

  // إعادة تفعيل من شاشة الإعدادات (الجهاز اتغيّر / الهوية محتاجة تدوير).
  // الرابط بيتقرا من الإعدادات المخزّنة مش من المستخدم — الكود هو المدخل الوحيد.
  ipcMain.handle("activation:reactivate", (_e, input: { code: string }) =>
    handleAsync(async () => {
      const result = await reactivate(input?.code ?? "", {
        getStoredShopCode: () => settingsRepository.get().shopCode,
        getServerUrl: () => settingsRepository.getSyncServerUrl(),
        request: activateRequest,
        apply: (creds) => settingsRepository.setActivation(creds),
      });
      void getSyncEngine()?.syncNow();
      return result;
    })
  );
}
