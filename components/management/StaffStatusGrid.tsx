"use client";

import { StaffStatusCard } from "./StaffStatusCard";
import type { StaffStatusDTO } from "@/shared/management";

interface StaffStatusGridProps {
  staff: StaffStatusDTO[];
  onClockIn: (userId: number) => Promise<void>;
  onClockOut: (userId: number) => Promise<void>;
}

export function StaffStatusGrid({ staff, onClockIn, onClockOut }: StaffStatusGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {staff.map((s) => (
        <StaffStatusCard
          key={s.user_id}
          staff={s}
          onClockIn={onClockIn}
          onClockOut={onClockOut}
        />
      ))}
    </div>
  );
}
