"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useIPC } from "@/hooks/useIPC";
import type { PresentSessionDTO } from "@/shared/management";

// مراقب عام: بيفحص الحاضرين كل دقيقة → انصراف تلقائي عند الحد، وتحذير للكاشير عند حد التحذير.
// بيتركّب في الـ layout عشان يشتغل في أي شاشة (حتى وإحنا على الكاشير).
const POLL_MS = 60_000;

export function AttendanceAutoClockout() {
  const { invoke } = useIPC();
  const [warn, setWarn] = useState<PresentSessionDTO | null>(null);
  const warnedRef = useRef<Set<string>>(new Set()); // جلسات اتحذّر منها (متنّجش كل دقيقة)
  const busyRef = useRef(false);

  const check = useCallback(async () => {
    if (busyRef.current || warn) return; // مانفحصش وإحنا بنعرض تحذير
    busyRef.current = true;
    try {
      const sessions = await invoke("attendance:getPresentSessions");
      const now = Date.now();
      for (const s of sessions) {
        const elapsedH = (now - new Date(s.since).getTime()) / 3_600_000;
        if (!Number.isFinite(elapsedH) || elapsedH < 0) continue;
        const key = `${s.user_id}|${s.since}`;

        // انصراف تلقائي عند تجاوز الحد الأقصى
        if (s.maxHours > 0 && elapsedH >= s.maxHours) {
          await invoke("attendance:autoClockOut", { userId: s.user_id });
          warnedRef.current.delete(key);
          toast.info(`اتسجّل انصراف تلقائي لـ ${s.name} (تجاوز ${fmtHrs(s.maxHours)} ساعة)`);
          continue;
        }
        // تحذير عند حد التحذير — مرة واحدة للجلسة
        if (s.warnHours > 0 && elapsedH >= s.warnHours && !warnedRef.current.has(key)) {
          setWarn(s);
          break; // تحذير واحد في المرة
        }
      }
    } catch {
      // نتجاهل ونعيد الفحص الدورة الجاية
    } finally {
      busyRef.current = false;
    }
  }, [invoke, warn]);

  useEffect(() => {
    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(id);
  }, [check]);

  function markPresent() {
    if (warn) warnedRef.current.add(`${warn.user_id}|${warn.since}`);
    setWarn(null);
  }

  async function clockOutNow() {
    if (!warn) return;
    try {
      await invoke("attendance:autoClockOut", { userId: warn.user_id, atWarn: true });
      toast.success(`اتسجّل انصراف لـ ${warn.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التسجيل");
    } finally {
      setWarn(null);
    }
  }

  return (
    <Dialog open={!!warn} onOpenChange={(o) => !o && markPresent()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>لسه موجود؟</DialogTitle>
          <DialogDescription>
            «{warn?.name}» عدّى {warn ? fmtHrs(warn.warnHours) : ""} ساعة حضور. لو مشي هنسجّله انصراف،
            ولو موجود هيكمل عادي.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={markPresent}>موجود ✅</Button>
          <Button variant="outline" onClick={clockOutNow}>
            مشي — سجّل انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmtHrs(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}
