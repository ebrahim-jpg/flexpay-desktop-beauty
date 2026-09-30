"use client";

import { ChevronRight, ChevronLeft, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shiftDateKey } from "@/shared/business-day";
import { formatBusinessDate } from "@/lib/business-day";

interface DayNavigatorProps {
  dateKey: string;
  todayKey: string;
  minKey: string;
  onChange: (key: string) => void;
}

export function DayNavigator({
  dateKey,
  todayKey,
  minKey,
  onChange,
}: DayNavigatorProps) {
  const atToday = dateKey >= todayKey;
  const atMin = dateKey <= minKey;
  const label = formatBusinessDate(new Date(dateKey + "T12:00:00"));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-center gap-2">
        {/* RTL: «السابق» يرجّع يوم — السهم لليمين */}
        <Button
          variant="outline"
          size="sm"
          disabled={atMin}
          onClick={() => onChange(shiftDateKey(dateKey, -1))}
          title={atMin ? "التقارير الأقدم متاحة في السحابة" : "اليوم السابق"}
        >
          <ChevronRight className="h-4 w-4" />
          السابق
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={atToday}
          onClick={() => onChange(shiftDateKey(dateKey, 1))}
        >
          التالي
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 text-text-primary">
        <CalendarDays className="h-5 w-5 text-text-secondary" />
        <span className="font-semibold">{label}</span>
      </div>

      <Button
        variant={atToday ? "secondary" : "primary"}
        size="sm"
        disabled={atToday}
        onClick={() => onChange(todayKey)}
      >
        اليوم
      </Button>
    </div>
  );
}
