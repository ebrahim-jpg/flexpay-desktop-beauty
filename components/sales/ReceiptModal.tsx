"use client";
import { productWithSize } from "@/shared/sizes";

import { Printer, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settings.store";
import { formatDateTime } from "@/lib/formatters";
import { formatQty, type OrderDTO } from "@/shared/orders";

interface ReceiptModalProps {
  order: OrderDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceiptModal({ order, open, onOpenChange }: ReceiptModalProps) {
  const shopName = useSettingsStore((s) => s.shopName);
  const receiptHeader = useSettingsStore((s) => s.receiptHeader);
  const receiptFooter = useSettingsStore((s) => s.receiptFooter);
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="no-print">
          <DialogTitle>الفاتورة {order.receipt_label}</DialogTitle>
        </DialogHeader>

        {/* محتوى الفاتورة (هو اللي يتطبع) */}
        <div className="print-receipt rounded-lg border border-dashed border-border bg-surface p-4 font-mono text-sm text-text-primary">
          <div className="text-center">
            <p className="text-base font-bold">{shopName}</p>
            {receiptHeader && <p className="text-xs">{receiptHeader}</p>}
          </div>
          <Divider />
          <div className="space-y-0.5 text-xs">
            <Line label="رقم الفاتورة" value={order.receipt_label} />
            <Line label="التاريخ" value={formatDateTime(order.created_at)} />
            <Line label="الموظف" value={order.cashier_name} />
            {!order.is_guest && order.customer_name && (
              <Line label="العميل" value={order.customer_name} />
            )}
            {order.notes && <Line label="ملاحظة" value={order.notes} />}
          </div>
          <Divider />
          <div className="space-y-1">
            {order.items.map((it) => (
              <div key={it.id}>
                <div className="flex justify-between">
                  <span>
                    {productWithSize(it.product_name, it.variant_size)} {formatQty(it.quantity, it.sale_type)}
                  </span>
                  <span dir="ltr">{formatCurrency(it.total_price)}</span>
                </div>
                {it.selected_modifiers.length > 0 && (
                  <p className="pr-2 text-[10px] text-text-secondary">
                    {it.selected_modifiers.map((m) => m.option_name).join("، ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <Divider />
          <div className="space-y-0.5">
            <Line label="المجموع" value={formatCurrency(order.subtotal)} />
            {order.discount_amount > 0 && (
              <Line label="الخصم" value={`-${formatCurrency(order.discount_amount)}`} />
            )}
            {order.tax_amount > 0 && (
              <Line
                label={`ضريبة (${order.tax_rate}%)`}
                value={`+${formatCurrency(order.tax_amount)}`}
              />
            )}
            <div className="flex justify-between font-bold">
              <span>الإجمالي</span>
              <span dir="ltr">{formatCurrency(order.total)}</span>
            </div>
            <Line label="المدفوع" value={formatCurrency(order.amount_paid)} />
            {order.change_amount > 0 && (
              <Line label="الباقي" value={formatCurrency(order.change_amount)} />
            )}
          </div>
          <Divider />
          {receiptFooter && (
            <p className="text-center text-xs">{receiptFooter}</p>
          )}
        </div>

        <DialogFooter className="no-print sm:justify-between">
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            طباعة
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
            تخطّي
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Divider() {
  return <div className="my-2 border-t border-dashed border-border" />;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary">{label}</span>
      <span>{value}</span>
    </div>
  );
}
