"use client";
import { productWithSize } from "@/shared/sizes";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, ChefHat, CreditCard, Gift, RefreshCw, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CustomerSearch } from "@/components/pos/CustomerSearch";
import { FreeRecipientModal } from "@/components/pos/FreeRecipientModal";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { useAuthStore } from "@/store/auth.store";
import { useManagerGuardStore } from "@/store/manager-guard.store";
import { cn } from "@/lib/utils";
import { formatDuration, type GamingSessionDTO, type SessionQuote } from "@/shared/gaming";
import type { DiscountType, OrderDTO } from "@/shared/orders";

interface SessionCheckoutModalProps {
  session: GamingSessionDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (order: OrderDTO) => void;
}

interface FreeRecipient {
  type: "staff" | "customer";
  id: number;
  name: string;
}

const PM_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-5 w-5" />,
  card: <CreditCard className="h-5 w-5" />,
  instapay: <Wallet className="h-5 w-5" />,
};

// حساب الطاولة = فاتورة عادية بالطلبات. الأرقام كلها من السيرفر (`gaming:session:quote`)
// بنفس دالة الحساب اللي هتتسجّل — مفيش حساب موازي في الواجهة يختلف عن الفاتورة.
// فيه نفس أدوات الكاشير: عميل سريع · خصم · فاتورة مجانية (موظف/عميل).
export function SessionCheckoutModal({ session, open, onOpenChange, onComplete }: SessionCheckoutModalProps) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const allPaymentMethods = useSettingsStore((s) => s.paymentMethods);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const paymentMethods = useMemo(() => allPaymentMethods.filter((m) => m.enabled), [allPaymentMethods]);
  const canDiscount = hasPermission("canGiveDiscount");

  const [quote, setQuote] = useState<SessionQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [discountValue, setDiscountValue] = useState("");
  const [method, setMethod] = useState("cash");
  const [received, setReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState<{ id: number | null; name: string }>({ id: null, name: "زائر" });
  const [free, setFree] = useState<FreeRecipient | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);

  const discountNum = Math.max(0, Number(discountValue) || 0);
  const isFree = free !== null;

  const fetchQuote = useCallback(async (): Promise<SessionQuote | null> => {
    if (!session) return null;
    try {
      const q = await invoke("gaming:session:quote", {
        session_id: session.id,
        discount_type: discountType,
        discount_value: discountType === "none" ? 0 : discountNum,
      });
      setQuote(q);
      setQuoteError(null);
      return q;
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "تعذّر حساب الطاولة");
      return null;
    }
  }, [invoke, session, discountType, discountNum]);

  // عند الفتح: صفّر الحالة، والعميل يبدأ بعميل الحساب لو اتحدد وقت الفتح
  useEffect(() => {
    if (open) {
      setDiscountType("none");
      setDiscountValue("");
      setMethod(paymentMethods[0]?.key ?? "cash");
      setReceived("");
      setQuote(null);
      setFree(null);
      setCustomer(
        session?.customer_id != null
          ? { id: session.customer_id, name: session.customer_name ?? "عميل" }
          : { id: null, name: "زائر" }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // العرض بيتحدّث مع الخصم وكل 15 ثانية (الوقت شغّال)
  useEffect(() => {
    if (!open) return;
    void fetchQuote();
    const t = setInterval(() => void fetchQuote(), 15_000);
    return () => clearInterval(t);
  }, [open, fetchQuote]);

  const total = quote?.total ?? 0;
  const isCash = method === "cash";
  const itemsNoun = "الطلبات";
  // أصناف لسه ماراحتش للمطبخ — بتتطبع تلقائي قبل الفاتورة
  const pendingKitchen = (session?.items ?? []).filter(
    (it) => it.quantity - it.sent_qty > 0.0001
  ).length;
  const receivedNum = received === "" ? total : Number(received) || 0;
  const change = isCash ? receivedNum - total : 0;

  const quickAmounts = useMemo(() => {
    const set = new Set<number>([Math.ceil(total)]);
    [5, 10, 20, 50, 100].forEach((step) => set.add(Math.ceil(total / step) * step));
    return [...set].filter((v) => v >= total && v > 0).sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  async function confirm() {
    // تحديث أخير قبل القبض — الدقيقة ممكن تكون عدّت من آخر عرض
    const q = await fetchQuote();
    if (!q) return;
    const paid = received === "" ? q.total : Number(received) || 0;
    if (!isFree && isCash && paid < q.total - 0.001) {
      toast.error(`الإجمالي بقى ${formatCurrency(q.total)} — راجع المدفوع`);
      return;
    }
    const role = useAuthStore.getState().currentUser?.role;
    const isPrivileged = role === "owner" || role === "manager";
    useManagerGuardStore.getState().request(isPrivileged, () => void record(q, paid));
  }

  async function record(q: SessionQuote, paid: number) {
    if (!session) return;
    try {
      setSubmitting(true);
      const result = await invoke("gaming:session:checkout", {
        session_id: session.id,
        payment_method: method,
        amount_paid: isFree ? 0 : isCash ? paid : q.total,
        discount_type: discountType,
        discount_value: discountType === "none" ? 0 : discountNum,
        customer_id: customer.id,
        is_free: isFree,
        free_recipient_type: free?.type ?? null,
        free_recipient_id: free?.id ?? null,
        free_recipient_name: free?.name ?? null,
      });
      toast.success(
        isFree
          ? `اتسجّلت فاتورة مجانية لـ${free?.name} — ${session.room_name}`
          : `اتحاسبت ${session.room_name} — ${formatCurrency(result.order.total)}`
      );
      onOpenChange(false);
      onComplete(result.order);
      void invoke("orders:printReceipt", result.order.id).catch(() =>
        toast.error("اتحاسبت لكن تعذّرت الطباعة — راجع إعدادات الطابعة")
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إتمام الحساب");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-lg", isFree && "ring-2 ring-danger/40")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isFree && <Gift className="h-5 w-5 text-danger" />}
            <span className={cn(isFree && "text-danger")}>
              {isFree ? "فاتورة مجانية" : "حساب"} {session?.room_name} — {session?.session_label}
            </span>
          </DialogTitle>
        </DialogHeader>

        {quoteError ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{quoteError}</p>
            <Button variant="outline" onClick={() => void fetchQuote()}>
              <RefreshCw />
              حاول تاني
            </Button>
          </div>
        ) : !quote ? (
          <p className="py-8 text-center text-sm text-text-secondary">جاري الحساب...</p>
        ) : (
          <div className="max-h-[75vh] space-y-4 overflow-y-auto pl-1">
            {/* العميل + المجانية — نفس أدوات الكاشير */}
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <CustomerSearch
                  value={customer}
                  onChange={(id, name) => setCustomer({ id, name })}
                  inputId="session-customer-search"
                />
              </div>
              {isFree ? (
                <div className="flex shrink-0 items-center gap-1 rounded-lg border border-danger bg-danger px-2 py-2 text-xs font-semibold text-white">
                  <button type="button" onClick={() => setFreeOpen(true)} className="flex items-center gap-1" title="غيّر المستفيد">
                    <Gift className="h-4 w-4" />
                    <span className="max-w-[100px] truncate">{free?.name}</span>
                  </button>
                  <button type="button" onClick={() => setFree(null)} className="rounded p-0.5 hover:bg-white/20" title="إلغاء المجانية">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="h-auto shrink-0 py-2.5 hover:border-danger/40 hover:text-danger"
                  onClick={() => setFreeOpen(true)}
                  title="فاتورة مجانية — تتخصم من المخزون لكن متتحسبش في الفلوس"
                >
                  <Gift />
                  مجانية
                </Button>
              )}
            </div>

            {/* القعدة للمعلومية بس — الطاولة مالهاش سعر وقت */}
            <p className="text-xs text-text-secondary">القعدة لحد دلوقتي: {formatDuration(quote.actual_minutes)}</p>

            {/* المشروبات */}
            {session && session.items.length > 0 && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="mb-1 text-text-secondary">
                  {session.items
                    .map((it) => `${productWithSize(it.product_name, it.variant_size)} × ${it.quantity}`)
                    .join("، ")}
                </div>
                <div className="flex justify-between font-semibold text-text-primary">
                  <span>{itemsNoun}</span>
                  <span className="tabular-nums">{formatCurrency(quote.items_subtotal)}</span>
                </div>
              </div>
            )}

            {/* ⚠️ قرار المالك: **كل صنف بياخد تذكرة تجهيز**. فلو النادل حاسب وفيه
                أصناف ماراحتش للمطبخ، بتتطبع تلقائي قبل الفاتورة — والنادل يعرف كده
                قبل ما يأكّد بدل ما ورقة تطلع مفاجأة. */}
            {pendingKitchen > 0 && (
              <p className="flex items-center gap-1.5 rounded-lg bg-accent/10 p-2.5 text-xs text-accent-foreground">
                <ChefHat className="h-4 w-4 shrink-0" />
                فيه {pendingKitchen} صنف ماراحش للمطبخ — هيتطبعوا في تذكرة قبل الفاتورة
              </p>
            )}

            {/* الخصم */}
            {canDiscount && !isFree && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label>خصم</Label>
                  <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
                    <option value="none">بدون</option>
                    <option value="fixed">مبلغ</option>
                    <option value="percentage">نسبة %</option>
                  </Select>
                </div>
                {discountType !== "none" && (
                  <div className="w-28 space-y-1">
                    <Label>القيمة</Label>
                    <Input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} dir="ltr" />
                  </div>
                )}
              </div>
            )}

            {/* الإجمالي */}
            {isFree ? (
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-text-secondary">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-text-primary">قيمة الفاتورة</span>
                  <span className="text-2xl font-bold text-danger tabular-nums line-through decoration-danger/50">
                    {formatCurrency(total)}
                  </span>
                </div>
                <p>
                  فاتورة مجانية لـ<b className="text-text-primary">{free?.name}</b> ({free?.type === "staff" ? "موظف" : "عميل"}): {itemsNoun}
                  بتتخصم من المخزون عادي، لكن <b className="text-danger">متتحسبش في الفلوس</b> وبتظهر بالأحمر للمراجعة.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-primary/10 p-3">
                {(quote.discount_amount > 0 || quote.tax_amount > 0) && (
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
                  <span className="font-medium text-text-primary">الإجمالي</span>
                  <span className="text-2xl font-bold text-primary tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            {/* طريقة الدفع */}
            {!isFree && paymentMethods.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.map((pm) => (
                  <button
                    key={pm.key}
                    type="button"
                    onClick={() => setMethod(pm.key)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-sm font-medium transition-colors",
                      method === pm.key ? "border-primary bg-primary/10 text-text-primary" : "border-border hover:bg-surface-secondary"
                    )}
                  >
                    {PM_ICONS[pm.key] ?? <Wallet className="h-5 w-5" />}
                    {pm.label}
                  </button>
                ))}
              </div>
            )}

            {!isFree && isCash && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="w-16 shrink-0">المدفوع</Label>
                  <Input
                    type="number"
                    min={0}
                    value={received}
                    placeholder={String(Number(total.toFixed(2)))}
                    onChange={(e) => setReceived(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setReceived(String(amt))}
                      className="rounded-md border border-border py-2 text-sm font-medium hover:bg-surface-secondary"
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-lg bg-success/10 p-3">
                  <span className="font-medium text-text-primary">الباقي</span>
                  <span className="text-lg font-bold text-success tabular-nums">{formatCurrency(Math.max(0, change))}</span>
                </div>
              </div>
            )}

            <Button
              size="lg"
              variant={isFree ? "danger" : "accent"}
              className="h-14 w-full text-lg"
              disabled={submitting || (!isFree && isCash && receivedNum < total - 0.001)}
              onClick={() => void confirm()}
            >
              {submitting ? "جاري الحفظ..." : isFree ? "تأكيد الفاتورة المجانية" : `تأكيد الحساب · ${formatCurrency(total)}`}
            </Button>
          </div>
        )}

        <FreeRecipientModal
          open={freeOpen}
          onOpenChange={setFreeOpen}
          onPick={(type, id, name) => {
            setFree({ type, id, name });
            // مجانية لعميل = الفاتورة تتربط بيه عشان تظهر في بروفايله (نفس سلوك الكاشير)
            if (type === "customer") setCustomer({ id, name });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
