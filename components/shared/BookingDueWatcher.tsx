"use client";

// مراقب مواعيد الحجز — بيشتغل على **أي شاشة** (مركّب في الـlayout).
//
// ⚠️ ليه مش على شاشة الغرف بس: الموظف ساعات بيبقى في المخزون أو العملاء، وميعاد
// الحجز بيعدّي من غير ما حد ياخد باله. شاشة الغرف بتوري الشريط والصوت، وده بيضمن
// إن التنبيه يوصل مهما كان الموظف فين.
//
// ⚠️ التنبيه **مرة واحدة لكل حجز**: العلم بيتحط في الداتابيز جوّه نفس نداء `bookings:due`،
// فمابيتكررش كل دقيقة ولا بعد إعادة تشغيل البرنامج.

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { plannedLabel } from "@/shared/gaming";
import { bookingTimeLabel } from "@/shared/booking";

const POLL_MS = 60_000;

export function BookingDueWatcher() {
  const { invoke } = useIPC();
  const canPos = useAuthStore((s) => s.hasPermission("canAccessPOS"));
  const busyRef = useRef(false);

  const check = useCallback(async () => {
    if (busyRef.current || !canPos) return;
    busyRef.current = true;
    try {
      const due = await invoke("bookings:due");
      for (const b of due.slice(0, 3)) {
        const at = bookingTimeLabel(b.starts_at);
        toast.warning(`📅 حجز ${b.room_name} الساعة ${at}`, {
          description: `${b.customer_name || b.customer_phone} · ${plannedLabel(b.duration_minutes)} — لو الطاولة مشغولة جهّز طاولة تانية`,
          duration: 10_000,
        });
      }
    } catch {
      /* مش حرج للتشغيل */
    } finally {
      busyRef.current = false;
    }
  }, [invoke, canPos]);

  useEffect(() => {
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(id);
  }, [check]);

  return null;
}
