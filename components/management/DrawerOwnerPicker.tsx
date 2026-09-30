"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DrawerNetWarning } from "@/components/shared/DrawerNetWarning";
import { cn } from "@/lib/utils";
import type { SafeUser } from "@/types/ipc.types";
import type { CashierNetDTO } from "@/shared/management";

// اختيار «خرج من درج مين؟» للمصروف اليدوي + تحذير الحماية (بدون عرض أي رقم للصافي).
export function DrawerOwnerPicker({
  cashiers,
  value,
  onChange,
  net,
  amount,
  invalid,
}: {
  cashiers: SafeUser[];
  value: number | "";
  onChange: (v: number | "") => void;
  net: CashierNetDTO | null;
  amount: number;
  invalid?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>خرج من درج مين؟</Label>
      <Select
        value={String(value)}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
        className={cn(invalid && "border-danger")}
      >
        <option value="">اختر الموظف...</option>
        {cashiers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <DrawerNetWarning net={net} amount={amount} />
    </div>
  );
}
