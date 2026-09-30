"use client";

import { AlertTriangle } from "lucide-react";
import { isOverDrawerNet } from "@/hooks/useCashierNet";
import type { CashierNetDTO } from "@/shared/management";

// تحذير حماية الدرج: بيظهر لما المبلغ الخارج أكبر من اللي في درج الكاشير.
// ملاحظة أمان: مابنعرضش أي رقم للصافي — الكاشير مايعرفش صافيه إلا من المدير وقت التقفيل.
export function DrawerNetWarning({ net, amount }: { net: CashierNetDTO | null; amount: number }) {
  if (!isOverDrawerNet(net, amount) || !net) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-semibold">المبلغ ده أكبر من اللي متاح في درج {net.cashier_name}.</p>
        <p>
          مينفعش يخرج من الدرج فلوس أكتر من اللي دخله (مثلاً: لو باع بـ100 مينفعش يطلّع 200). راجع مع
          المدير أو اقفل الوردية الأول.
        </p>
      </div>
    </div>
  );
}
