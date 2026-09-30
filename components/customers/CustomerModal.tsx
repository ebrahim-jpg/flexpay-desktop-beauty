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
import { Textarea } from "@/components/ui/textarea";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { customerSchema } from "@/lib/validations/customer.schema";
import { cn } from "@/lib/utils";
import type { CustomerDTO, Gender } from "@/shared/customers";

interface CustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CustomerDTO | null;
  onSaved: (customer: CustomerDTO) => void;
  initialPhone?: string; // تعبئة مسبقة للموبايل (من بحث الكاشير)
}

export function CustomerModal({
  open,
  onOpenChange,
  editing,
  onSaved,
  initialPhone,
}: CustomerModalProps) {
  const { invoke } = useIPC();
  const nationalities = useSettingsStore((s) => s.nationalities);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [nationality, setNationality] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPhone(editing?.phone ?? initialPhone ?? "");
    setGender(editing?.gender ?? "male");
    setNationality(editing?.nationality ?? nationalities[0] ?? "مصري");
    setNotes(editing?.notes ?? "");
  }, [open, editing, initialPhone, nationalities]);

  async function handleSave() {
    const parsed = customerSchema.safeParse({
      name,
      phone,
      gender,
      nationality,
      notes: notes || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }

    try {
      setSaving(true);
      let saved: CustomerDTO;
      if (editing) {
        saved = await invoke("customers:update", {
          id: editing.id,
          name: name.trim(),
          phone: phone.trim(),
          gender,
          nationality,
          notes: notes.trim() || null,
        });
        toast.success("تم حفظ التعديلات");
      } else {
        saved = await invoke("customers:create", {
          name: name.trim(),
          phone: phone.trim(),
          gender,
          nationality,
          notes: notes.trim() || null,
        });
        toast.success("تم إضافة العميل");
      }
      onSaved(saved);
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
          <DialogTitle>{editing ? "تعديل عميل" : "إضافة عميل"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>الاسم (اختياري)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>الموبايل (11 رقم)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              maxLength={11}
              dir="ltr"
              className="text-right"
              placeholder="01xxxxxxxxx"
            />
          </div>

          <div className="space-y-1.5">
            <Label>الجنس</Label>
            <div className="grid grid-cols-2 gap-2">
              <GenderButton
                active={gender === "male"}
                onClick={() => setGender("male")}
                label="رجل"
              />
              <GenderButton
                active={gender === "female"}
                onClick={() => setGender("female")}
                label="امرأة"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>الجنسية</Label>
            <Select
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
            >
              {nationalities.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: حساسية من الحليب"
            />
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

function GenderButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border p-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-text-primary"
          : "border-border text-text-primary hover:bg-surface-secondary"
      )}
    >
      {label}
    </button>
  );
}
