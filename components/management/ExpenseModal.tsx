"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StaffExpenseForm } from "./StaffExpenseForm";
import { GeneralExpenseForm } from "./GeneralExpenseForm";
import { useAuthStore } from "@/store/auth.store";
import { useManagerGuardStore } from "@/store/manager-guard.store";
import { useIPC } from "@/hooks/useIPC";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORY_ICON } from "@/components/shared/icons";
import {
  MANUAL_EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type CreateExpenseInput,
} from "@/shared/management";
import type { SafeUser } from "@/types/ipc.types";

interface ExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ExpenseModal({ open, onOpenChange, onSaved }: ExpenseModalProps) {
  const { invoke } = useIPC();
  const currentUserId = useAuthStore((s) => s.currentUser?.id);
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [staff, setStaff] = useState<SafeUser[]>([]);
  const [cashiers, setCashiers] = useState<SafeUser[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory(null);
      invoke("users:getAll")
        .then((users) => setStaff(users.filter((u) => u.is_active)))
        .catch(() => undefined);
      invoke("users:getActiveCashiers").then(setCashiers).catch(() => undefined);
    }
  }, [open, invoke]);

  // درج مين افتراضياً: اليوزر الحالي لو هو كاشير نشط، وإلا يختار
  const defaultOwnerId: number | "" =
    currentUserId && cashiers.some((c) => c.id === currentUserId) ? currentUserId : "";

  function handleSubmit(input: CreateExpenseInput) {
    // المدير/المالك: تأكيد إن المصروف هيتسجّل على حسابه (إلا لو عطّل التحذير الجلسة دي)
    const role = useAuthStore.getState().currentUser?.role;
    const isPrivileged = role === "owner" || role === "manager";
    useManagerGuardStore.getState().request(isPrivileged, () => void doSave(input));
  }

  async function doSave(input: CreateExpenseInput) {
    try {
      setSaving(true);
      await invoke("expenses:create", input);
      toast.success("تم إضافة المصروف");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? `مصروف: ${EXPENSE_CATEGORY_LABELS[category]}` : "إضافة مصروف"}
          </DialogTitle>
        </DialogHeader>

        {!category ? (
          <div className="grid grid-cols-2 gap-2">
            {MANUAL_EXPENSE_CATEGORIES.map((c) => {
              const CatIcon = EXPENSE_CATEGORY_ICON[c];
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-colors hover:border-primary hover:bg-surface-secondary"
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CatIcon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setCategory(null)}>
              <ArrowRight className="h-4 w-4" />
              رجوع للأنواع
            </Button>

            {category === "staff" ? (
              <StaffExpenseForm
                staff={staff}
                saving={saving}
                cashiers={cashiers}
                defaultOwnerId={defaultOwnerId}
                onSubmit={handleSubmit}
              />
            ) : (
              <GeneralExpenseForm
                category={category as Exclude<ExpenseCategory, "inventory" | "staff">}
                saving={saving}
                cashiers={cashiers}
                defaultOwnerId={defaultOwnerId}
                onSubmit={handleSubmit}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
