"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SafeUser } from "@/types/ipc.types";
import type { Permissions } from "@/shared/permissions";
import { ipc, isElectron } from "@/hooks/useIPC";
import { useManagerGuardStore } from "@/store/manager-guard.store";

interface AuthState {
  currentUser: SafeUser | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  login: (user: SafeUser) => void;
  logout: () => Promise<void>;
  hasPermission: (permission: keyof Permissions) => boolean;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      hydrated: false,

      login: (user) => {
        set({ currentUser: user, isAuthenticated: true });
        // إبلاغ الـ Main بالمستخدم الحالي (لتسجيل created_by/updated_by)
        if (isElectron()) {
          void ipc.invoke("session:setActor", user.id).catch(() => undefined);
        }
      },

      logout: async () => {
        const user = get().currentUser;
        if (user && isElectron()) {
          await ipc
            .invoke("audit:log", {
              userId: user.id,
              userName: user.name,
              action: "تسجيل خروج",
              entityType: "user",
              entityId: user.id,
            })
            .catch(() => undefined);
          await ipc.invoke("session:setActor", null).catch(() => undefined);
        }
        // إعادة تفعيل تحذير البيع للمدير/المالك تلقائياً عند الخروج
        useManagerGuardStore.getState().reset();
        set({ currentUser: null, isAuthenticated: false });
      },

      hasPermission: (permission) => {
        const user = get().currentUser;
        if (!user) return false;
        if (user.role === "owner") return true;
        return !!user.permissions[permission];
      },

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "flexpay-auth",
      // sessionStorage: السيشن يتمسح بمجرد قفل التطبيق — يفضل بس مع الـ reload.
      // قفل التطبيق → لازم تسجّل دخول من الأول.
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.sessionStorage
          : (undefined as unknown as Storage)
      ),
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        // إعادة ضبط الفاعل في الـ Main بعد إعادة فتح التطبيق
        if (state?.currentUser && isElectron()) {
          void ipc
            .invoke("session:setActor", state.currentUser.id)
            .catch(() => undefined);
        }
      },
    }
  )
);

// تنظيف أي سيشن قديم كان متخزّن في localStorage قبل التحويل لـ sessionStorage
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem("flexpay-auth");
  } catch {
    /* تجاهل */
  }
}
