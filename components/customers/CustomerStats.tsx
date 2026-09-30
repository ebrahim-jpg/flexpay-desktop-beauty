"use client";

import { Repeat, Wallet, TrendingUp, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useSettingsStore } from "@/store/settings.store";
import { formatNumber, formatAbsence } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { CustomerDTO } from "@/shared/customers";

export function CustomerStats({ customer }: { customer: CustomerDTO }) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const absenceAlertDays = useSettingsStore((s) => s.absenceAlertDays);

  const days = customer.days_since_last;
  // لون بطاقة الغياب حسب المدة
  let absenceTone = "bg-surface text-text-primary";
  if (days !== null) {
    if (days > absenceAlertDays * 2) absenceTone = "bg-danger/10 text-danger";
    else if (days > absenceAlertDays) absenceTone = "bg-warning/10 text-warning";
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={<Repeat className="h-5 w-5" />}
        label="الزيارات"
        value={formatNumber(customer.total_visits)}
        hint="زيارة"
      />
      <StatCard
        icon={<Wallet className="h-5 w-5" />}
        label="إجمالي الإنفاق"
        value={formatCurrency(customer.total_spent)}
      />
      <StatCard
        icon={<TrendingUp className="h-5 w-5" />}
        label="متوسط الزيارة"
        value={formatCurrency(customer.avg_spent)}
      />
      <Card className={cn("p-4", absenceTone)}>
        <div className="flex items-center justify-between">
          <p className="text-sm opacity-80">الغياب</p>
          <CalendarClock className="h-5 w-5 opacity-70" />
        </div>
        <p className="mt-1 text-lg font-bold">{formatAbsence(days)}</p>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{label}</p>
        <span className="text-text-secondary">{icon}</span>
      </div>
      <p className="mt-1 text-lg font-bold text-text-primary">
        {value}
        {hint && <span className="mr-1 text-xs font-normal text-text-secondary"> {hint}</span>}
      </p>
    </Card>
  );
}
