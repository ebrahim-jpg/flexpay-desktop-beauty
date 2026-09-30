"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { ipc, isElectron } from "@/hooks/useIPC";

// مفتاح تمرير طلب المتجر لصفحة الكاشير عبر localStorage (يعيش عبر إعادة التحميل في النسخة النهائية).
export const PREPARE_ORDER_KEY = "flexpay:prepareOrder";

interface OnlineOrdersState {
  newCount: number;
  setCount: (n: number) => void;
  refresh: () => Promise<void>;
}

export const useOnlineOrdersStore = create<OnlineOrdersState>()((set) => ({
  newCount: 0,
  setCount: (n) => set({ newCount: n }),
  refresh: async () => {
    if (!isElectron()) return;
    try {
      const c = await ipc.invoke("onlineOrders:count");
      set({ newCount: c });
    } catch {
      /* تجاهل — مش حرج للتشغيل */
    }
  },
}));

// اشتراك حيّ في وصول طلبات متجر جديدة (إشعار + تحديث البادج). يُستدعى مرة واحدة.
let unsubscribe: (() => void) | null = null;
export function startOnlineOrdersSubscription(): void {
  if (typeof window === "undefined" || !window.electron || unsubscribe) return;
  void useOnlineOrdersStore.getState().refresh();
  unsubscribe = window.electron.on("online-orders:new", (payload) => {
    const data = payload as { count: number; total: number };
    useOnlineOrdersStore.getState().setCount(data.total);
    toast.success(
      data.count === 1
        ? "🛒 طلب جديد من المتجر"
        : `🛒 وصل ${data.count} طلبات جديدة من المتجر`,
      { description: "روح صفحة «طلبات المتجر» تجهّزه." }
    );
  });
}
