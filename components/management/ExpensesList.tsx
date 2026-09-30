"use client";

import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Receipt } from "lucide-react";
import { EXPENSE_CATEGORY_ICON } from "@/components/shared/icons";
import { useSettingsStore } from "@/store/settings.store";
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseDTO,
} from "@/shared/management";

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface ExpensesListProps {
  expenses: ExpenseDTO[];
  canDelete: boolean;
  onDelete: (expense: ExpenseDTO) => void;
}

export function ExpensesList({ expenses, canDelete, onDelete }: ExpensesListProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="مفيش مصاريف"
        description="ابدأ بإضافة مصروف، أو هتظهر مصاريف البضاعة تلقائياً من المخزون."
      />
    );
  }

  return (
    <Card className="divide-y divide-border">
      {expenses.map((e) => {
        const CatIcon = EXPENSE_CATEGORY_ICON[e.category];
        return (
        <div key={e.id} className="flex items-center gap-3 p-3.5">
          <span className="text-xs text-text-secondary">{timeOf(e.created_at)}</span>
          <span className="flex items-center gap-1.5 text-sm text-text-primary">
            <CatIcon className="h-4 w-4 text-text-secondary" />
            {EXPENSE_CATEGORY_LABELS[e.category]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
            {e.description}
            {e.staff_name && ` — ${e.staff_name}`}
          </span>
          {e.is_auto && <Badge variant="muted">تلقائي</Badge>}
          <span className="font-semibold text-text-primary">
            {formatCurrency(e.drawer_amount)}
          </span>
          {canDelete && !e.is_auto && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(e)}
              className="text-danger hover:bg-danger/10"
              aria-label="حذف"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        );
      })}
    </Card>
  );
}
