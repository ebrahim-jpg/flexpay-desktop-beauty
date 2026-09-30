"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settings.store";
import type { PaymentMethod } from "@/shared/settings";

export function PaymentMethodsEditor() {
  const paymentMethods = useSettingsStore((s) => s.paymentMethods);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [methods, setMethods] = useState<PaymentMethod[]>(paymentMethods);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  function toggle(index: number, enabled: boolean) {
    setMethods((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, enabled: m.key === "cash" ? true : enabled } : m
      )
    );
  }

  function move(index: number, dir: -1 | 1) {
    setMethods((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(index: number) {
    setMethods((prev) => prev.filter((_, i) => i !== index));
  }

  function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const key = `custom_${Date.now()}`;
    setMethods((prev) => [...prev, { key, label, enabled: true }]);
    setNewLabel("");
  }

  async function handleSave() {
    try {
      setSaving(true);
      await updateSettings({ paymentMethods: methods });
      toast.success("تم حفظ طرق الدفع");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>طرق الدفع</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {methods.map((m, i) => (
            <div
              key={m.key}
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-3"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-text-secondary" />
              <div className="flex flex-1 items-center gap-2">
                <span className="font-medium text-text-primary">{m.label}</span>
                {m.key === "cash" && (
                  <span className="text-xs text-text-secondary">(دائماً مفعّل)</span>
                )}
              </div>

              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-text-secondary hover:text-text-primary disabled:opacity-30"
                  aria-label="تحريك لأعلى"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === methods.length - 1}
                  className="text-text-secondary hover:text-text-primary disabled:opacity-30"
                  aria-label="تحريك لأسفل"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <Switch
                checked={m.enabled}
                disabled={m.key === "cash"}
                onCheckedChange={(c) => toggle(i, c)}
              />

              {m.key !== "cash" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(i)}
                  className="text-danger hover:bg-danger/10"
                  aria-label="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* إضافة طريقة مخصصة */}
        <div className="flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="اسم طريقة دفع جديدة"
            className="max-w-xs"
          />
          <Button variant="outline" onClick={addCustom}>
            <Plus className="h-4 w-4" />
            إضافة
          </Button>
        </div>

        <div className="flex justify-start border-t border-border pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
