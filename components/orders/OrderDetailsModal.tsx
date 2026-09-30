"use client";

import { useState } from "react";
import { Printer, Ban, Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { formatDateTime } from "@/lib/formatters";
import { ORDER_SOURCE_LABELS, formatQty, type OrderDTO } from "@/shared/orders";

interface OrderDetailsModalProps {
  order: OrderDTO | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function OrderDetailsModal({
  order,
  onOpenChange,
  onChanged,
}: OrderDetailsModalProps) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const paymentMethods = useSettingsStore((s) => s.paymentMethods);
  const canCancel = useAuthStore((s) => s.hasPermission("canCancelOrder"));

  const [printing, setPrinting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");

  if (!order) return null;

  const paymentLabel =
    paymentMethods.find((m) => m.key === order.payment_method)?.label ??
    order.payment_method;

  async function reprint() {
    if (!order) return;
    try {
      setPrinting(true);
      await invoke("orders:printReceipt", order.id);
      toast.success("تم إرسال الفاتورة للطباعة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت الطباعة");
    } finally {
      setPrinting(false);
    }
  }

  async function cancelOrder() {
    if (!order) return;
    if (reason.trim().length < 2) {
      toast.error("اكتب سبب الإلغاء");
      return;
    }
    try {
      setCancelling(true);
      await invoke("orders:cancel", { id: order.id, reason: reason.trim() });
      toast.success("تم إلغاء الفاتورة");
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الإلغاء");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            فاتورة {order.receipt_label}
            {order.is_free && <Badge variant="danger">مجانية</Badge>}
            {order.status === "cancelled" && <Badge variant="danger">ملغي</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* معلومات */}
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            <Info label="التاريخ" value={formatDateTime(order.created_at)} />
            <Info label="الموظف" value={order.cashier_name} />
            <Info label="المصدر" value={ORDER_SOURCE_LABELS[order.source] ?? order.source} />
            <Info label="العميل" value={order.is_guest ? "زائر" : order.customer_name ?? "—"} />
            <Info label="الدفع" value={paymentLabel} />
            {order.is_free && order.free_recipient_name && (
              <Info
                label="المستفيد المجاني"
                value={`${order.free_recipient_name} (${
                  order.free_recipient_type === "staff" ? "موظف" : "عميل"
                })`}
              />
            )}
          </div>

          {/* الملاحظة — شاشة المراجعة لازم تشوفها */}
          {order.notes && (
            <div className="rounded-lg bg-surface-secondary px-3 py-2 text-sm">
              <span className="text-text-secondary">ملاحظة: </span>
              <span className="text-text-primary">{order.notes}</span>
            </div>
          )}

          {/* البنود */}
          <div className="space-y-2 border-t border-border pt-3">
            {order.items.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="text-text-primary">
                    {it.product_name} {formatQty(it.quantity, it.sale_type)}
                  </p>
                  {it.selected_modifiers.length > 0 && (
                    <p className="text-xs text-text-secondary">
                      {it.selected_modifiers.map((m) => m.option_name).join("، ")}
                    </p>
                  )}
                  {it.notes && (
                    <p className="flex items-center gap-1 text-xs text-accent-foreground">
                      <StickyNote className="h-3 w-3 shrink-0" />
                      {it.notes}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-medium text-text-primary">
                  {formatCurrency(it.total_price)}
                </span>
              </div>
            ))}
          </div>

          {/* الإجماليات */}
          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <Row label="المجموع" value={formatCurrency(order.subtotal)} />
            {order.discount_amount > 0 && (
              <Row label="الخصم" value={`-${formatCurrency(order.discount_amount)}`} danger />
            )}
            {order.tax_amount > 0 && (
              <Row label={`ضريبة (${order.tax_rate}%)`} value={`+${formatCurrency(order.tax_amount)}`} />
            )}
            <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-bold">
              <span>الإجمالي</span>
              <span className="text-primary">{formatCurrency(order.total)}</span>
            </div>
            <Row label="المدفوع" value={formatCurrency(order.amount_paid)} />
            {order.change_amount > 0 && (
              <Row label="الباقي" value={formatCurrency(order.change_amount)} />
            )}
          </div>

          {/* إلغاء */}
          {showCancel && (
            <div className="space-y-2 rounded-md bg-danger/5 p-3">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="سبب الإلغاء..."
                autoFocus
              />
              <Button
                variant="danger"
                className="w-full"
                onClick={cancelOrder}
                disabled={cancelling}
              >
                {cancelling ? "جاري الإلغاء..." : "تأكيد إلغاء الفاتورة"}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button onClick={reprint} disabled={printing}>
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            إعادة طباعة
          </Button>
          {canCancel && order.status === "paid" && !showCancel && (
            <Button
              variant="ghost"
              onClick={() => setShowCancel(true)}
              className="text-danger hover:bg-danger/10"
            >
              <Ban className="h-4 w-4" />
              إلغاء الفاتورة
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-text-secondary">{label}: </span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={danger ? "text-danger" : "text-text-primary"}>{value}</span>
    </div>
  );
}
