"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart.store";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import { computeDiscountAmount, type DiscountType } from "@/shared/orders";

interface DiscountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiscountModal({ open, onOpenChange }: DiscountModalProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const subtotal = useCartStore((s) => s.subtotal());
  const discountType = useCartStore((s) => s.discountType);
  const discountValue = useCartStore((s) => s.discountValue);
  const setDiscount = useCartStore((s) => s.setDiscount);

  const [type, setType] = useState<DiscountType>("percentage");
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) {
      setType(discountType === "none" ? "percentage" : discountType);
      setValue(discountType === "none" ? "" : String(discountValue));
    }
  }, [open, discountType, discountValue]);

  const numericValue = Number(value) || 0;
  const preview = computeDiscountAmount(subtotal, type, numericValue);

  function apply() {
    if (numericValue <= 0) {
      setDiscount("none", 0);
      onOpenChange(false);
      return;
    }
    if (type === "percentage" && numericValue > 100) {
      toast.error("النسبة لا تزيد عن 100%");
      return;
    }
    setDiscount(type, numericValue);
    onOpenChange(false);
  }

  function clear() {
    setDiscount("none", 0);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>خصم</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType("percentage")}
              className={cn(
                "rounded-lg border p-3 text-sm font-medium transition-colors",
                type === "percentage"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-surface-secondary"
              )}
            >
              نسبة %
            </button>
            <button
              onClick={() => setType("fixed")}
              className={cn(
                "rounded-lg border p-3 text-sm font-medium transition-colors",
                type === "fixed"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-surface-secondary"
              )}
            >
              مبلغ ثابت
            </button>
          </div>

          <Input
            type="number"
            min={0}
            step={type === "percentage" ? 1 : 0.5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === "percentage" ? "نسبة الخصم" : "مبلغ الخصم"}
            autoFocus
            dir="ltr"
            className="text-center text-lg"
          />

          <div className="flex items-center justify-between rounded-lg bg-surface-secondary p-3 text-sm">
            <span className="text-text-secondary">قيمة الخصم</span>
            <span className="font-bold text-danger">-{formatCurrency(preview)}</span>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button onClick={apply}>تطبيق</Button>
          <Button variant="outline" onClick={clear}>
            إزالة الخصم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
