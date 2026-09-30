"use client";

import { useState } from "react";
import { Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/shared/permissions";
import { formatElapsedSince } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import type { StaffStatusDTO } from "@/shared/management";

interface StaffStatusCardProps {
  staff: StaffStatusDTO;
  onClockIn: (userId: number) => Promise<void>;
  onClockOut: (userId: number) => Promise<void>;
}

export function StaffStatusCard({ staff, onClockIn, onClockOut }: StaffStatusCardProps) {
  const [busy, setBusy] = useState(false);

  async function handle(action: () => Promise<void>) {
    try {
      setBusy(true);
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
          {staff.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-text-primary">{staff.name}</p>
          <p className="text-xs text-text-secondary">{ROLE_LABELS[staff.role]}</p>

          <div className="mt-2 flex items-center gap-1.5 text-sm">
            <Circle
              className={cn(
                "h-2.5 w-2.5",
                staff.present
                  ? "fill-success text-success"
                  : "fill-text-secondary text-text-secondary"
              )}
            />
            {staff.present ? (
              <span className="text-text-primary">
                حاضر — {formatElapsedSince(staff.since)}
              </span>
            ) : (
              <span className="text-text-secondary">غائب</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3">
        {staff.present ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => handle(() => onClockOut(staff.user_id))}
          >
            تسجيل انصراف
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => handle(() => onClockIn(staff.user_id))}
          >
            تسجيل حضور
          </Button>
        )}
      </div>
    </Card>
  );
}
