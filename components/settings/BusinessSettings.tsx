"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settings.store";

// "12:00 ص (منتصف الليل)" ... "11:00 ص"
function hourLabel(h: number): string {
  if (h === 0) return "12:00 ص (منتصف الليل)";
  if (h === 12) return "12:00 م (الظهر)";
  const suffix = h < 12 ? "ص" : "م";
  const display = h <= 12 ? h : h - 12;
  return `${display}:00 ${suffix}`;
}

export function BusinessSettings() {
  const businessDayStart = useSettingsStore((s) => s.businessDayStart);
  const taxRate = useSettingsStore((s) => s.taxRate);
  const absenceAlertDays = useSettingsStore((s) => s.absenceAlertDays);
  const autoHideOutOfStock = useSettingsStore((s) => s.autoHideOutOfStock);
  const autoClockoutHours = useSettingsStore((s) => s.autoClockoutHours);
  const attendanceWarnHours = useSettingsStore((s) => s.attendanceWarnHours);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [draft, setDraft] = useState({
    businessDayStart,
    taxRate,
    absenceAlertDays,
    autoHideOutOfStock,
    autoClockoutHours,
    attendanceWarnHours,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    try {
      setSaving(true);
      await updateSettings({
        businessDayStart: Number(draft.businessDayStart),
        taxRate: Number(draft.taxRate) || 0,
        absenceAlertDays: Math.max(0, Math.floor(Number(draft.absenceAlertDays) || 0)),
        autoHideOutOfStock: draft.autoHideOutOfStock,
        autoClockoutHours: Math.max(0, Number(draft.autoClockoutHours) || 0),
        attendanceWarnHours: Math.max(0, Number(draft.attendanceWarnHours) || 0),
      });
      toast.success("تم حفظ إعدادات العمل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>إعدادات العمل</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>ساعة بداية اليوم التجاري</Label>
          <Select
            value={String(draft.businessDayStart)}
            onChange={(e) =>
              setDraft({ ...draft, businessDayStart: Number(e.target.value) })
            }
          >
            {Array.from({ length: 12 }).map((_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-text-secondary">
            الفواتير قبل هذه الساعة تُحسب لليوم السابق.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>نسبة الضريبة (%)</Label>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={draft.taxRate}
              onChange={(e) =>
                setDraft({ ...draft, taxRate: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>حد تنبيه غياب العميل (أيام)</Label>
            <Input
              type="number"
              min={0}
              value={draft.absenceAlertDays}
              onChange={(e) =>
                setDraft({ ...draft, absenceAlertDays: Number(e.target.value) })
              }
            />
          </div>
        </div>

        {/* الحضور: انصراف تلقائي + تحذير (قيمة عامة — يقدر تخصيصها لكل موظف من إدارة المستخدمين) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>انصراف تلقائي بعد (ساعة)</Label>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={draft.autoClockoutHours}
              onChange={(e) =>
                setDraft({ ...draft, autoClockoutHours: Number(e.target.value) })
              }
            />
            <p className="text-xs text-text-secondary">
              الموظف اللي عدّى الساعات دي يتسجّل انصراف تلقائي (0 = متعطّل).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>تحذير «لسه موجود؟» بعد (ساعة)</Label>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={draft.attendanceWarnHours}
              onChange={(e) =>
                setDraft({ ...draft, attendanceWarnHours: Number(e.target.value) })
              }
            />
            <p className="text-xs text-text-secondary">
              عند الساعات دي يظهر تحذير على الشاشة يتأكد إن الموظف لسه موجود (0 = متعطّل).
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <span>
            <span className="block text-sm font-medium text-text-primary">
              إخفاء المنتج تلقائياً عند نفاد مكوناته
            </span>
            <span className="block text-xs text-text-secondary">
              لو مادة في وصفة المنتج خلصت، المنتج يختفي من البيع تلقائياً ويرجع لما تتزود.
            </span>
          </span>
          <Switch
            checked={draft.autoHideOutOfStock}
            onCheckedChange={(c) => setDraft({ ...draft, autoHideOutOfStock: c })}
          />
        </label>

        <div className="flex justify-start">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
