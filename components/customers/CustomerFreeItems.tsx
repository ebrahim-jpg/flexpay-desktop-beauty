"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { formatDate } from "@/lib/formatters";
import { formatQty } from "@/shared/orders";
import type { CustomerFreeOrder } from "@/shared/customers";

// المنتجات اللي خدها العميل مجاناً — عشان نعرف مين خد إيه قبل كده
// (مفيد للعروض: ميخدش نفس المجاني تاني)
export function CustomerFreeItems({ customerId }: { customerId: number }) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [orders, setOrders] = useState<CustomerFreeOrder[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await invoke("customers:getFreeItems", customerId);
      setOrders(res);
    } finally {
      setLoading(false);
    }
  }, [invoke, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !orders) return <LoadingSkeleton rows={2} />;
  // مفيش مجاني خالص → مانعرضش القسم أصلاً
  if (!orders || orders.length === 0) return null;

  const totalValue = orders.reduce((s, o) => s + o.total, 0);
  const itemsCount = orders.reduce((s, o) => s + o.items.length, 0);

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-text-primary">
        <Gift className="h-5 w-5 text-danger" />
        منتجات مجانية
        <span className="text-sm font-normal text-text-secondary">
          ({itemsCount} صنف — قيمة {formatCurrency(totalValue)})
        </span>
      </h3>

      <Card className="divide-y divide-border overflow-hidden">
        {orders.map((o) => (
          <div key={o.id} className="space-y-2 p-4">
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span className="font-mono font-medium text-text-primary">
                {o.receipt_label}
              </span>
              <span>
                {formatDate(o.created_at)} · {o.cashier_name}
              </span>
            </div>
            <div className="space-y-1">
              {o.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-text-primary">
                    {it.product_name} {formatQty(it.quantity, it.sale_type)}
                  </span>
                  <span className="text-text-secondary tabular-nums line-through decoration-danger/40">
                    {formatCurrency(it.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
