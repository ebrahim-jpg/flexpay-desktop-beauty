import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "primary" | "accent" | "success" | "warning" | "danger";
  hint?: string;
}

const toneMap: Record<NonNullable<StatsCardProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary ring-primary/15",
  accent: "bg-accent/15 text-accent-foreground ring-accent/25",
  success: "bg-success/12 text-success ring-success/20",
  warning: "bg-warning/12 text-warning ring-warning/20",
  danger: "bg-danger/12 text-danger ring-danger/20",
};

export function StatsCard({
  title,
  value,
  icon: Icon,
  tone = "primary",
  hint,
}: StatsCardProps) {
  return (
    <Card className="bg-gradient-surface p-5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-secondary">{title}</p>
          <p className="mt-2 text-[28px] font-bold leading-none tracking-tight text-text-primary tabular-nums">
            {value}
          </p>
          {hint && <p className="mt-2 text-xs text-text-secondary">{hint}</p>}
        </div>
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
            toneMap[tone]
          )}
        >
          <Icon className="h-[22px] w-[22px]" />
        </div>
      </div>
    </Card>
  );
}
