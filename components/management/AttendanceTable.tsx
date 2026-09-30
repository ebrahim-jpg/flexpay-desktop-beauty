"use client";

import { Pencil, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { formatDuration } from "@/lib/attendance";
import type { AttendanceRowDTO, StaffStatusDTO } from "@/shared/management";

function timeOf(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface AttendanceTableProps {
  rows: AttendanceRowDTO[];
  staff: StaffStatusDTO[];
  userFilter: number | null;
  onUserFilter: (id: number | null) => void;
  dateFilter: string;
  onDateFilter: (date: string) => void;
  minDate: string;
  maxDate: string;
  showDateFilter?: boolean;
  title?: string;
  canEdit: boolean;
  onEdit: (row: AttendanceRowDTO) => void;
}

export function AttendanceTable({
  rows,
  staff,
  userFilter,
  onUserFilter,
  dateFilter,
  onDateFilter,
  minDate,
  maxDate,
  showDateFilter = true,
  title,
  canEdit,
  onEdit,
}: AttendanceTableProps) {
  const heading =
    title ?? (dateFilter ? `سجل يوم ${formatDate(dateFilter)}` : "سجل آخر 30 يوم");
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <h3 className="font-semibold text-text-primary">{heading}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {/* فلتر اليوم (في وضع الشهر فقط) */}
          {showDateFilter && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={dateFilter}
                min={minDate}
                max={maxDate}
                onChange={(e) => onDateFilter(e.target.value)}
                className="w-40"
                dir="ltr"
              />
              {dateFilter && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDateFilter("")}
                  title="كل الأيام"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          {/* فلتر الموظف */}
          <Select
            value={userFilter ?? ""}
            onChange={(e) => onUserFilter(e.target.value ? Number(e.target.value) : null)}
            className="w-44"
          >
            <option value="">كل الموظفين</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="مفيش سجل حضور"
          description="هيظهر هنا سجل الحضور والانصراف."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="p-3 font-medium">الموظف</th>
                <th className="p-3 font-medium">التاريخ</th>
                <th className="p-3 font-medium">الحضور</th>
                <th className="p-3 font-medium">الانصراف</th>
                <th className="p-3 font-medium">المدة</th>
                {canEdit && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.user_id}-${r.business_date}`} className="border-b border-border last:border-0">
                  <td className="p-3 text-text-primary">{r.user_name}</td>
                  <td className="p-3 text-text-secondary">{formatDate(r.business_date)}</td>
                  <td className="p-3 text-text-primary">{timeOf(r.clock_in)}</td>
                  <td className="p-3 text-text-primary">{timeOf(r.clock_out)}</td>
                  <td className="p-3 text-text-secondary">
                    {formatDuration(r.duration_minutes)}
                  </td>
                  {canEdit && (
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(r)}
                        title="تعديل"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
