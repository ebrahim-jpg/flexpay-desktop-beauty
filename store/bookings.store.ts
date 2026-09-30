"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { ipc, isElectron } from "@/hooks/useIPC";

// بادج «طلبات الحجز» + الاشتراك الحيّ في الحجوزات الجديدة الجايّة من الويب.
// ⚠️ الحدث اسمه لازم يكون في `ALLOWED_EVENTS` في preload وإلا بيتبلع بصمت.
interface BookingsState {
  newCount: number;
  setCount: (n: number) => void;
  refresh: () => Promise<void>;
}

export const useBookingsStore = create<BookingsState>()((set) => ({
  newCount: 0,
  setCount: (n) => set({ newCount: n }),
  refresh: async () => {
    if (!isElectron()) return;
    try {
      const c = await ipc.invoke("bookings:count");
      set({ newCount: c });
    } catch {
      /* تجاهل — مش حرج للتشغيل */
    }
  },
}));

let unsubscribe: (() => void) | null = null;
export function startBookingsSubscription(): void {
  if (typeof window === "undefined" || !window.electron || unsubscribe) return;
  void useBookingsStore.getState().refresh();
  unsubscribe = window.electron.on("bookings:new", (payload) => {
    const data = payload as { count: number; total: number };
    useBookingsStore.getState().setCount(data.total);
    toast.success(
      data.count === 1 ? "📅 حجز طاولة جديد" : `📅 وصل ${data.count} طلبات حجز`,
      { description: "كلّم الزبون على رقمه وأكّد الحجز من «طلبات الحجز»." }
    );
  });
}
