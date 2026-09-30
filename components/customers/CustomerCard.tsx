"use client";

import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ClassificationBadge } from "./ClassificationBadge";
import { useSettingsStore } from "@/store/settings.store";
import { formatAbsence } from "@/lib/formatters";
import type { CustomerDTO } from "@/shared/customers";

// لون ثابت للـ Avatar مشتق من اسم العميل
const AVATAR_TONES = [
  "bg-primary/15 text-primary",
  "bg-accent/25 text-accent-foreground",
  "bg-success/15 text-success",
  "bg-info/15 text-info",
  "bg-warning/15 text-warning",
];

function toneFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_TONES.length;
  return AVATAR_TONES[h];
}

export function CustomerCard({ customer }: { customer: CustomerDTO }) {
  const router = useRouter();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  return (
    <Card
      onClick={() => router.push(`/customers/view?id=${customer.id}`)}
      className="cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${toneFor(
            customer.name
          )}`}
        >
          {customer.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium text-text-primary">{customer.name}</p>
            <ClassificationBadge classification={customer.classification} />
          </div>
          {customer.phone && (
            <p className="mt-1 flex items-center gap-1 text-xs text-text-secondary" dir="ltr">
              <Phone className="h-3 w-3" />
              {customer.phone}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-text-secondary">
              آخر زيارة: {formatAbsence(customer.days_since_last)}
            </span>
            <span className="font-semibold text-primary">
              {formatCurrency(customer.total_spent)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
