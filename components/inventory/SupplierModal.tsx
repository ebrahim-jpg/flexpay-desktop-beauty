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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useIPC } from "@/hooks/useIPC";
import { supplierSchema } from "@/lib/validations/inventory.schema";
import type { SupplierDTO } from "@/shared/inventory";

interface SupplierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SupplierDTO | null;
  onSaved: () => void;
}

export function SupplierModal({ open, onOpenChange, editing, onSaved }: SupplierModalProps) {
  const { invoke } = useIPC();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPhone(editing?.phone ?? "");
    setEmail(editing?.email ?? "");
    setAddress(editing?.address ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  async function handleSave() {
    const parsed = supplierSchema.safeParse({ name, phone: phone || null, email: email || null });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }
    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      };
      if (editing) {
        await invoke("suppliers:update", { id: editing.id, ...payload });
        toast.success("تم تعديل المورد");
      } else {
        await invoke("suppliers:create", payload);
        toast.success("تم إضافة المورد");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل مورد" : "إضافة مورد"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>الموبايل</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="text-right" />
            </div>
            <div className="space-y-1.5">
              <Label>الإيميل</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className="text-right" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>العنوان</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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
