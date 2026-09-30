"use client";

import { useEffect, useState } from "react";
import { useIPC } from "./useIPC";
import type { CashierNetDTO } from "@/shared/management";

// صافي كاش وردية كاشير النهارده — لحماية «الدرج مايطلعش أكتر مما فيه» في واجهات خروج الفلوس.
// null لو مفيش كاشير محدد أو تعذّر الجلب.
export function useCashierNet(cashierId: number | null): CashierNetDTO | null {
  const { invoke } = useIPC();
  const [net, setNet] = useState<CashierNetDTO | null>(null);

  useEffect(() => {
    if (!cashierId) {
      setNet(null);
      return;
    }
    let active = true;
    void invoke("expenses:getCashierNet", cashierId)
      .then((n) => {
        if (active) setNet(n);
      })
      .catch(() => {
        if (active) setNet(null);
      });
    return () => {
      active = false;
    };
  }, [cashierId, invoke]);

  return net;
}

// هل المبلغ الخارج أكبر من صافي درج الكاشير؟ (لتعطيل زر الحفظ)
export function isOverDrawerNet(net: CashierNetDTO | null, amount: number): boolean {
  return !!net && amount > 0 && amount > net.net + 0.001;
}
