"use client";

import { useState } from "react";
import { Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/store/settings.store";

export function NationalitiesEditor() {
  const nationalities = useSettingsStore((s) => s.nationalities);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [list, setList] = useState<string[]>(nationalities);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  function add() {
    const v = value.trim();
    if (!v) return;
    if (list.includes(v)) {
      toast.error("الجنسية موجودة بالفعل");
      return;
    }
    setList((prev) => [...prev, v]);
    setValue("");
  }

  function remove(index: number) {
    if (list.length <= 1) {
      toast.error("لازم تفضل جنسية واحدة على الأقل");
      return;
    }
    setList((prev) => prev.filter((_, i) => i !== index));
  }

  function makeDefault(index: number) {
    setList((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      await updateSettings({ nationalities: list });
      toast.success("تم حفظ الجنسيات");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الجنسيات</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-text-secondary">
          أول جنسية هي الافتراضية عند إضافة عميل جديد.
        </p>

        <div className="space-y-2">
          {list.map((nat, i) => (
            <div
              key={nat}
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-3"
            >
              <span className="flex-1 font-medium text-text-primary">{nat}</span>
              {i === 0 ? (
                <Badge variant="accent">الافتراضية</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => makeDefault(i)}
                  title="اجعلها الافتراضية"
                >
                  <Star className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(i)}
                className="text-danger hover:bg-danger/10"
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="جنسية جديدة"
            className="max-w-xs"
          />
          <Button variant="outline" onClick={add}>
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
