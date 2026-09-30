"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useCashierNet, isOverDrawerNet } from "@/hooks/useCashierNet";
import { DrawerOwnerPicker } from "./DrawerOwnerPicker";
import type { SafeUser } from "@/types/ipc.types";
import type { CreateExpenseInput } from "@/shared/management";

interface StaffExpenseFormProps {
  staff: SafeUser[];
  saving: boolean;
  cashiers: SafeUser[];
  defaultOwnerId: number | "";
  onSubmit: (input: CreateExpenseInput) => void;
}

export function StaffExpenseForm({ staff, saving, cashiers, defaultOwnerId, onSubmit }: StaffExpenseFormProps) {
  const [staffId, setStaffId] = useState<number | "">(staff[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [drawerOwnerId, setDrawerOwnerId] = useState<number | "">(defaultOwnerId);

  const amountNum = Number(amount) || 0;
  const net = useCashierNet(drawerOwnerId !== "" ? Number(drawerOwnerId) : null);
  const overNet = isOverDrawerNet(net, amountNum);

  function submit() {
    if (!staffId) {
      toast.error("اختر الموظف");
      return;
    }
    if (amountNum <= 0) {
      toast.error("اكتب المبلغ");
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
      category: "staff",
      staff_id: Number(staffId),
      amount: amountNum,
      description: description.trim() || "مصروف موظف",
      drawer_owner_id: Number(drawerOwnerId),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>الموظف</Label>
        <Select
          value={staffId}
          onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">اختر الموظف</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

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
          placeholder="مصروف يومي / سلفة / بدل مواصلات"
        />
      </div>

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
