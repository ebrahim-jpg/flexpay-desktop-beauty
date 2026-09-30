"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Boxes, AlertTriangle, XCircle, Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/shared/StatsCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { formatDate, formatNumber } from "@/lib/formatters";
import {
  INVENTORY_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
} from "@/shared/reports";
import type {
  InventoryStatusRow,
  InventoryReportStatus,
  InventoryMovementRow,
} from "@/shared/reports";
import { cn } from "@/lib/utils";

type Filter = "all" | "low" | "out_of_stock";

function fmtQ(n: number): string {
  return formatNumber(Number(n.toFixed(3)));
}

const STATUS_BADGE: Record<InventoryReportStatus, "success" | "warning" | "danger"> = {
  sufficient: "success",
  low: "warning",
  out_of_stock: "danger",
};

export function InventoryReport() {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [items, setItems] = useState<InventoryStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [movements, setMovements] = useState<Record<number, InventoryMovementRow[]>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke("reports:getInventoryStatus");
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل تقرير المخزون");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const lowCount = items.filter((i) => i.status === "low").length;
    const outCount = items.filter((i) => i.status === "out_of_stock").length;
    const totalValue = items.reduce((s, i) => s + i.total_value, 0);
    return { totalItems: items.length, lowCount, outCount, totalValue };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const byStatus =
        filter === "all" ||
        (filter === "low" && i.status === "low") ||
        (filter === "out_of_stock" && i.status === "out_of_stock");
      const byName = !q || i.name.toLowerCase().includes(q);
      return byStatus && byName;
    });
  }, [items, filter, search]);

  async function toggle(itemId: number) {
    if (expanded === itemId) {
      setExpanded(null);
      return;
    }
    setExpanded(itemId);
    if (!movements[itemId]) {
      try {
        const m = await invoke("reports:getInventoryMovements", itemId);
        setMovements((prev) => ({ ...prev, [itemId]: m }));
      } catch {
        /* تجاهل */
      }
    }
  }

  if (loading && items.length === 0) return <LoadingSkeleton rows={6} />;

  return (
    <div className="space-y-5">
      <div className="no-print flex justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          طباعة
        </Button>
      </div>

      <div className="print-report space-y-5">
        {/* ملخص */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatsCard title="إجمالي المواد" value={summary.totalItems} icon={Boxes} tone="primary" />
          <StatsCard title="منخفض" value={summary.lowCount} icon={AlertTriangle} tone="warning" />
          <StatsCard title="نفد" value={summary.outCount} icon={XCircle} tone="danger" />
          <StatsCard
            title="قيمة المخزون"
            value={formatCurrency(summary.totalValue)}
            icon={Wallet}
            tone="success"
          />
        </div>

        {/* فلاتر */}
        <div className="no-print flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg bg-surface-secondary p-1">
            {([
              ["all", "الكل"],
              ["low", "منخفض"],
              ["out_of_stock", "نفد"],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  filter === key
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ابحث باسم المادة..."
            className="max-w-xs"
          />
        </div>

        {/* الجدول */}
        <Card className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="مفيش مواد"
              description="مفيش مواد مطابقة للفلتر."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-border text-text-secondary">
                  <tr>
                    <th className="p-3 font-medium">المادة</th>
                    <th className="p-3 font-medium">الكمية</th>
                    <th className="p-3 font-medium">النطاق المتوقع</th>
                    <th className="p-3 font-medium">الحالة</th>
                    <th className="p-3 font-medium">القيمة</th>
                    <th className="p-3 font-medium">الاستهلاك (30 يوم)</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <Fragment key={it.id}>
                      <tr
                        onClick={() => void toggle(it.id)}
                        className="cursor-pointer border-b border-border transition-colors hover:bg-surface-secondary"
                      >
                        <td className="p-3 font-medium text-text-primary">{it.name}</td>
                        <td className="p-3 text-text-primary tabular-nums">
                          {fmtQ(it.current_quantity)} {it.unit}
                        </td>
                        <td className="p-3 text-text-secondary tabular-nums">
                          {fmtQ(it.expected_min)} — {fmtQ(it.current_quantity)} {it.unit}
                        </td>
                        <td className="p-3">
                          <Badge variant={STATUS_BADGE[it.status]}>
                            {INVENTORY_STATUS_LABELS[it.status]}
                          </Badge>
                        </td>
                        <td className="p-3 text-text-secondary tabular-nums">
                          {formatCurrency(it.total_value)}
                        </td>
                        <td className="p-3 text-text-secondary tabular-nums">
                          {fmtQ(it.total_deducted_30d)} {it.unit}
                        </td>
                        <td className="p-3 text-text-secondary">
                          {expanded === it.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </td>
                      </tr>
                      {expanded === it.id && (
                        <tr className="bg-surface-secondary/40">
                          <td colSpan={7} className="p-4">
                            <Movements
                              rows={movements[it.id]}
                              unit={it.unit}
                              deducted={it.total_deducted_30d}
                              wasted={it.total_wasted_30d}
                              lastRestock={it.last_restock_date}
                              lastRestockQty={it.last_restock_qty}
                              supplier={it.supplier_name}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );

  function Movements({
    rows,
    unit,
    deducted,
    wasted,
    lastRestock,
    lastRestockQty,
    supplier,
  }: {
    rows: InventoryMovementRow[] | undefined;
    unit: string;
    deducted: number;
    wasted: number;
    lastRestock: string | null;
    lastRestockQty: number | null;
    supplier: string | null;
  }) {
    if (!rows) {
      return <p className="text-xs text-text-secondary">جاري التحميل...</p>;
    }
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
          <span>المورّد: <b className="text-text-primary">{supplier ?? "—"}</b></span>
          <span>
            آخر توريد:{" "}
            <b className="text-text-primary">
              {lastRestock ? `${formatDate(lastRestock)} (${fmtQ(lastRestockQty ?? 0)} ${unit})` : "—"}
            </b>
          </span>
          <span>استهلاك 30 يوم: <b className="text-text-primary">{fmtQ(deducted)} {unit}</b></span>
          <span>هالك 30 يوم: <b className="text-text-primary">{fmtQ(wasted)} {unit}</b></span>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-text-secondary">مفيش حركات في آخر 30 يوم.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="p-2 font-medium">التاريخ</th>
                  <th className="p-2 font-medium">النوع</th>
                  <th className="p-2 font-medium">الكمية</th>
                  <th className="p-2 font-medium">الرصيد بعد</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="p-2 text-text-secondary">{formatDate(m.created_at)}</td>
                    <td className="p-2 text-text-primary">{MOVEMENT_TYPE_LABELS[m.type] ?? m.type}</td>
                    <td
                      className={cn(
                        "p-2 tabular-nums",
                        m.type === "restock" ? "text-success" : "text-danger"
                      )}
                    >
                      {m.type === "restock" ? "+" : "−"}
                      {fmtQ(m.quantity)} {unit}
                    </td>
                    <td className="p-2 text-text-secondary tabular-nums">
                      {fmtQ(m.quantity_after)} {unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
}
