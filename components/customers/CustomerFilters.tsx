"use client";

import { SearchInput } from "@/components/shared/SearchInput";
import { Select } from "@/components/ui/select";
import { CLASSIFICATION_ICON } from "@/components/shared/icons";
import {
  CLASSIFICATION_LABELS,
  type Classification,
  type CustomerSortKey,
} from "@/shared/customers";
import { cn } from "@/lib/utils";

interface CustomerFiltersProps {
  search: string;
  onSearch: (v: string) => void;
  classification: Classification | "all";
  onClassification: (v: Classification | "all") => void;
  sort: CustomerSortKey;
  onSort: (v: CustomerSortKey) => void;
}

const CLASSES: (Classification | "all")[] = [
  "all",
  "champion",
  "loyal",
  "at_risk",
  "lost",
  "new",
];

const SORTS: { key: CustomerSortKey; label: string }[] = [
  { key: "last_visit", label: "آخر زيارة" },
  { key: "total_spent", label: "إجمالي الإنفاق" },
  { key: "total_visits", label: "عدد الزيارات" },
  { key: "name", label: "الاسم" },
];

export function CustomerFilters({
  search,
  onSearch,
  classification,
  onClassification,
  sort,
  onSort,
}: CustomerFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder="ابحث بالاسم أو الموبايل..."
          className="max-w-sm flex-1"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">ترتيب:</span>
          <Select
            value={sort}
            onChange={(e) => onSort(e.target.value as CustomerSortKey)}
            className="w-40"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* فلتر التصنيف */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {CLASSES.map((c) => {
          const Icon = c === "all" ? null : CLASSIFICATION_ICON[c];
          return (
            <button
              key={c}
              onClick={() => onClassification(c)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                classification === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-secondary text-text-secondary hover:text-text-primary"
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {c === "all" ? "الكل" : CLASSIFICATION_LABELS[c]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
