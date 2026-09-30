"use client";

import { useState } from "react";
import { ShoppingCart, Percent, Trash2, ShoppingBag, UserRound, Gift, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { OrderItemRow } from "./OrderItemRow";
import { DiscountModal } from "./DiscountModal";
import { CheckoutModal } from "./CheckoutModal";
import { FreeRecipientModal } from "./FreeRecipientModal";
import { useCartStore, useCartTotals } from "@/store/cart.store";
import { useSettingsStore } from "@/store/settings.store";
import { useAuthStore } from "@/store/auth.store";
import { usePosUiStore } from "@/store/pos-ui.store";

export function OrderSummary({ onSold }: { onSold?: () => void }) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const canGiveDiscount = useAuthStore((s) => s.hasPermission("canGiveDiscount"));

  const items = useCartStore((s) => s.items);
  const totals = useCartTotals();
  const customerName = useCartStore((s) => s.customerName);
  const isGuest = useCartStore((s) => s.isGuest);
  const itemCount = useCartStore((s) => s.itemCount());
  const clearCart = useCartStore((s) => s.clearCart);
  const isFree = useCartStore((s) => s.isFree);
  const freeRecipientType = useCartStore((s) => s.freeRecipientType);
  const freeRecipientName = useCartStore((s) => s.freeRecipientName);
  const clearFree = useCartStore((s) => s.clearFree);

  const checkoutOpen = usePosUiStore((s) => s.checkoutOpen);
  const setCheckoutOpen = usePosUiStore((s) => s.setCheckoutOpen);

  const [discountOpen, setDiscountOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [freeModalOpen, setFreeModalOpen] = useState(false);

  const empty = items.length === 0;

  return (
    <div
      className={cn(
        "flex h-full w-[380px] shrink-0 flex-col bg-gradient-surface",
        isFree && "ring-2 ring-inset ring-danger/40"
      )}
    >
      {/* Header — البيع السريع + العميل (مفيش توصيل في نسخة البلايستيشن) */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b border-border px-4 py-3.5",
          isFree && "bg-danger/5"
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingBag className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-text-primary">بيع سريع</p>
            <p className="flex items-center gap-1 truncate text-xs text-text-secondary">
              <UserRound className="h-3 w-3 shrink-0" />
              {isGuest ? "زائر" : customerName}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* تبديل الفاتورة المجانية */}
          {isFree ? (
            <div className="flex items-center gap-1 rounded-lg border border-danger bg-danger px-1.5 py-1 text-xs font-semibold text-white">
              <button
                onClick={() => setFreeModalOpen(true)}
                className="flex items-center gap-1.5 px-1"
                title="غيّر المستفيد"
              >
                <Gift className="h-[15px] w-[15px]" />
                <span className="max-w-[110px] truncate">
                  {freeRecipientName || "مجانية"}
                </span>
                {freeRecipientType && (
                  <span className="opacity-80">
                    ({freeRecipientType === "staff" ? "موظف" : "عميل"})
                  </span>
                )}
              </button>
              <button
                onClick={() => clearFree()}
                className="rounded p-0.5 transition-colors hover:bg-white/20"
                title="إلغاء المجانية"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setFreeModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-danger/40 hover:text-danger"
              title="فاتورة مجانية — تتخصم من المخزون لكن متتحسبش في الفلوس"
            >
              <Gift className="h-[15px] w-[15px]" />
              مجانية
            </button>
          )}
          {!empty && (
            <button
              onClick={() => setClearOpen(true)}
              className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
              title="إفراغ الفاتورة"
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>

      {/* البنود */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
              <ShoppingCart className="h-8 w-8 opacity-50" />
            </div>
            <p className="mt-4 font-medium text-text-primary">السلة فاضية</p>
            <p className="mt-1 text-sm text-text-secondary">
              ابدأ بإضافة منتجات أو امسح باركود
            </p>
          </div>
        ) : (
          items.map((item) => <OrderItemRow key={item.lineId} item={item} />)
        )}
      </div>

      {/* الحساب */}
      {!empty && (
        <div className="border-t border-border bg-surface/60 p-4">
          <div className="space-y-1.5 text-sm">
            <Row label="المجموع الفرعي" value={formatCurrency(totals.subtotal)} />
            {totals.discount_amount > 0 && (
              <Row
                label="الخصم"
                value={`−${formatCurrency(totals.discount_amount)}`}
                tone="danger"
              />
            )}
            {totals.tax_amount > 0 && (
              <Row
                label={`الضريبة (${totals.tax_rate}%)`}
                value={`+${formatCurrency(totals.tax_amount)}`}
              />
            )}
          </div>

          <div className="mt-3 flex items-end justify-between border-t border-dashed border-border pt-3">
            <span className="text-sm font-medium text-text-secondary">
              الإجمالي
              <span className="mr-1.5 text-xs text-text-secondary">
                ({itemCount} صنف)
              </span>
            </span>
            <span className="text-2xl font-bold text-primary tabular-nums">
              {formatCurrency(totals.total)}
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            {canGiveDiscount && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setDiscountOpen(true)}
                className="h-14 shrink-0"
              >
                <Percent className="h-4 w-4" />
                خصم
              </Button>
            )}
            <Button
              variant={isFree ? "danger" : "accent"}
              size="lg"
              className={cn(
                "h-14 flex-1 flex-col gap-0 text-lg",
                !isFree && "shadow-gold"
              )}
              onClick={() => setCheckoutOpen(true)}
            >
              <span className="flex items-center gap-2">
                {isFree ? (
                  <>
                    <Gift className="h-4 w-4" />
                    فاتورة مجانية
                  </>
                ) : (
                  <>حساب · {formatCurrency(totals.total)}</>
                )}
              </span>
            </Button>
          </div>
        </div>
      )}

      <DiscountModal open={discountOpen} onOpenChange={setDiscountOpen} />
      <FreeRecipientModal open={freeModalOpen} onOpenChange={setFreeModalOpen} />
      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onComplete={() => onSold?.()}
      />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="إفراغ الفاتورة"
        description="هتمسح كل المنتجات من الفاتورة الحالية. متأكد؟"
        confirmText="إفراغ"
        variant="danger"
        onConfirm={() => clearCart()}
      />
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span
        className={
          tone === "danger"
            ? "text-danger tabular-nums"
            : "text-text-primary tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
