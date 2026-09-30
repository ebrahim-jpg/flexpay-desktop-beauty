"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Banknote, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
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
import { Select } from "@/components/ui/select";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { useCashierNet, isOverDrawerNet } from "@/hooks/useCashierNet";
import { DrawerNetWarning } from "@/components/shared/DrawerNetWarning";
import { cn } from "@/lib/utils";
import type { InventoryItemDTO, RestockPaymentType } from "@/shared/inventory";
import type { SafeUser } from "@/types/ipc.types";

interface RestockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemDTO | null;
  onSaved: () => void;
}

export function RestockModal({ open, onOpenChange, item, onSaved }: RestockModalProps) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [quantity, setQuantity] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [paymentType, setPaymentType] = useState<RestockPaymentType>("cash");
  const [drawerAmount, setDrawerAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [drawerOwnerId, setDrawerOwnerId] = useState<number | "">("");
  const [cashiers, setCashiers] = useState<SafeUser[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setQuantity("");
      setCostPerUnit(item.cost_per_unit ? String(item.cost_per_unit) : "");
      setPaymentType("cash");
      setDrawerAmount("");
      setPaidAmount("");
      setDrawerOwnerId("");
      setNotes("");
      void invoke("users:getActiveCashiers").then(setCashiers).catch(() => undefined);
    }
  }, [open, item, invoke]);

  const qty = Number(quantity) || 0;
  const cost = Number(costPerUnit) || 0;
  const totalCost = qty * cost;
  const isCredit = paymentType === "credit";
  const hasSupplier = !!item?.supplier_id;

  // كاش = مدفوع كامل | آجل = المدفوع المحدد (صفر = التكلفة كلها دين)
  const paidNow = isCredit ? Number(paidAmount) || 0 : totalCost;
  const drawer = Number(drawerAmount) || 0;
  const debt = Math.max(0, totalCost - paidNow);

  // تحققات منطقية (تقفل زر الحفظ)
  const paidTooMuch = isCredit && paidNow > totalCost + 0.001;
  const drawerTooMuch = drawer > paidNow + 0.001;
  const blockingSupplier = isCredit && !hasSupplier;
  const needsDrawerOwner = drawer > 0 && !drawerOwnerId;
  // حماية الدرج: صافي الكاشير المختار — يمنع الخروج فوق الصافي
  const netInfo = useCashierNet(drawer > 0 && drawerOwnerId !== "" ? Number(drawerOwnerId) : null);
  const overNet = isOverDrawerNet(netInfo, drawer);
  const canSave =
    qty > 0 &&
    totalCost > 0 &&
    !paidTooMuch &&
    !drawerTooMuch &&
    !blockingSupplier &&
    !needsDrawerOwner &&
    !overNet;

  async function handleSave() {
    if (!item) return;
    if (qty <= 0) {
      toast.error("اكتب الكمية المستلمة");
      return;
    }
    if (blockingSupplier) {
      toast.error("المادة دي مالهاش مورد — اربطها بمورد الأول عشان تسجّل آجل");
      return;
    }
    if (paidTooMuch) {
      toast.error("المدفوع مينفعش يكون أكبر من التكلفة الكلية");
      return;
    }
    if (drawerTooMuch) {
      toast.error("اللي خرج من الدرج مينفعش يكون أكبر من المدفوع");
      return;
    }
    if (needsDrawerOwner) {
      toast.error("حدّد الفلوس خرجت من درج مين");
      return;
    }
    if (overNet && netInfo) {
      toast.error(`صافي درج ${netInfo.cashier_name} أقل من المبلغ — مينفعش يخرج أكتر مما في الدرج`);
      return;
    }
    try {
      setSaving(true);
      await invoke("inventory:restock", {
        id: item.id,
        quantity: qty,
        cost_per_unit: cost,
        drawer_amount: drawer,
        payment_type: paymentType,
        paid_amount: paidNow,
        supplier_id: item.supplier_id,
        drawer_owner_id: drawer > 0 ? Number(drawerOwnerId) : null,
        notes: notes.trim() || null,
      });
      toast.success("تمت إضافة الكمية");
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
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>استلام بضاعة — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الكمية المستلمة ({item?.unit})</Label>
              <Input
                type="number"
                step="0.001"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                autoFocus
                dir="ltr"
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label>سعر الوحدة</Label>
              <Input
                type="number"
                step="0.5"
                min={0}
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                dir="ltr"
                className="text-right"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-surface-secondary p-3 text-sm">
            <span className="text-text-secondary">التكلفة الكلية</span>
            <span className="font-bold text-text-primary">{formatCurrency(totalCost)}</span>
          </div>

          {/* المورد */}
          {item?.supplier_name ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">المورد</span>
              <span className="font-medium text-text-primary">{item.supplier_name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-warning/10 p-2.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              المادة دي مالهاش مورد — الآجل مش متاح. اربطها بمورد من تعديل المادة.
            </div>
          )}

          {/* طريقة الدفع */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label>طريقة الدفع</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentType("cash")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition-colors",
                  !isCredit
                    ? "border-primary bg-primary/10 text-text-primary"
                    : "border-border text-text-secondary hover:bg-surface-secondary"
                )}
              >
                <Banknote className="h-4 w-4" />
                كاش
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("credit")}
                disabled={!hasSupplier}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  isCredit
                    ? "border-danger bg-danger/10 text-danger"
                    : "border-border text-text-secondary hover:bg-surface-secondary"
                )}
              >
                <Clock className="h-4 w-4" />
                آجل
              </button>
            </div>
          </div>

          {/* آجل: دفعنا كام دلوقتي */}
          {isCredit && (
            <div className="space-y-1.5">
              <Label>دفعنا كام دلوقتي؟</Label>
              <Input
                type="number"
                step="0.5"
                min={0}
                max={totalCost || undefined}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0"
                dir="ltr"
                className={cn("text-right", paidTooMuch && "border-danger")}
              />
              {paidTooMuch ? (
                <p className="text-xs text-danger">
                  مينفعش أكبر من التكلفة ({formatCurrency(totalCost)}).
                </p>
              ) : (
                <p className="text-xs text-text-secondary">
                  حط صفر لو مدفعناش حاجة — التكلفة كلها هتبقى دين على المورد.
                </p>
              )}
            </div>
          )}

          {/* كام خرج من الدرج (من المدفوع) */}
          <div className="space-y-1.5">
            <Label>
              {isCredit ? "منهم كام خرج من درج النهارده؟" : "كام خرج من الدرج النهارده؟"}
            </Label>
            <Input
              type="number"
              step="0.5"
              min={0}
              max={paidNow || undefined}
              value={drawerAmount}
              onChange={(e) => setDrawerAmount(e.target.value)}
              placeholder="0"
              dir="ltr"
              className={cn("text-right", drawerTooMuch && "border-danger")}
            />
            {drawerTooMuch ? (
              <p className="text-xs text-danger">
                مينفعش أكبر من المدفوع ({formatCurrency(paidNow)}).
              </p>
            ) : (
              <p className="text-xs text-text-secondary">
                ده اللي خرج فعلياً من درج النهاردة (يتسجّل في مصاريف اليوم). صفر لو مدفعتش من
                الدرج.
              </p>
            )}
          </div>

          {/* من درج مين؟ — لازم لو خرج فلوس من الدرج (عشان التقفيل يطلع صح) */}
          {drawer > 0 && (
            <div className="space-y-1.5">
              <Label>الفلوس خرجت من درج مين؟</Label>
              <Select
                value={String(drawerOwnerId)}
                onChange={(e) =>
                  setDrawerOwnerId(e.target.value ? Number(e.target.value) : "")
                }
                className={cn(needsDrawerOwner && "border-danger")}
              >
                <option value="">اختر الموظف...</option>
                {cashiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-text-secondary">
                المبلغ هيتحسب على وردية الموظف ده عشان تقفيل درجه يطلع صح (مش وردية المدير).
              </p>
              <DrawerNetWarning net={netInfo} amount={drawer} />
            </div>
          )}

          {/* ملخص الأثر */}
          <div className="space-y-1 rounded-md bg-info/10 p-3 text-xs text-info">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ستُضاف {qty || 0} {item?.unit} للمخزون.
            </p>
            {isCredit && (
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                المدفوع فعلياً: {formatCurrency(paidNow)}.
              </p>
            )}
            {drawer > 0 && (
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                هيتسجّل {formatCurrency(drawer)} في مصاريف اليوم (خرجت من الدرج).
              </p>
            )}
            {isCredit && debt > 0 && (
              <p className="flex items-center gap-1.5 text-danger">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                هيتسجّل دين {formatCurrency(debt)} على {item?.supplier_name}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="توريد يناير"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
