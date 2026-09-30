"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useCashierNet, isOverDrawerNet } from "@/hooks/useCashierNet";
import { DrawerOwnerPicker } from "./DrawerOwnerPicker";
import type { CreateExpenseInput, ExpenseCategory, RecurrenceType } from "@/shared/management";
import type { SafeUser } from "@/types/ipc.types";

interface GeneralExpenseFormProps {
  category: Exclude<ExpenseCategory, "inventory" | "staff">;
  saving: boolean;
  cashiers: SafeUser[];
  defaultOwnerId: number | "";
  onSubmit: (input: CreateExpenseInput) => void;
}

export function GeneralExpenseForm({ category, saving, cashiers, defaultOwnerId, onSubmit }: GeneralExpenseFormProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("monthly");
  const [drawerOwnerId, setDrawerOwnerId] = useState<number | "">(defaultOwnerId);

  const amountNum = Number(amount) || 0;
  const net = useCashierNet(drawerOwnerId !== "" ? Number(drawerOwnerId) : null);
  const overNet = isOverDrawerNet(net, amountNum);

  function submit() {
    if (amountNum <= 0) {
      toast.error("اكتب المبلغ");
      return;
    }
    if (description.trim().length < 2) {
      toast.error("اكتب وصف المصروف");
      return;
    }
    if (drawerOwnerId === "") {
      toast.error("حدّد الفلوس خرجت من درج مين");
      return;
    }
    if (overNet && net) {
      toast.error(`صافي درج ${net.cashier_name} أقل من المبلغ — مينفعش يخرج أكتر مما في الدرج`);
      return;
    }
    onSubmit({
      category,
      amount: amountNum,
      description: description.trim(),
      is_recurring: recurring,
      recurrence_type: recurring ? recurrenceType : null,
      drawer_owner_id: Number(drawerOwnerId),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>المبلغ</Label>
        <Input
          type="number"
          min={0}
          step="0.5"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          dir="ltr"
          className="text-right"
        />
      </div>

      <div className="space-y-1.5">
        <Label>الوصف</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="مثال: فاتورة كهرباء"
        />
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <span className="text-sm font-medium text-text-primary">متكرر؟</span>
        <Switch checked={recurring} onCheckedChange={setRecurring} />
      </label>

      {recurring && (
        <div className="grid grid-cols-2 gap-2">
          {(["monthly", "weekly"] as RecurrenceType[]).map((r) => (
            <button
              key={r}
              onClick={() => setRecurrenceType(r)}
              className={cn(
                "rounded-lg border p-2.5 text-sm font-medium transition-colors",
                recurrenceType === r
                  ? "border-primary bg-primary/10 text-text-primary"
                  : "border-border text-text-primary hover:bg-surface-secondary"
              )}
            >
              {r === "monthly" ? "شهري" : "أسبوعي"}
            </button>
          ))}
        </div>
      )}

      <DrawerOwnerPicker
        cashiers={cashiers}
        value={drawerOwnerId}
        onChange={setDrawerOwnerId}
        net={net}
        amount={amountNum}
        invalid={drawerOwnerId === ""}
      />

      <Button className="w-full" disabled={saving || overNet || drawerOwnerId === ""} onClick={submit}>
        {saving ? "جاري الحفظ..." : "حفظ"}
      </Button>
    </div>
  );
}
