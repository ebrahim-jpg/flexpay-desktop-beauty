"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { History } from "lucide-react";
import { useIPC } from "@/hooks/useIPC";
import { formatDateTime } from "@/lib/formatters";
import { TRANSACTION_LABELS, type TransactionType } from "@/shared/inventory";
import type { InventoryItemDTO, TransactionDTO } from "@/shared/inventory";

interface TransactionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemDTO | null;
}

const PAGE_SIZE = 20;

const typeVariant: Record<TransactionType, "success" | "danger" | "muted" | "warning"> = {
  restock: "success",
  deduction: "danger",
  waste: "warning",
  adjustment: "muted",
  stocktake: "muted",
};

export function TransactionDrawer({ open, onOpenChange, item }: TransactionDrawerProps) {
  const { invoke } = useIPC();
  const [rows, setRows] = useState<TransactionDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (p: number) => {
      if (!item) return;
      try {
        setLoading(true);
        const res = await invoke("inventory:getTransactions", {
          itemId: item.id,
          page: p,
          pageSize: PAGE_SIZE,
        });
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
      } finally {
        setLoading(false);
      }
    },
    [invoke, item]
  );

  useEffect(() => {
    if (open && item) void load(1);
  }, [open, item, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>سجل الحركات — {item?.name}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <LoadingSkeleton rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState icon={History} title="مفيش حركات" description="لسه مفيش أي حركة على المادة دي." />
          ) : (
            <div className="space-y-2">
              {rows.map((t) => (
                <div key={t.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <Badge variant={typeVariant[t.type]}>
                      {TRANSACTION_LABELS[t.type]}
                    </Badge>
                    <span
                      className={
                        "font-bold " +
                        (t.quantity >= 0 ? "text-success" : "text-danger")
                      }
                      dir="ltr"
                    >
                      {t.quantity >= 0 ? "+" : ""}
                      {t.quantity}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-text-secondary">
                    <span dir="ltr">
                      {t.quantity_before} ← {t.quantity_after}
                    </span>
                    <span>{formatDateTime(t.created_at)}</span>
                  </div>
                  {(t.reason || t.user_name) && (
                    <p className="mt-1 text-xs text-text-secondary">
                      {t.reason}
                      {t.user_name ? ` · ${t.user_name}` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ترقيم */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border p-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => load(page - 1)}
              disabled={page <= 1 || loading}
            >
              <ChevronRight className="h-4 w-4" />
              السابق
            </Button>
            <span className="text-sm text-text-secondary">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => load(page + 1)}
              disabled={page >= totalPages || loading}
            >
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
