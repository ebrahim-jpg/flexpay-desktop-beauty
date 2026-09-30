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
import { wasteSchema } from "@/lib/validations/inventory.schema";
import type { InventoryItemDTO } from "@/shared/inventory";

const REASONS = ["سقوط", "تلف", "انتهاء صلاحية", "غيره"];

interface WasteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemDTO | null;
  onSaved: () => void;
}

export function WasteModal({ open, onOpenChange, item, onSaved }: WasteModalProps) {
  const { invoke } = useIPC();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setQuantity("");
      setReason(REASONS[0]);
    }
  }, [open]);

  async function handleSave() {
    if (!item) return;
    const parsed = wasteSchema.safeParse({
      quantity: Number(quantity),
      reason,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }
    try {
      setSaving(true);
      await invoke("inventory:adjustWaste", {
        id: item.id,
        quantity: Number(quantity),
        reason,
      });
      toast.success("تم تسجيل الهالك");
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
          <DialogTitle>تسجيل هالك — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>الكمية المهدرة ({item?.unit})</Label>
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
            <Label>السبب</Label>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="danger" onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "تسجيل"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
