"use client";

import { useState } from "react";
import { Plus, Trash2, Bike, Info } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settings.store";
import type { DeliveryZone } from "@/shared/settings";

function newId(): string {
  return `z-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function DeliveryZonesEditor() {
  const deliveryZones = useSettingsStore((s) => s.deliveryZones);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [zones, setZones] = useState<DeliveryZone[]>(deliveryZones);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  function add() {
    const n = name.trim();
    const p = Number(price);
    if (!n) {
      toast.error("اكتب اسم المنطقة");
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      toast.error("سعر التوصيل لازم رقم موجب");
      return;
    }
    setZones((prev) => [...prev, { id: newId(), name: n, price: p }]);
    setName("");
    setPrice("");
  }

  function updateZone(id: string, patch: Partial<DeliveryZone>) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }

  function remove(id: string) {
    setZones((prev) => prev.filter((z) => z.id !== id));
  }

  async function handleSave() {
    // تنظيف: أسماء غير فاضية + أسعار موجبة
    const clean = zones
      .map((z) => ({ ...z, name: z.name.trim(), price: Number(z.price) || 0 }))
      .filter((z) => z.name && z.price >= 0);
    try {
      setSaving(true);
      await updateSettings({ deliveryZones: clean });
      setZones(clean);
      toast.success("تم حفظ مناطق التوصيل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bike className="h-5 w-5 text-primary" />
          مناطق التوصيل وأسعارها
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-md bg-info/10 px-3 py-2 text-xs text-text-secondary">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <span>
            سعر التوصيل ده <b>للعرض والفاتورة بس</b> — بيتطبع للعميل والدليفري لضمان الحق، ومايدخلش
            أي حساب مالي في المحل (لا الإيرادات ولا الدرج).
          </span>
        </div>

        <div className="space-y-2">
          {zones.length === 0 && (
            <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-text-secondary">
              مفيش مناطق لسه — زوّد أول منطقة تحت.
            </p>
          )}
          {zones.map((z) => (
            <div
              key={z.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface p-2.5"
            >
              <Input
                value={z.name}
                onChange={(e) => updateZone(z.id, { name: e.target.value })}
                placeholder="اسم المنطقة (مثلاً قريب / وسط البلد)"
                className="flex-1"
              />
              <div className="relative w-32 shrink-0">
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  dir="ltr"
                  value={z.price}
                  onChange={(e) => updateZone(z.id, { price: Number(e.target.value) })}
                  className="pl-10 text-left"
                />
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
                  ج
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(z.id)}
                className="text-danger hover:bg-danger/10"
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* إضافة منطقة */}
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="اسم المنطقة"
            className="flex-1"
          />
          <Input
            type="number"
            min={0}
            step="0.5"
            dir="ltr"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="السعر"
            className="w-28 text-left"
          />
          <Button variant="outline" onClick={add}>
            <Plus className="h-4 w-4" />
            إضافة
          </Button>
        </div>

        {zones.some((z) => z.price > 0) && (
          <p className="text-xs text-text-secondary">
            أعلى سعر: {formatCurrency(Math.max(...zones.map((z) => z.price)))}
          </p>
        )}

        <div className="flex justify-start border-t border-border pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
