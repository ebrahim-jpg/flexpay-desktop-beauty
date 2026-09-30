"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Banknote, Clock } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { useCashierNet, isOverDrawerNet } from "@/hooks/useCashierNet";
import { DrawerNetWarning } from "@/components/shared/DrawerNetWarning";
import { cn } from "@/lib/utils";
import type { InventoryItemDTO, SupplierDTO } from "@/shared/inventory";
import type { PurchasePaymentType } from "@/shared/purchases";
import type { SafeUser } from "@/types/ipc.types";

interface Line {
  item_id: number | "";
  quantity: string;
  unit_cost: string;
}

const newLine = (): Line => ({ item_id: "", quantity: "", unit_cost: "" });

export function PurchaseInvoiceModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [items, setItems] = useState<InventoryItemDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [cashiers, setCashiers] = useState<SafeUser[]>([]);

  const [reference, setReference] = useState("");
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [paymentType, setPaymentType] = useState<PurchasePaymentType>("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [drawerAmount, setDrawerAmount] = useState("");
  const [drawerOwnerId, setDrawerOwnerId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReference("");
    setSupplierId("");
    setPaymentType("cash");
    setPaidAmount("");
    setDrawerAmount("");
    setDrawerOwnerId("");
    setNotes("");
    setLines([newLine()]);
    void invoke("inventory:getAll").then(setItems).catch(() => undefined);
    void invoke("suppliers:getAll").then(setSuppliers).catch(() => undefined);
    void invoke("users:getActiveCashiers").then(setCashiers).catch(() => undefined);
  }, [open, invoke]);

  const itemById = (id: number | "") =>
    id === "" ? undefined : items.find((i) => i.id === id);

  // خيارات المادة (مع تعطيل المستخدمة في صف تاني)
  const usedIds = new Set(lines.map((l) => l.item_id).filter((x) => x !== ""));
  const materialOptions = useMemo(
    () =>
      items.map((i) => ({
        value: i.id,
        label: `${i.name} (${i.unit})`,
        disabled: usedIds.has(i.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, lines]
  );

  function setLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function pickMaterial(idx: number, id: number) {
    const it = items.find((x) => x.id === id);
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              item_id: id,
              unit_cost: l.unit_cost || (it?.cost_per_unit ? String(it.cost_per_unit) : ""),
            }
          : l
      )
    );
  }

  const validLines = lines.filter(
    (l) => l.item_id !== "" && Number(l.quantity) > 0 && Number(l.unit_cost) >= 0
  );
  const totalCost = validLines.reduce(
    (s, l) => s + Number(l.quantity) * Number(l.unit_cost),
    0
  );
  const isCredit = paymentType === "credit";
  const paidNow = isCredit ? Number(paidAmount) || 0 : totalCost;
  const drawer = Number(drawerAmount) || 0;
  const debt = Math.max(0, totalCost - paidNow);

  const paidTooMuch = isCredit && paidNow > totalCost + 0.001;
  const drawerTooMuch = drawer > paidNow + 0.001;
  const needsSupplier = isCredit && supplierId === "";
  const needsDrawerOwner = drawer > 0 && drawerOwnerId === "";
  // حماية الدرج: صافي الكاشير المختار
  const netInfo = useCashierNet(drawer > 0 && drawerOwnerId !== "" ? Number(drawerOwnerId) : null);
  const overNet = isOverDrawerNet(netInfo, drawer);
  const canSave =
    validLines.length > 0 &&
    totalCost > 0 &&
    !paidTooMuch &&
    !drawerTooMuch &&
    !needsSupplier &&
    !needsDrawerOwner &&
    !overNet;

  async function save() {
    if (!canSave) {
      if (needsSupplier) toast.error("اختر المورد عشان تسجّل آجل");
      else if (needsDrawerOwner) toast.error("حدّد الفلوس خرجت من درج مين");
      else if (overNet && netInfo)
        toast.error(`صافي درج ${netInfo.cashier_name} أقل من المبلغ — مينفعش يخرج أكتر مما في الدرج`);
      else toast.error("راجع البنود والمبالغ");
      return;
    }
    try {
      setSaving(true);
      await invoke("purchases:createInvoice", {
        reference: reference.trim() || null,
        supplier_id: supplierId === "" ? null : Number(supplierId),
        payment_type: paymentType,
        paid_amount: paidNow,
        drawer_amount: drawer,
        drawer_owner_id: drawer > 0 ? Number(drawerOwnerId) : null,
        notes: notes.trim() || null,
        items: validLines.map((l) => ({
          inventory_item_id: Number(l.item_id),
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost),
        })),
      });
      toast.success("اتسجّلت فاتورة التوريد");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>فاتورة توريد جديدة</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* رأس الفاتورة */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>رقم/اسم الفاتورة (اختياري)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="مثلاً INV-102" />
            </div>
            <div className="space-y-1.5">
              <Label>المورد (اختياري)</Label>
              <Select
                value={String(supplierId)}
                onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
                className={cn(needsSupplier && "border-danger")}
              >
                <option value="">بدون مورد</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* البنود */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <Label>البنود</Label>
              <span className="text-xs text-text-secondary">
                المواد هتتحدّث لمورد الفاتورة تلقائياً
              </span>
            </div>
            {lines.map((line, i) => {
              const it = itemById(line.item_id);
              const lineCost = Number(line.quantity) * Number(line.unit_cost) || 0;
              return (
                <div key={i} className="flex items-center gap-2">
                  <SearchableSelect
                    value={line.item_id === "" ? -1 : line.item_id}
                    options={materialOptions}
                    onChange={(v) => pickMaterial(i, v)}
                    placeholder="اختر مادة"
                    searchPlaceholder="ابحث عن مادة..."
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    step="0.001"
                    min={0}
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                    placeholder={it?.unit || "كمية"}
                    className="w-24 text-right"
                    dir="ltr"
                  />
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    value={line.unit_cost}
                    onChange={(e) => setLine(i, { unit_cost: e.target.value })}
                    placeholder="سعر"
                    className="w-24 text-right"
                    dir="ltr"
                  />
                  <span className="w-24 shrink-0 text-left text-xs text-text-secondary" dir="ltr">
                    {formatCurrency(lineCost)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, x) => x !== i) : p))}
                    className="text-danger hover:bg-danger/10"
                    aria-label="حذف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
              <Plus className="h-4 w-4" />
              إضافة بند
            </Button>
          </div>

          {/* الإجمالي */}
          <div className="flex items-center justify-between rounded-md bg-surface-secondary p-3 text-sm">
            <span className="text-text-secondary">إجمالي الفاتورة</span>
            <span className="font-bold text-text-primary">{formatCurrency(totalCost)}</span>
          </div>

          {/* طريقة الدفع */}
          <div className="space-y-2 border-t border-border pt-3">
            <Label>طريقة الدفع</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentType("cash")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition-colors",
                  !isCredit ? "border-primary bg-primary/10 text-text-primary" : "border-border text-text-secondary hover:bg-surface-secondary"
                )}
              >
                <Banknote className="h-4 w-4" /> كاش
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("credit")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border p-2.5 text-sm font-medium transition-colors",
                  isCredit ? "border-danger bg-danger/10 text-danger" : "border-border text-text-secondary hover:bg-surface-secondary"
                )}
              >
                <Clock className="h-4 w-4" /> آجل
              </button>
            </div>
          </div>

          {isCredit && (
            <div className="space-y-1.5">
              <Label>دفعنا كام دلوقتي؟</Label>
              <Input
                type="number"
                step="0.5"
                min={0}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0"
                dir="ltr"
                className={cn("text-right", paidTooMuch && "border-danger")}
              />
              <p className="text-xs text-text-secondary">الباقي هيتسجّل دين على المورد.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{isCredit ? "منهم كام خرج من درج النهارده؟" : "كام خرج من الدرج النهارده؟"}</Label>
            <Input
              type="number"
              step="0.5"
              min={0}
              value={drawerAmount}
              onChange={(e) => setDrawerAmount(e.target.value)}
              placeholder="0"
              dir="ltr"
              className={cn("text-right", drawerTooMuch && "border-danger")}
            />
            <p className="text-xs text-text-secondary">
              صفر لو الفلوس كانت مجهّزة من المالك (مش من درج النهاردة).
            </p>
          </div>

          {drawer > 0 && (
            <div className="space-y-1.5">
              <Label>الفلوس خرجت من درج مين؟</Label>
              <Select
                value={String(drawerOwnerId)}
                onChange={(e) => setDrawerOwnerId(e.target.value ? Number(e.target.value) : "")}
                className={cn(needsDrawerOwner && "border-danger")}
              >
                <option value="">اختر الموظف...</option>
                {cashiers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <p className="text-xs text-text-secondary">
                المبلغ هيتحسب على وردية الموظف ده عشان تقفيل درجه يطلع صح.
              </p>
              <DrawerNetWarning net={netInfo} amount={drawer} />
            </div>
          )}

          {/* ملخص */}
          <div className="space-y-1 rounded-md bg-info/10 p-3 text-xs text-info">
            <p>إجمالي البضاعة: {formatCurrency(totalCost)} ({validLines.length} بند).</p>
            <p>المدفوع: {formatCurrency(paidNow)} {drawer > 0 ? `(منهم ${formatCurrency(drawer)} من الدرج)` : ""}.</p>
            {isCredit && debt > 0 && <p className="text-danger">دين على المورد: {formatCurrency(debt)}.</p>}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving || !canSave}>
            {saving ? "جاري الحفظ..." : "حفظ الفاتورة"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
