"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { startSyncSubscription } from "@/store/sync.store";
import { startOnlineOrdersSubscription } from "@/store/online-orders.store";
import { startBookingsSubscription } from "@/store/bookings.store";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { FullScreenLoading } from "@/components/shared/FullScreenLoading";
import { ManagerGuardModal } from "@/components/shared/ManagerGuardModal";
import { ConnectivityBanner } from "@/components/shared/ConnectivityBanner";
import { AttendanceAutoClockout } from "@/components/shared/AttendanceAutoClockout";
import { BookingDueWatcher } from "@/components/shared/BookingDueWatcher";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/login");
  }, [hydrated, isAuthenticated, router]);

  // تحميل الإعدادات بعد تسجيل الدخول — مرجع كل المكونات
  useEffect(() => {
    if (isAuthenticated) {
      void loadSettings().catch(() => undefined);
      // اشتراك حيّ في حالة المزامنة (الطابور/الاتصال)
      startSyncSubscription();
      // اشتراك حيّ في طلبات المتجر الواردة (إشعار + بادج)
      startOnlineOrdersSubscription();
      // اشتراك حيّ في حجوزات الغرف الواردة (إشعار + بادج)
      startBookingsSubscription();
    }
  }, [isAuthenticated, loadSettings]);

  if (!hydrated) return <FullScreenLoading />;
  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-6 p-6">{children}</div>
      </main>
      <ManagerGuardModal />
      <ConnectivityBanner />
      <AttendanceAutoClockout />
      <BookingDueWatcher />
    </div>
  );
}
