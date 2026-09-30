"use client";
import { productWithSize } from "@/shared/sizes";

import { Minus, Plus, Trash2, StickyNote } from "lucide-react";
import { useCartStore } from "@/store/cart.store";
import { useSettingsStore } from "@/store/settings.store";
import type { CartItem } from "@/shared/orders";

// ⚠️ نسخة البلايستيشن: المنتجات كلها بالقطعة — مفيش خانة وزن (البيع بالكيلو اتشال)
export function OrderItemRow({ item }: { item: CartItem }) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const incrementQuantity = useCartStore((s) => s.incrementQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const modifiersText = item.selectedModifiers.map((m) => m.option_name).join("، ");

  return (
    <div className="group rounded-xl border border-transparent px-2 py-2.5 transition-colors hover:border-border hover:bg-surface-secondary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-text-primary">
            {productWithSize(item.productName, item.variantSize)}
          </p>
          {modifiersText && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              {modifiersText}
            </p>
          )}
          {item.itemNotes && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-accent-foreground">
              <StickyNote className="h-3 w-3 shrink-0" />
              {item.itemNotes}
            </p>
          )}
          {/* سعر الوحدة المرجعي */}
          <p className="mt-0.5 text-[11px] text-text-secondary">
            {formatCurrency(item.unitPrice)} للقطعة
          </p>
        </div>

        <button
          onClick={() => removeItem(item.lineId)}
          className="shrink-0 rounded-md p-1 text-text-secondary opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
          aria-label="حذف"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* أزرار +/− + الإجمالي */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => incrementQuantity(item.lineId, -1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-primary transition-colors hover:border-primary hover:bg-primary/5"
            aria-label="ناقص"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-base font-bold text-text-primary tabular-nums">
            {item.quantity}
          </span>
          <button
            onClick={() => incrementQuantity(item.lineId, 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-primary transition-colors hover:border-primary hover:bg-primary/5"
            aria-label="زائد"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <span className="text-base font-bold text-primary tabular-nums">
          {formatCurrency(item.totalPrice)}
        </span>
      </div>
    </div>
  );
}
