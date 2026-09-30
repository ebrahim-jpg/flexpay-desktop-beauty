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
import { useIPC } from "@/hooks/useIPC";
import { categorySchema } from "@/lib/validations/product.schema";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS } from "@/components/shared/icons";
import type { CategoryDTO } from "@/shared/products";

const DEFAULT_ICON = "package";

interface CategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CategoryDTO | null;
  onSaved: () => void;
}

export function CategoryModal({
  open,
  onOpenChange,
  editing,
  onSaved,
}: CategoryModalProps) {
  const { invoke } = useIPC();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_ICON);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setIcon(editing?.icon ?? DEFAULT_ICON);
  }, [open, editing]);

  async function handleSave() {
    const parsed = categorySchema.safeParse({ name, icon });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }
    try {
      setSaving(true);
      if (editing) {
        await invoke("categories:update", { id: editing.id, name: name.trim(), icon });
        toast.success("تم تعديل الفئة");
      } else {
        await invoke("categories:create", { name: name.trim(), icon });
        toast.success("تم إضافة الفئة");
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
          <DialogTitle>{editing ? "تعديل فئة" : "إضافة فئة"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>الأيقونة</Label>
            <div className="grid grid-cols-9 gap-1 rounded-md border border-border p-2">
              {CATEGORY_ICONS.map(({ name: iconName, Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary",
                    icon === iconName &&
                      "bg-primary/12 text-primary ring-1 ring-primary"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </button>
              ))}
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
