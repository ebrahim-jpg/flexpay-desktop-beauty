"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Wallet, Delete, CornerDownLeft, Gift } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCartStore, useCartTotals } from "@/store/cart.store";
import { useSettingsStore } from "@/store/settings.store";
import { useAuthStore } from "@/store/auth.store";
import { useManagerGuardStore } from "@/store/manager-guard.store";
import { useIPC } from "@/hooks/useIPC";
import { cn } from "@/lib/utils";
import type { CreateOrderInput, OrderDTO } from "@/shared/orders";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (order: OrderDTO) => void;
}

const PM_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-5 w-5" />,
  card: <CreditCard className="h-5 w-5" />,
  instapay: <Wallet className="h-5 w-5" />,
};

export function CheckoutModal({ open, onOpenChange, onComplete }: CheckoutModalProps) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const allPaymentMethods = useSettingsStore((s) => s.paymentMethods);
  const paymentMethods = useMemo(
    () => allPaymentMethods.filter((m) => m.enabled),
    [allPaymentMethods]
  );

  const items = useCartStore((s) => s.items);
  const totals = useCartTotals();
  const cart = useCartStore();
  const isFree = cart.isFree;

  // ⚠️ نسخة البلايستيشن: مفيش توصيل — البيع السريع دايمًا «عادي» من غير منطقة ولا مندوب
  const [method, setMethod] = useState<string>("cash");
  const [received, setReceived] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // عند الفتح: املأ «المدفوع» بالإجمالي تلقائياً (غالباً العميل بيدفع بالظبط)
  useEffect(() => {
    if (open) {
      setMethod(paymentMethods[0]?.key ?? "cash");
      setReceived(String(Number(totals.total.toFixed(2))));
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isCash = method === "cash";
  const receivedNum = Number(received) || 0;
  const change = isCash ? receivedNum - totals.total : 0;
  const canConfirm = isFree || (isCash ? receivedNum >= totals.total - 0.001 : true);

  // مبالغ سريعة: الإجمالي + تقريبات لأعلى
  const quickAmounts = useMemo(() => {
    const t = Math.ceil(totals.total);
    const set = new Set<number>([t]);
    [5, 10, 20, 50, 100].forEach((stepv) => {
      set.add(Math.ceil(totals.total / stepv) * stepv);
    });
    return Array.from(set)
      .filter((v) => v >= totals.total)
      .sort((a, b) => a - b)
      .slice(0, 4);
  }, [totals.total]);

  function pressKey(k: string) {
    if (k === "del") {
      setTouched(true);
      setReceived((v) => v.slice(0, -1));
      return;
    }
    // أول ضغطة بعد الفتح تستبدل القيمة المملوءة تلقائياً
    if (!touched) {
      setTouched(true);
      setReceived(k === "." ? "0." : k);
      return;
    }
    if (k === "." && received.includes(".")) return;
    setReceived((v) => (v + k).replace(/^0+(\d)/, "$1"));
  }

  function confirm() {
    // المدير/المالك: تأكيد إن البيع هيتسجّل على حسابه (إلا لو عطّل التحذير الجلسة دي)
    const role = useAuthStore.getState().currentUser?.role;
    const isPrivileged = role === "owner" || role === "manager";
    useManagerGuardStore.getState().request(isPrivileged, () => void doRecord());
  }

  async function doRecord() {
    try {
      setSubmitting(true);
      const payload: CreateOrderInput = {
        items: items.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
          modifier_option_ids: i.selectedModifiers.map((m) => m.option_id),
          notes: i.itemNotes || undefined,
          variant_id: i.variantId,
        })),
        customer_id: cart.customerId,
        is_guest: cart.isGuest,
        order_type: cart.orderType,
        discount_type: cart.discountType,
        discount_value: cart.discountValue,
        payment_method: method,
        amount_paid: isFree ? 0 : isCash ? receivedNum : totals.total,
        is_free: isFree,
        free_recipient_type: isFree ? cart.freeRecipientType : null,
        free_recipient_id: isFree ? cart.freeRecipientId : null,
        free_recipient_name: isFree ? cart.freeRecipientName || null : null,
        notes: cart.notes || undefined,
        source: cart.onlineOrderLocalId ? "online_store" : "pos",
        online_order_local_id: cart.onlineOrderLocalId,
      };
      const result = await invoke("orders:create", payload);
      toast.success(isFree ? "تم تسجيل الفاتورة المجانية" : "تم البيع بنجاح");
      cart.clearCart();
      onOpenChange(false);
      onComplete(result.order);
      // طباعة الفاتورة علطول (صامتة) — لا توقف العمل لو الطابعة مش متاحة
      void invoke("orders:printReceipt", result.order.id).catch(() =>
        toast.error("تم البيع لكن تعذّرت الطباعة — راجع إعدادات الطابعة")
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إتمام البيع");
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (canConfirm && !submitting) void confirm();
    }
  }

  const hasBreakdown = totals.discount_amount > 0 || totals.tax_amount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onKeyDown={onKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isFree ? (
              <>
                <Gift className="h-5 w-5 text-danger" />
                <span className="text-danger">فاتورة مجانية</span>
              </>
            ) : (
              "الدفع"
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* فاتورة مجانية — لا دفع، تتخصم من المخزون بس */}
          {isFree && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-text-secondary">
              {cart.freeRecipientName && (
                <div className="mb-2 flex items-center justify-between border-b border-danger/15 pb-2">
                  <span className="text-text-secondary">المستفيد</span>
                  <span className="font-semibold text-text-primary">
                    {cart.freeRecipientName}
                    <span className="mr-1 text-xs font-normal text-text-secondary">
                      ({cart.freeRecipientType === "staff" ? "موظف" : "عميل"})
                    </span>
                  </span>
                </div>
              )}
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-text-primary">قيمة الفاتورة</span>
                <span className="text-2xl font-bold text-danger tabular-nums line-through decoration-danger/50">
                  {formatCurrency(totals.total)}
                </span>
              </div>
              <p>
                دي فاتورة مجانية: هتتخصم من المخزون عادي، لكن <b className="text-danger">متتحسبش في الفلوس</b> وهتظهر بالأحمر في الفواتير والتقارير للمراجعة بس.
              </p>
            </div>
          )}

          {/* طرق الدفع — تظهر فقط لو فيه أكتر من وسيلة (مش في المجانية) */}
          {!isFree && paymentMethods.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {paymentMethods.map((pm) => (
                <button
                  key={pm.key}
                  type="button"
                  onClick={() => setMethod(pm.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-sm font-medium transition-colors",
                    method === pm.key
                      ? "border-primary bg-primary/10 text-text-primary"
                      : "border-border hover:bg-surface-secondary"
                  )}
                >
                  {PM_ICONS[pm.key] ?? <Wallet className="h-5 w-5" />}
                  {pm.label}
                </button>
              ))}
            </div>
          )}

          {/* الإجمالي + تفصيل مختصر لو فيه خصم/ضريبة */}
          {!isFree && (
          <div className="rounded-lg bg-primary/10 p-3">
            {hasBreakdown && (
              <div className="mb-2 space-y-1 border-b border-primary/15 pb-2 text-xs">
                <MiniRow label="المجموع الفرعي" value={formatCurrency(totals.subtotal)} />
                {totals.discount_amount > 0 && (
                  <MiniRow
                    label="الخصم"
                    value={`−${formatCurrency(totals.discount_amount)}`}
                  />
                )}
                {totals.tax_amount > 0 && (
                  <MiniRow
                    label={`الضريبة (${totals.tax_rate}%)`}
                    value={`+${formatCurrency(totals.tax_amount)}`}
                  />
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">الإجمالي</span>
              <span className="text-2xl font-bold text-primary tabular-nums">
                {formatCurrency(totals.total)}
              </span>
            </div>
          </div>
          )}

          {!isFree && isCash && (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <span className="text-sm text-text-secondary">المدفوع</span>
                <span className="text-xl font-bold text-text-primary tabular-nums" dir="ltr">
                  {received || "0"}
                </span>
              </div>

              {/* مبالغ سريعة */}
              <div className="grid grid-cols-4 gap-2">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setReceived(String(amt));
                      setTouched(true);
                    }}
                    className={cn(
                      "rounded-md border py-2 text-sm font-medium transition-colors",
                      receivedNum === amt
                        ? "border-primary bg-primary/10 text-text-primary"
                        : "border-border hover:bg-surface-secondary"
                    )}
                  >
                    {amt}
                  </button>
                ))}
              </div>

              {/* لوحة أرقام */}
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map(
                  (k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => pressKey(k)}
                      className="flex h-11 items-center justify-center rounded-lg border border-border text-lg font-semibold text-text-primary transition-colors hover:bg-surface-secondary active:scale-[0.98]"
                    >
                      {k === "del" ? <Delete className="h-5 w-5" /> : k}
                    </button>
                  )
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg bg-success/10 p-3">
                <span className="font-medium text-text-primary">الباقي</span>
                <span className="text-lg font-bold text-success tabular-nums" dir="ltr">
                  {formatCurrency(Math.max(0, change))}
                </span>
              </div>
            </>
          )}

          <Button
            size="lg"
            className={cn("h-14 w-full text-lg", !isFree && "shadow-gold")}
            variant={isFree ? "danger" : "accent"}
            disabled={!canConfirm || submitting}
            onClick={() => void confirm()}
          >
            {submitting ? (
              "جاري الحفظ..."
            ) : (
              <span className="flex items-center gap-2">
                {isFree ? (
                  <>
                    <Gift className="h-4 w-4" />
                    تأكيد الفاتورة المجانية
                  </>
                ) : (
                  <>تأكيد البيع · {formatCurrency(totals.total)}</>
                )}
                <kbd className="hidden items-center rounded bg-black/15 px-1.5 py-0.5 text-[10px] sm:inline-flex">
                  <CornerDownLeft className="h-3 w-3" />
                </kbd>
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-text-secondary">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
