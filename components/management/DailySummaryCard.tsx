"use client";

import { Card } from "@/components/ui/card";
import { useSettingsStore } from "@/store/settings.store";
import { formatBusinessDate } from "@/lib/business-day";
import { EXPENSE_CATEGORY_ICON } from "@/components/shared/icons";
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpensesSummary,
} from "@/shared/management";
import { cn } from "@/lib/utils";

interface DailySummaryCardProps {
  dateKey: string;
  sales: number;
  summary: ExpensesSummary | null;
}

export function DailySummaryCard({ dateKey, sales, summary }: DailySummaryCardProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const expensesTotal = summary?.total_drawer ?? 0;
  const net = sales - expensesTotal;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-surface-secondary/50 p-4">
        <p className="text-sm text-text-secondary">ملخص اليوم التجاري</p>
        <p className="font-semibold text-text-primary">
          {formatBusinessDate(new Date(dateKey + "T12:00:00"))}
        </p>
      </div>

      <div className="divide-y divide-border">
        {/* المبيعات */}
        <Row label="المبيعات" value={formatCurrency(sales)} valueClass="text-success" />

        {/* المصاريف بالتفصيل */}
        <div className="p-4">
          <p className="mb-2 text-sm font-medium text-text-primary">المصاريف</p>
          {summary && summary.by_category.length > 0 ? (
            <div className="space-y-1.5">
              {summary.by_category.map((c) => {
                const CatIcon = EXPENSE_CATEGORY_ICON[c.category];
                return (
                  <div key={c.category} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-text-secondary">
                      <CatIcon className="h-3.5 w-3.5" />
                      {EXPENSE_CATEGORY_LABELS[c.category]}
                    </span>
                    <span className="text-text-primary">{formatCurrency(c.total)}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm font-semibold">
                <span className="text-text-primary">الإجمالي</span>
                <span className="text-danger">{formatCurrency(expensesTotal)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">مفيش مصاريف اليوم</p>
          )}
        </div>

        {/* الصافي */}
        <div className="flex items-center justify-between bg-primary/5 p-4">
          <span className="font-bold text-text-primary">صافي اليوم</span>
          <span
            className={cn(
              "text-xl font-bold",
              net >= 0 ? "text-success" : "text-danger"
            )}
          >
            {formatCurrency(net)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-text-primary">{label}</span>
      <span className={cn("font-bold", valueClass)}>{value}</span>
    </div>
  );
}
