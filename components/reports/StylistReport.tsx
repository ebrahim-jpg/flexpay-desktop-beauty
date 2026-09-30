"use client";

import { useCallback, useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import type { StylistPerformanceRow } from "@/shared/gaming";

/**
 * **أداء الحلاقين** — التقرير اللي عشانه اخترنا الجلسات من الأصل.
 *
 * الكاشير المباشر بيقدر يقول «عمل بكام». الجلسة بتقدر تقول كمان **«قعد قد إيه»** —
 * ومن الاتنين بيطلع **إيراد الساعة**: الرقم اللي بيقول مين بيجيب فلوس بوقته ومين لأ،
 * وهو أهم رقم في محل بيبيع **وقت** مش بضاعة.
 *
 * ⚠️ ومحتاج **أسبوعين–٣ استخدام** قبل ما يبقى له معنى — قبل كده العيّنة صغيرة.
 */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const hours = (m: number) => (m / 60).toLocaleString("ar-EG", { maximumFractionDigits: 1 });

export function StylistReport() {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<StylistPerformanceRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(null);
      setRows(await invoke("gaming:stylistPerformance", { from, to }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل التقرير");
      setRows([]);
    }
  }, [invoke, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalRevenue = (rows ?? []).reduce((s, r) => s + r.revenue, 0);
  const totalMinutes = (rows ?? []).reduce((s, r) => s + r.minutes, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>من</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label>لـ</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
        </div>
        <Button variant="outline" onClick={() => void load()}>
          تحديث
        </Button>
      </div>

      {rows === null ? (
        <LoadingSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="مفيش جلسات في الفترة دي"
          description="التقرير بيتبني من الجلسات المقفولة — افتح جلسات على الكراسي وحدّد الحلاق."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="الحلاقين" value={rows.length.toLocaleString("ar-EG")} />
            <Stat label="الإيراد" value={formatCurrency(totalRevenue)} />
            <Stat label="ساعات الشغل" value={`${hours(totalMinutes)} ساعة`} />
            <Stat
              label="إيراد الساعة"
              value={totalMinutes > 0 ? formatCurrency(totalRevenue / (totalMinutes / 60)) : "—"}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-right text-sm">
              <thead className="bg-surface-secondary text-text-secondary">
                <tr>
                  <th className="p-3 font-medium">الحلاق</th>
                  <th className="p-3 text-center font-medium">جلسات</th>
                  <th className="p-3 text-center font-medium">خدمات</th>
                  <th className="p-3 font-medium">ساعات</th>
                  <th className="p-3 font-medium">الإيراد</th>
                  <th className="p-3 font-medium">إيراد الساعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.staff_id} className="hover:bg-surface-secondary/40">
                    <td className="p-3 font-medium text-text-primary">{r.staff_name}</td>
                    <td className="p-3 text-center tabular-nums">
                      {r.sessions.toLocaleString("ar-EG")}
                    </td>
                    <td className="p-3 text-center tabular-nums">
                      {r.services.toLocaleString("ar-EG")}
                    </td>
                    <td className="whitespace-nowrap p-3 tabular-nums text-text-secondary">
                      {r.minutes > 0 ? `${hours(r.minutes)} ساعة` : "—"}
                    </td>
                    <td className="whitespace-nowrap p-3 font-semibold text-text-primary">
                      {formatCurrency(r.revenue)}
                    </td>
                    <td className="whitespace-nowrap p-3 font-bold text-primary">
                      {r.revenue_per_hour > 0 ? formatCurrency(r.revenue_per_hour) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-text-secondary">
            الإيراد = نصيب الحلاق من الفواتير (من الخدمات المسجّلة باسمه). الساعات من الجلسات
            اللي كان الحلاق الأساسي فيها. والفواتير الملغية والمجانية مش محسوبة.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 font-bold text-text-primary">{value}</p>
    </div>
  );
}
