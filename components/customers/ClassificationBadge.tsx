import { CLASSIFICATION_LABELS, type Classification } from "@/shared/customers";
import { CLASSIFICATION_ICON } from "@/components/shared/icons";
import { cn } from "@/lib/utils";

const STYLES: Record<Classification, string> = {
  champion: "bg-accent text-accent-foreground",
  loyal: "bg-success text-white",
  at_risk: "bg-warning text-white",
  lost: "bg-text-secondary text-white",
  new: "bg-info/15 text-info",
};

export function ClassificationBadge({
  classification,
  className,
}: {
  classification: Classification;
  className?: string;
}) {
  const Icon = CLASSIFICATION_ICON[classification];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[classification],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {CLASSIFICATION_LABELS[classification]}
    </span>
  );
}
