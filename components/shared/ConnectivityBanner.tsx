"use client";

import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi, X } from "lucide-react";

// بانر عام لحالة الإنترنت — يظهر فوق أي صفحة:
//  • أول ما النت يقطع: تحذير أحمر «أنت غير متصل» (يقدر يخفيه).
//  • أول ما النت يرجع: شريط أخضر «رجع الاتصال» (يختفي لوحده بعد ثواني).
//  • لو قطع تاني يظهر التحذير من جديد (حتى لو كان أخفى السابق).
// بيعتمد على navigator.onLine + أحداث online/offline للمتصفح — مستقل تماماً عن
// المزامنة/التفعيل، فبيشتغل في كل المجالات وأي محل حتى لو المزامنة مش مفعّلة.
type Status = "offline" | "reconnected";

export function ConnectivityBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearHide = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };

    const goOffline = () => {
      clearHide();
      setStatus("offline");
      setDismissed(false);
    };

    const goOnline = () => {
      clearHide();
      setStatus("reconnected");
      setDismissed(false);
      // شريط «رجع الاتصال» بيختفي لوحده
      hideTimer.current = setTimeout(() => setStatus(null), 4000);
    };

    // الحالة الابتدائية: نعرض التحذير فقط لو كان أوفلاين عند فتح الصفحة
    // (بشكل غير متزامن لتجنّب setState متزامن داخل الـ effect + توافق الـ hydration)
    Promise.resolve().then(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus("offline");
        setDismissed(false);
      }
    });

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      clearHide();
    };
  }, []);

  if (!status || dismissed) return null;

  const offline = status === "offline";

  return (
    <div className="fixed left-1/2 top-3 z-[100] -translate-x-1/2 animate-in fade-in slide-in-from-top-2">
      <div
        className={
          "flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg " +
          (offline ? "bg-danger" : "bg-success")
        }
        role="status"
        aria-live="polite"
      >
        {offline ? (
          <WifiOff className="size-4 shrink-0" />
        ) : (
          <Wifi className="size-4 shrink-0" />
        )}
        <span>
          {offline
            ? "أنت غير متصل بالإنترنت دلوقتي"
            : "رجع الاتصال بالإنترنت"}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="إخفاء"
          className="ms-1 shrink-0 rounded-full p-0.5 text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
