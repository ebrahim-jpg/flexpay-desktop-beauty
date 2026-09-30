"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PINPad } from "./PINPad";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import type { SafeUser } from "@/types/ipc.types";

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 3;
const LOCK_SECONDS = 120;

export function CashierSelector() {
  const { invoke } = useIPC();
  const login = useAuthStore((s) => s.login);

  const [cashiers, setCashiers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SafeUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    invoke("users:getActiveCashiers")
      .then(setCashiers)
      .catch(() => toast.error("تعذّر تحميل موظفي الصالة"))
      .finally(() => setLoading(false));
  }, [invoke]);

  // عدّاد القفل
  useEffect(() => {
    if (!lockUntil) return;
    const t = setInterval(() => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      if (left <= 0) {
        setLockUntil(null);
        setRemaining(0);
        setAttempts(0);
      } else {
        setRemaining(left);
      }
    }, 500);
    return () => clearInterval(t);
  }, [lockUntil]);

  const verify = useCallback(
    async (code: string) => {
      if (!selected) return;
      try {
        const user = await invoke("users:verifyPIN", {
          userId: selected.id,
          pin: code,
        });
        if (user) {
          login(user);
          toast.success(`أهلاً ${user.name}`);
          return;
        }
        // فشل
        const next = attempts + 1;
        setAttempts(next);
        setError(true);
        setPin("");
        if (next >= MAX_ATTEMPTS) {
          setLockUntil(Date.now() + LOCK_SECONDS * 1000);
          setRemaining(LOCK_SECONDS);
          toast.error("اتقفل لمدة دقيقتين بعد 3 محاولات غلط");
        } else {
          toast.error(`PIN غلط — باقي ${MAX_ATTEMPTS - next} محاولة`);
        }
        setTimeout(() => setError(false), 600);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "حصل خطأ، حاول تاني");
        setPin("");
      }
    },
    [selected, invoke, login, attempts]
  );

  // تحقق تلقائي عند اكتمال الـ PIN
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !lockUntil) {
      void verify(pin);
    }
  }, [pin, lockUntil, verify]);

  function back() {
    setSelected(null);
    setPin("");
    setError(false);
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">
        جاري التحميل...
      </p>
    );
  }

  if (cashiers.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">
        مفيش موظف صالة نشط. ادخل بالباسورد كمالك أو مدير.
      </p>
    );
  }

  // شاشة إدخال الـ PIN للكاشير المختار
  if (selected) {
    const locked = !!lockUntil;
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRound className="h-5 w-5" />
            </div>
            <span className="font-medium text-text-primary">
              {selected.name}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={back}>
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
        </div>

        {locked ? (
          <p className="rounded-md bg-danger/10 py-6 text-center text-sm font-medium text-danger">
            اتقفل مؤقتاً — حاول بعد {remaining} ثانية
          </p>
        ) : (
          <PINPad value={pin} onChange={setPin} length={PIN_LENGTH} error={error} />
        )}
      </div>
    );
  }

  // قائمة الكاشيرين
  return (
    <div className="grid grid-cols-2 gap-3">
      {cashiers.map((c) => (
        <button
          key={c.id}
          onClick={() => setSelected(c)}
          className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary hover:bg-surface-secondary"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="h-6 w-6" />
          </div>
          <span className="text-sm font-medium text-text-primary">
            {c.name}
          </span>
        </button>
      ))}
    </div>
  );
}
