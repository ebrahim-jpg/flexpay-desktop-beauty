"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import type { ProductDTO } from "@/shared/products";
import type { SelectedModifier } from "@/shared/orders";

interface ModifierModalProps {
  product: ProductDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (modifiers: SelectedModifier[], notes: string) => void;
  /** الحجم اللي اتحدد قبل الخيارات (المطاعم) — بيظهر في العنوان */
  sizeLabel?: string | null;
  /** سعر الحجم — **بيستبدل** سعر المنتج في إجمالي الزرار */
  sizePrice?: number | null;
}

export function ModifierModal({
  product,
  open,
  onOpenChange,
  onConfirm,
  sizeLabel = null,
  sizePrice = null,
}: ModifierModalProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  // groupId -> set of optionIds
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && product) {
      // افتراضياً: اختر أول خيار في المجموعات المطلوبة أحادية الاختيار
      const initial: Record<string, string[]> = {};
      for (const g of product.modifiers) {
        if (g.is_required && !g.multi_select && g.options[0]) {
          initial[g.id] = [g.options[0].id];
        } else {
          initial[g.id] = [];
        }
      }
      setSelection(initial);
      setNotes("");
    }
  }, [open, product]);

  function toggle(groupId: string, optionId: string, multi: boolean) {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (multi) {
        return {
          ...prev,
          [groupId]: current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId],
        };
      }
      return { ...prev, [groupId]: [optionId] };
    });
  }

  const selectedModifiers = useMemo<SelectedModifier[]>(() => {
    if (!product) return [];
    const out: SelectedModifier[] = [];
    for (const g of product.modifiers) {
      for (const optId of selection[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) {
          out.push({
            group_id: g.id,
            group_name: g.name,
            option_id: opt.id,
            option_name: opt.name,
            price_adjustment: opt.price_adjustment,
          });
        }
      }
    }
    return out;
  }, [product, selection]);

  const missingRequired = useMemo(() => {
    if (!product) return false;
    return product.modifiers.some(
      (g) => g.is_required && (selection[g.id]?.length ?? 0) === 0
    );
  }, [product, selection]);

  // ⚠️ سعر الحجم **بديل** لسعر المنتج مش زيادة عليه — نفس معادلة `buildLine` بالـMain
  const total = useMemo(() => {
    if (!product) return 0;
    const base = sizePrice ?? product.price;
    return base + selectedModifiers.reduce((s, m) => s + m.price_adjustment, 0);
  }, [product, sizePrice, selectedModifiers]);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {product.name}
            {sizeLabel ? ` — ${sizeLabel}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {product.modifiers.map((group) => (
            <div key={group.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">{group.name}</span>
                {group.is_required && (
                  <span className="text-xs text-danger">مطلوب</span>
                )}
                {group.multi_select && (
                  <span className="text-xs text-text-secondary">(اختيار متعدد)</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.options.map((opt) => {
                  const active = (selection[group.id] ?? []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggle(group.id, opt.id, group.multi_select)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-text-primary"
                          : "border-border bg-surface text-text-primary hover:bg-surface-secondary"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {active && <Check className="h-4 w-4 text-primary" />}
                        {opt.name}
                      </span>
                      {opt.price_adjustment > 0 && (
                        <span className="text-xs text-text-secondary" dir="ltr">
                          +{opt.price_adjustment}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="بدون سكر، سخن زيادة..."
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            size="lg"
            disabled={missingRequired}
            onClick={() => {
              onConfirm(selectedModifiers, notes);
              onOpenChange(false);
            }}
          >
            إضافة · {formatCurrency(total)}
          </Button>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
