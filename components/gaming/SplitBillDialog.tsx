"use client";
import { productWithSize } from "@/shared/sizes";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, SplitSquareHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { useAuthStore } from "@/store/auth.store";
import { useManagerGuardStore } from "@/store/manager-guard.store";
import { cn } from "@/lib/utils";
import type { GamingSessionDTO } from "@/shared/gaming";
import type { DiscountType, OrderDTO } from "@/shared/orders";

interface SplitBillDialogProps {
  session: GamingSessionDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** بعد كل جزء: الفاتورة + الحساب بعد التحديث (مقفول لو ده آخر جزء) */
  onPaid: (order: OrderDTO, session: GamingSessionDTO) => void;
}

type SplitQuote = { subtotal: number; discount_amount: number; tax_rate: number; tax_amount: number; total: number };

// تقسيم فاتورة الطاولة: كل واحد بيختار اللي هيدفعه (كمية جزئية مسموحة) → فاتورة لوحدها،
// والحساب يفضل مفتوح بالباقي. الإجمالي من السيرفر (`gaming:session:quoteSplit`) بنفس تسعير الفاتورة.
export function SplitBillDialog({ session, open, onOpenChange, onPaid }: SplitBillDialogProps) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const allPaymentMethods = useSettingsStore((s) => s.paymentMethods);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const paymentMethods = useMemo(() => allPaymentMethods.filter((m) => m.enabled), [allPaymentMethods]);
  const canDiscount = hasPermission("canGiveDiscount");

  const [qty, setQty] = useState<Record<number, number>>({});
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [discountValue, setDiscountValue] = useState("");
  const [method, setMethod] = useState("cash");
  const [received, setReceived] = useState("");
  const [quote, setQuote] = useState<SplitQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const discountNum = Math.max(0, Number(discountValue) || 0);
  const lines = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => ({ item_id: Number(id), quantity: q })),
    [qty]
  );

  // عند الفتح: صفّر كل حاجة
  useEffect(() => {
    if (!open) return;
    setQty({});
    setDiscountType("none");
    setDiscountValue("");
    setMethod(paymentMethods[0]?.key ?? "cash");
    setReceived("");
    setQuote(null);
    setQuoteError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // SPLIT_QUOTE: العرض من السيرفر كل ما الاختيار أو الخصم يتغيّر
  useEffect(() => {
    if (!open || !session || lines.length === 0) {
      setQuote(null);
      return;
    }
    let alive = true;
    invoke("gaming:session:quoteSplit", {
      session_id: session.id,
      lines,
      discount_type: discountType,
      discount_value: discountType === "none" ? 0 : discountNum,
    })
      .then((q) => {
        if (!alive) return;
        setQuote(q);
        setQuoteError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setQuote(null);
        setQuoteError(e instanceof Error ? e.message : "تعذّر حساب الجزء");
      });
    return () => {
      alive = false;
    };
  }, [open, session, lines, discountType, discountNum, invoke]);

  const total = quote?.total ?? 0;
  const isCash = method === "cash";
  const receivedNum = received === "" ? total : Number(received) || 0;
  const change = isCash ? receivedNum - total : 0;

  function step(itemId: number, max: number, delta: number) {
    setQty((q) => ({ ...q, [itemId]: Math.min(max, Math.max(0, (q[itemId] ?? 0) + delta)) }));
  }

  function confirm() {
    if (!session || !quote) return;
    if (isCash && receivedNum < total - 0.001) {
      toast.error("المدفوع أقل من إجمالي الجزء");
      return;
    }
    const role = useAuthStore.getState().currentUser?.role;
    const isPrivileged = role === "owner" || role === "manager";
    useManagerGuardStore.getState().request(isPrivileged, () => void record());
  }

  async function record() {
    if (!session) return;
    try {
      setSubmitting(true);
      const result = await invoke("gaming:session:splitCheckout", {
        session_id: session.id,
        lines,
        payment_method: method,
        amount_paid: isCash ? receivedNum : total,
        discount_type: discountType,
        discount_value: discountType === "none" ? 0 : discountNum,
      });
      toast.success(
        result.session.status === "closed"
          ? `آخر جزء اتدفع — ${session.room_name} اتقفلت (${formatCurrency(result.order.total)})`
          : `اتدفع جزء ${formatCurrency(result.order.total)} — الحساب لسه مفتوح بالباقي`
      );
      onPaid(result.order, result.session);
      setQty({});
      setReceived("");
      if (result.session.status === "closed") onOpenChange(false);
      void invoke("orders:printReceipt", result.order.id).catch(() =>
        toast.error("اتدفع لكن تعذّرت الطباعة — راجع إعدادات الطابعة")
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر دفع الجزء");
    } finally {
      setSubmitting(false);
    }
  }

  const items = session?.items ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SplitSquareHorizontal className="h-5 w-5" />
            قسّم الفاتورة — {session?.room_name}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-text-secondary">
          اختار اللي الشخص ده هيدفعه. هتطلع فاتورة بيه لوحده، والباقي يفضل على الطاولة لحد ما يتدفع.
        </p>

        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-secondary">مفيش طلبات على الحساب</p>
          ) : (
            items.map((it) => {
              const q = qty[it.id] ?? 0;
              return (
                <div
                  key={it.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border p-2 text-sm",
                    q > 0 ? "border-primary/50 bg-primary/5" : "border-border"
                  )}
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-medium text-text-primary">
                      {productWithSize(it.product_name, it.variant_size)}
                    </p>
                    <p className="text-xs text-text-secondary">على الحساب: {it.quantity}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="outline" disabled={q <= 0} onClick={() => step(it.id, it.quantity, -1)} aria-label="أقل">
                      <Minus />
                    </Button>
                    <span className="w-8 text-center font-bold tabular-nums">{q}</span>
                    <Button size="icon" variant="outline" disabled={q >= it.quantity} onClick={() => step(it.id, it.quantity, 1)} aria-label="أكتر">
                      <Plus />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setQty((s) => ({ ...s, [it.id]: it.quantity }))}>
                      الكل
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {canDiscount && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label>خصم على الجزء</Label>
              <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
                <option value="none">بدون</option>
                <option value="fixed">مبلغ</option>
                <option value="percentage">نسبة %</option>
              </Select>
            </div>
            {discountType !== "none" && (
              <div className="w-28 space-y-1">
                <Label>القيمة</Label>
                <Input type="number" min={0} dir="ltr" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {quoteError && <p className="rounded-lg bg-danger/10 p-2 text-sm text-danger">{quoteError}</p>}

        <div className="rounded-lg bg-primary/10 p-3">
          {quote && (quote.discount_amount > 0 || quote.tax_amount > 0) && (
            <div className="mb-2 space-y-1 border-b border-primary/15 pb-2 text-xs text-text-secondary">
              <div className="flex justify-between">
                <span>المجموع</span>
                <span className="tabular-nums">{formatCurrency(quote.subtotal)}</span>
              </div>
              {quote.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span>الخصم</span>
                  <span className="tabular-nums">−{formatCurrency(quote.discount_amount)}</span>
                </div>
              )}
              {quote.tax_amount > 0 && (
                <div className="flex justify-between">
                  <span>الضريبة ({quote.tax_rate}%)</span>
                  <span className="tabular-nums">+{formatCurrency(quote.tax_amount)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="font-medium text-text-primary">إجمالي الجزء</span>
            <span className="text-2xl font-bold text-primary tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>

        {paymentMethods.length > 1 && (
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {paymentMethods.map((pm) => (
              <option key={pm.key} value={pm.key}>
                {pm.label}
              </option>
            ))}
          </Select>
        )}
        {isCash && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label>المدفوع</Label>
              <Input type="number" min={0} dir="ltr" value={received} placeholder={String(total)} onChange={(e) => setReceived(e.target.value)} />
            </div>
            <p className={cn("pb-2 text-sm tabular-nums", change < 0 ? "text-danger" : "text-text-secondary")}>
              الباقي: {formatCurrency(Math.max(0, change))}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            رجوع
          </Button>
          <Button variant="accent" disabled={!quote || lines.length === 0 || submitting} onClick={confirm}>
            ادفع الجزء ده
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
