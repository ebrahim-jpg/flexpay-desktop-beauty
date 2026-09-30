"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Receipt } from "lucide-react";
import { useSettingsStore } from "@/store/settings.store";
import { ORDER_SOURCE_LABELS, type OrderDTO } from "@/shared/orders";

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface OrdersTableProps {
  orders: OrderDTO[];
  onSelect: (order: OrderDTO) => void;
  emptyHint?: string;
}

export function OrdersTable({ orders, onSelect, emptyHint }: OrdersTableProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const paymentMethods = useSettingsStore((s) => s.paymentMethods);
  const paymentLabel = (key: string) =>
    paymentMethods.find((m) => m.key === key)?.label ?? key;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="مفيش فواتير"
        description={emptyHint ?? "هتظهر هنا كل فواتير اليوم."}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="border-b border-border text-text-secondary">
            <tr>
              <th className="p-3 font-medium">الفاتورة</th>
              <th className="p-3 font-medium">الوقت</th>
              <th className="p-3 font-medium">الموظف</th>
              <th className="p-3 font-medium">العميل</th>
              <th className="p-3 font-medium">المصدر</th>
              <th className="p-3 font-medium">الدفع</th>
              <th className="p-3 font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr
                key={o.id}
                onClick={() => onSelect(o)}
                className={
                  "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-secondary " +
                  (o.is_free ? "bg-danger/5" : "")
                }
              >
                <td className="p-3 font-mono font-medium text-text-primary">
                  {o.receipt_label}
                </td>
                <td className="p-3 text-text-secondary">{timeOf(o.created_at)}</td>
                <td className="p-3 text-text-primary">{o.cashier_name}</td>
                <td className="p-3 text-text-secondary">
                  {o.is_guest ? "زائر" : o.customer_name}
                </td>
                <td className="p-3 text-text-secondary">{ORDER_SOURCE_LABELS[o.source] ?? o.source}</td>
                <td className="p-3 text-text-secondary">
                  {o.is_free ? "—" : paymentLabel(o.payment_method)}
                </td>
                <td className="p-3 font-semibold">
                  <span
                    className={
                      o.is_free
                        ? "text-danger line-through decoration-danger/50"
                        : "text-primary"
                    }
                  >
                    {formatCurrency(o.total)}
                  </span>
                  {o.is_free && (
                    <Badge variant="danger" className="mr-2">
                      مجانية
                    </Badge>
                  )}
                  {o.status === "cancelled" && (
                    <Badge variant="danger" className="mr-2">
                      ملغي
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
