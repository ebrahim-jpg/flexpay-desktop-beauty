import { create } from "zustand";

// حارس البيع/المصروفات للمدير والمالك:
// لو حساب مميّز (مدير/مالك) جه يسجّل عملية على الكاشير، نتأكد إنه قاصد كده
// (لأنهم نادراً يستلموا وردية كاشير) — منعاً للخطأ البشري إنه ينسى يبدّل الحساب.
// suppressed = الجلسة دي المدير مستلم وردية فعلاً → مفيش تحذير. بيترجع false عند الخروج.
interface ManagerGuardState {
  suppressed: boolean;
  pending: (() => void) | null;
  setSuppressed: (v: boolean) => void;
  request: (isPrivileged: boolean, run: () => void) => void;
  confirm: () => void;
  cancel: () => void;
  reset: () => void;
}

export const useManagerGuardStore = create<ManagerGuardState>((set, get) => ({
  suppressed: false,
  pending: null,
  setSuppressed: (v) => set({ suppressed: v }),
  request: (isPrivileged, run) => {
    // غير مميّز أو التحذير معطّل الجلسة دي → نفّذ على طول
    if (!isPrivileged || get().suppressed) {
      run();
      return;
    }
    set({ pending: run });
  },
  confirm: () => {
    const run = get().pending;
    set({ pending: null });
    run?.();
  },
  cancel: () => set({ pending: null }),
  reset: () => set({ suppressed: false, pending: null }),
}));
