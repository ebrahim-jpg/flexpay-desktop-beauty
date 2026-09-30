"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/EmptyState";
import { SlidersHorizontal } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useIPC } from "@/hooks/useIPC";
import type { InventoryItemDTO } from "@/shared/inventory";
import type { ModifierGroup, ModifierOption } from "@/shared/products";

interface ModifierBuilderProps {
  value: ModifierGroup[];
  onChange: (value: ModifierGroup[]) => void;
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function ModifierBuilder({ value, onChange }: ModifierBuilderProps) {
  // مواد المخزون — للإضافة اللي بتخصم مكوّن («جبنة إضافي» = ٣٠ جرام جبنة)
  const { invoke } = useIPC();
  const [inventory, setInventory] = useState<InventoryItemDTO[]>([]);
  useEffect(() => {
    let active = true;
    void invoke("inventory:getAll")
      .then((list) => {
        if (active) setInventory(list);
      })
      .catch(() => {
        if (active) setInventory([]);
      });
    return () => {
      active = false;
    };
  }, [invoke]);

  function addGroup() {
    onChange([
      ...value,
      {
        id: uid(),
        name: "",
        is_required: false,
        multi_select: false,
        options: [{ id: uid(), name: "", price_adjustment: 0 }],
      },
    ]);
  }

  function updateGroup(gi: number, patch: Partial<ModifierGroup>) {
    onChange(value.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }

  function removeGroup(gi: number) {
    onChange(value.filter((_, i) => i !== gi));
  }

  function addOption(gi: number) {
    const g = value[gi];
    updateGroup(gi, {
      options: [...g.options, { id: uid(), name: "", price_adjustment: 0 }],
    });
  }

  function updateOption(gi: number, oi: number, patch: Partial<ModifierOption>) {
    const g = value[gi];
    updateGroup(gi, {
      options: g.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)),
    });
  }

  function removeOption(gi: number, oi: number) {
    const g = value[gi];
    updateGroup(gi, { options: g.options.filter((_, i) => i !== oi) });
  }

  if (value.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={SlidersHorizontal}
          title="مفيش خيارات"
          description="ضيف مجموعات خيارات زي الحجم والإضافات لو المنتج محتاجها."
          action={
            <Button onClick={addGroup} variant="outline">
              <Plus className="h-4 w-4" />
              إضافة مجموعة خيارات
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {value.map((group, gi) => (
        <div key={group.id} className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Input
              value={group.name}
              onChange={(e) => updateGroup(gi, { name: e.target.value })}
              placeholder="اسم المجموعة (مثلاً: الحجم)"
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeGroup(gi)}
              className="text-danger hover:bg-danger/10"
              aria-label="حذف المجموعة"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <Switch
                checked={group.is_required}
                onCheckedChange={(c) => updateGroup(gi, { is_required: c })}
              />
              <span className="text-sm text-text-primary">مطلوب</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={group.multi_select}
                onCheckedChange={(c) => updateGroup(gi, { multi_select: c })}
              />
              <span className="text-sm text-text-primary">اختيار متعدد</span>
            </label>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-text-secondary">الخيارات</Label>
            {group.options.map((opt, oi) => (
              <div key={opt.id} className="flex items-center gap-2">
                <Input
                  value={opt.name}
                  onChange={(e) => updateOption(gi, oi, { name: e.target.value })}
                  placeholder="اسم الخيار"
                  className="flex-1"
                />
                <Input
                  type="number"
                  step="0.5"
                  value={opt.price_adjustment}
                  onChange={(e) =>
                    updateOption(gi, oi, {
                      price_adjustment: Number(e.target.value) || 0,
                    })
                  }
                  placeholder="+سعر"
                  className="w-24"
                  dir="ltr"
                />
                {/* خصم المخزون: «جبنة إضافي» = ٣٠ جرام جبنة. بلا مادة = سعر بس (السلوك القديم) */}
                <SearchableSelect
                  value={opt.inventory_item_id ?? 0}
                  options={[
                    { value: 0, label: "مايخصمش مخزون" },
                    ...inventory.map((inv) => ({
                      value: inv.id,
                      label: inv.name + " (" + inv.unit + ")",
                    })),
                  ]}
                  onChange={(v) =>
                    updateOption(gi, oi, {
                      inventory_item_id: v === 0 ? null : v,
                      consume_qty: v === 0 ? undefined : (opt.consume_qty ?? 1),
                    })
                  }
                  placeholder="مادة"
                  searchPlaceholder="ابحث عن مادة..."
                  className="w-44"
                />
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  value={opt.consume_qty ?? ""}
                  onChange={(e) =>
                    updateOption(gi, oi, { consume_qty: Number(e.target.value) || 0 })
                  }
                  placeholder="كمية"
                  className="w-20"
                  dir="ltr"
                  disabled={opt.inventory_item_id == null}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(gi, oi)}
                  disabled={group.options.length <= 1}
                  className="text-danger hover:bg-danger/10"
                  aria-label="حذف الخيار"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => addOption(gi)}>
              <Plus className="h-4 w-4" />
              إضافة خيار
            </Button>
          </div>
        </div>
      ))}

      <Button onClick={addGroup} variant="outline" className="w-full">
        <Plus className="h-4 w-4" />
        إضافة مجموعة خيارات
      </Button>
    </div>
  );
}
