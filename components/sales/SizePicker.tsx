"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import type { SizeDTO } from "@/shared/sizes";
import type { ProductDTO } from "@/shared/products";

/**
 * منتقي حجم المنتج — بيظهر قبل الخيارات لأي منتج `has_sizes`.
 *
 * ⚠️ الفرق عن منتقي المقاس في الملابس: **مفيش رصيد على الحجم**. مخزون المطعم في
 * المواد عبر الوصفات، فالحجم بيعرض **سعره** بس — مفيش «متاح ٣» ولا «خلص».
 * (ومنتج مكوّناته خلصت بيتخفي كله من المنيو، فمابنوصلش للمنتقي أصلاً.)
 */
export function SizePicker({
  product,
  onOpenChange,
  onPick,
  title,
  description = "اختار الحجم",
}: {
  product: ProductDTO | null;
  onOpenChange: (open: boolean) => void;
  onPick: (size: SizeDTO) => void;
  title?: string;
  description?: string;
}) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const [sizes, setSizes] = useState<SizeDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!product) return;
    let active = true;
    setLoading(true);
    void invoke("sizes:getByProduct", product.id)
      .then((list) => {
        if (!active) return;
        setSizes(list.filter((s) => s.is_active));
      })
      .catch(() => {
        if (active) setSizes([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [product, invoke]);

  function pick(s: SizeDTO) {
    onPick(s);
    onOpenChange(false);
  }

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? product?.name}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-text-secondary">جاري التحميل...</p>
        ) : sizes.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">
            كل أحجام المنتج ده موقوفة — ظبّطها من إدارة المنتجات.
          </p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {sizes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s)}
                className={cn(
                  "rounded-xl border border-border p-4 text-center transition-colors",
                  "hover:border-primary hover:bg-primary/5"
                )}
              >
                <div className="text-lg font-bold text-text-primary">{s.size}</div>
                <div className="mt-1 text-sm font-semibold text-primary">
                  {formatCurrency(s.price)}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
