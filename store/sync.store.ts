"use client";

import { create } from "zustand";
import { ipc, isElectron } from "@/hooks/useIPC";
import type { SyncStatusDTO } from "@/shared/sync";

interface SyncState {
  status: SyncStatusDTO | null;
  pendingCount: number;
  lastSyncAt: string | null;
  setStatus: (s: SyncStatusDTO) => void;
  refresh: () => Promise<void>;
}

export const useSyncStore = create<SyncState>()((set) => ({
  status: null,
  pendingCount: 0,
  lastSyncAt: null,
  setStatus: (s) =>
    set({ status: s, pendingCount: s.pending, lastSyncAt: s.lastSyncAt }),
  refresh: async () => {
    if (!isElectron()) return;
    try {
      const s = await ipc.invoke("sync:getStatus");
      set({ status: s, pendingCount: s.pending, lastSyncAt: s.lastSyncAt });
    } catch {
      /* تجاهل — المزامنة مش حرجة للتشغيل */
    }
  },
}));

// اشتراك حيّ في تحديثات حالة المزامنة المدفوعة من الـ Main (يُستدعى مرة واحدة)
let unsubscribe: (() => void) | null = null;
export function startSyncSubscription(): void {
  if (typeof window === "undefined" || !window.electron || unsubscribe) return;
  void useSyncStore.getState().refresh();
  unsubscribe = window.electron.on("sync:status", (payload) => {
    useSyncStore.getState().setStatus(payload as SyncStatusDTO);
  });
}
