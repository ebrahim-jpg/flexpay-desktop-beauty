"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Receipt, ChevronRight, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { formatDate, formatNumber } from "@/lib/formatters";
import type { CustomerOrdersPage } from "@/shared/customers";
import { formatQty, type OrderDTO } from "@/shared/orders";

function timeOf(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function PurchaseHistory({ customerId }: { customerId: number }) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const paymentMethods = useSettingsStore((s) => s.paymentMethods);

  const [data, setData] = useState<CustomerOrdersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [orderCache, setOrderCache] = useState<Record<number, OrderDTO>>({});

  const paymentLabel = (key: string) =>
    paymentMethods.find((m) => m.key === key)?.label ?? key;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await invoke("customers:getOrders", {
        customerId,
        page,
        pageSize: 15,
      });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [invoke, customerId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleExpand(orderId: number) {
    if (expanded === orderId) {
      setExpanded(null);
      return;
    }
    setExpanded(orderId);
    if (!orderCache[orderId]) {
      const order = await invoke("orders:getById", orderId);
      if (order) setOrderCache((prev) => ({ ...prev, [orderId]: order }));
    }
  }

  if (loading && !data) return <LoadingSkeleton rows={4} />;

  if (!data || data.total === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="مفيش مشتريات"
        description="هيظهر هنا سجل كل فواتير العميل."
      />
    );
  }

  const pageCount = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <Card className="overflow-hidden">
      {/* ملخص الفترة */}
      <div className="flex flex-wrap gap-6 border-b border-border bg-surface-secondary/50 p-4 text-sm">
        <div>
          <span className="text-text-secondary">إجمالي الزيارات: </span>
          <span className="font-bold text-text-primary">
            {formatNumber(data.period_visits)}
          </span>
        </div>
        <div>
          <span className="text-text-secondary">إجمالي الإنفاق: </span>
          <span className="font-bold text-primary">
            {formatCurrency(data.period_spent)}
          </span>
        </div>
      </div>

      {/* الجدول */}
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="border-b border-border text-text-secondary">
            <tr>
              <th className="p-3 font-medium">التاريخ</th>
              <th className="p-3 font-medium">الوقت</th>
              <th className="p-3 font-medium">الأصناف</th>
              <th className="p-3 font-medium">الإجمالي</th>
              <th className="p-3 font-medium">الدفع</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((o) => (
              <Fragment key={o.id}>
                <tr
                  onClick={() => toggleExpand(o.id)}
                  className="cursor-pointer border-b border-border transition-colors hover:bg-surface-secondary"
                >
                  <td className="p-3 text-text-primary">{formatDate(o.created_at)}</td>
                  <td className="p-3 text-text-secondary">{timeOf(o.created_at)}</td>
                  <td className="max-w-[220px] truncate p-3 text-text-primary">
                    {o.items_summary}
                  </td>
                  <td className="p-3 font-semibold text-primary">
                    {formatCurrency(o.total)}
                    {o.status === "cancelled" && (
                      <Badge variant="danger" className="mr-2">
                        ملغي
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-text-secondary">{paymentLabel(o.payment_method)}</td>
                  <td className="p-3 text-text-secondary">
                    {expanded === o.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </td>
                </tr>
                {expanded === o.id && (
                  <tr className="border-b border-border bg-surface-secondary/40">
                    <td colSpan={6} className="p-3">
                      {orderCache[o.id] ? (
                        <div className="space-y-1">
                          {orderCache[o.id].items.map((it) => (
                            <div
                              key={it.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-text-primary">
                                {it.product_name} {formatQty(it.quantity, it.sale_type)}
                                {it.selected_modifiers.length > 0 && (
                                  <span className="mr-2 text-xs text-text-secondary">
                                    ({it.selected_modifiers.map((m) => m.option_name).join("، ")})
                                  </span>
                                )}
                              </span>
                              <span className="text-text-secondary">
                                {formatCurrency(it.total_price)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-text-secondary">جاري التحميل...</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ترقيم */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-border p-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronRight className="h-4 w-4" />
            السابق
          </Button>
          <span className="text-sm text-text-secondary">
            صفحة {page} من {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
