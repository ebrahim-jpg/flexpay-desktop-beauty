import { ipcMain } from "electron";
import { syncRepository } from "../repositories/sync.repository";
import { getSyncEngine } from "../sync/sync-engine";
import type { IpcResult } from "../../types/ipc.types";
import type { SyncStatusDTO } from "../../shared/sync";

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

// حالة احتياطية لو المحرك لسه مش متهيّأ
function fallbackStatus(): SyncStatusDTO {
  return {
    state: "disabled",
    configured: false,
    pending: 0,
    synced: 0,
    failed: 0,
    lastSyncAt: null,
    message: "المزامنة لسه بتتهيّأ...",
  };
}

export function registerSyncIpc(): void {
  ipcMain.handle("sync:getStatus", () =>
    handle(() => getSyncEngine()?.buildStatus() ?? fallbackStatus())
  );

  ipcMain.handle("sync:getQueue", () =>
    handle(() => syncRepository.getQueueList(50))
  );

  ipcMain.handle("sync:getLog", () => handle(() => syncRepository.getLog(50)));

  ipcMain.handle("sync:retryFailed", () =>
    handle(() => {
      const count = syncRepository.retryFailed();
      // شغّل مزامنة فورية في الخلفية (لو المحرك مفعّل)
      void getSyncEngine()?.syncNow();
      return count;
    })
  );

  ipcMain.handle("sync:syncNow", () =>
    handleAsync(async () => {
      const engine = getSyncEngine();
      if (!engine) return fallbackStatus();
      return engine.syncNow();
    })
  );
}
