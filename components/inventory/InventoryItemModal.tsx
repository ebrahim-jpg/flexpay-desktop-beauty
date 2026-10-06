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
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useIPC } from "@/hooks/useIPC";
import { inventoryItemSchema } from "@/lib/validations/inventory.schema";
import { INVENTORY_UNITS } from "@/shared/inventory";
import type {
  InventoryItemDTO,
  SupplierDTO,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
} from "@/shared/inventory";

interface InventoryItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: InventoryItemDTO | null;
  suppliers: SupplierDTO[];
  onSaved: () => void;
}

export function InventoryItemModal({
  open,
  onOpenChange,
  editing,
  suppliers,
  onSaved,
}: InventoryItemModalProps) {
  const { invoke } = useIPC();
  const isEdit = !!editing;

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>(INVENTORY_UNITS[0]);
  const [currentQty, setCurrentQty] = useState("0");
  const [threshold, setThreshold] = useState("0");
  const [waste, setWaste] = useState("0");
  const [cost, setCost] = useState("0");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [category, setCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setUnit(editing?.unit ?? INVENTORY_UNITS[0]);
    setCurrentQty(editing ? String(editing.current_quantity) : "0");
    setThreshold(editing ? String(editing.alert_threshold) : "0");
    setWaste(editing ? String(editing.waste_percentage) : "0");
    setCost(editing ? String(editing.cost_per_unit) : "0");
    setSupplierId(editing?.supplier_id ?? null);
    setCategory(editing?.category ?? "");
    void invoke("stocktake:categories").then(setCategoryOptions).catch(() => undefined);
  }, [open, editing, invoke]);

  async function handleSave() {
    const values = {
      name,
      unit,
      current_quantity: Number(currentQty) || 0,
      alert_threshold: Number(threshold) || 0,
      waste_percentage: Number(waste) || 0,
      cost_per_unit: Number(cost) || 0,
    };
    const parsed = inventoryItemSchema.safeParse(values);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }

    try {
      setSaving(true);
      if (isEdit && editing) {
        const payload: UpdateInventoryItemInput = {
          id: editing.id,
          name: values.name.trim(),
          unit: values.unit,
          alert_threshold: values.alert_threshold,
          waste_percentage: values.waste_percentage,
          cost_per_unit: values.cost_per_unit,
          supplier_id: supplierId,
          category: category.trim() || null,
        };
        await invoke("inventory:update", payload);
        toast.success("تم حفظ المادة");
      } else {
        const payload: CreateInventoryItemInput = {
          ...values,
          name: values.name.trim(),
          supplier_id: supplierId,
          category: category.trim() || null,
        };
        await invoke("inventory:create", payload);
        toast.success("تم إضافة المادة");
      }
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
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل مادة" : "إضافة مادة"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>الوحدة</Label>
              <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {INVENTORY_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>الكمية الحالية</Label>
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  value={currentQty}
                  onChange={(e) => setCurrentQty(e.target.value)}
                  dir="ltr"
                  className="text-right"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>حد التنبيه</Label>
              <Input
                type="number"
                step="0.001"
                min={0}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                dir="ltr"
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label>تكلفة الوحدة</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                dir="ltr"
                className="text-right"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>نسبة التهدير (%)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={waste}
              onChange={(e) => setWaste(e.target.value)}
              dir="ltr"
              className="text-right"
            />
            <p className="text-xs text-text-secondary">
              النسبة المتوقعة للفقد الطبيعي (انسكاب، رطوبة، إلخ).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>المورد (اختياري)</Label>
              <Select
                value={supplierId ?? ""}
                onChange={(e) =>
                  setSupplierId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">بدون مورد</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>الفئة (اختياري)</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="inv-category-options"
                placeholder="صبغة، فويل، شامبو..."
              />
              <datalist id="inv-category-options">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-xs text-text-secondary">للجرد بالفئة — اختر أو اكتب جديدة.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
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
