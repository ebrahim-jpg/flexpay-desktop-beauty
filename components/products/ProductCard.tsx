"use client";

import { Package, Pencil, Barcode, EyeOff, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import type { ProductDTO } from "@/shared/products";

interface ProductCardProps {
  product: ProductDTO;
  canManage: boolean;
  isOwner: boolean;
  onEdit: (product: ProductDTO) => void;
  onToggleAvailable: (product: ProductDTO, available: boolean) => void;
  onRemoveFromCashier: (product: ProductDTO) => void;
  onRestoreToCashier: (product: ProductDTO) => void;
}

export function ProductCard({
  product,
  canManage,
  isOwner,
  onEdit,
  onToggleAvailable,
  onRemoveFromCashier,
  onRestoreToCashier,
}: ProductCardProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const removed = !product.is_active; // متشال من الكاشير بالكامل

  return (
    <Card className={cn("group relative flex flex-col overflow-hidden", removed && "opacity-70")}>
      {/* الصورة */}
      <div className="relative flex h-32 items-center justify-center bg-surface-secondary">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <Package className="h-10 w-10 text-text-secondary" />
        )}

        {removed ? (
          <span className="absolute right-2 top-2">
            <Badge variant="muted">متشال من البيع</Badge>
          </span>
        ) : (
          !product.is_available && (
            <span className="absolute right-2 top-2">
              <Badge variant="danger">نفد</Badge>
            </span>
          )
        )}

        {canManage && (
          <button
            onClick={() => onEdit(product)}
            className="absolute left-2 top-2 hidden rounded-md bg-surface/95 p-1.5 text-text-primary shadow-sm group-hover:block"
            aria-label="تعديل"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* التفاصيل */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-1 font-medium text-text-primary">{product.name}</p>
        <p className="text-lg font-bold text-primary">
          {formatCurrency(product.price)}
        </p>

        {product.barcode && (
          <p className="flex items-center gap-1 text-xs text-text-secondary" dir="ltr">
            <Barcode className="h-3.5 w-3.5" />
            {product.barcode}
          </p>
        )}

        {canManage && (
          <div className="mt-auto space-y-2 border-t border-border pt-2">
            {removed ? (
              // متشال من الكاشير — المالك بس يقدر يرجّعه
              isOwner && (
                <button
                  onClick={() => onRestoreToCashier(product)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-xs font-medium text-primary transition hover:bg-primary/20"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  رجّعه للبيع
                </button>
              )
            ) : (
              <>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-secondary">متاح للبيع</span>
                  <Switch
                    checked={product.is_available}
                    onCheckedChange={(c) => onToggleAvailable(product, c)}
                  />
                </label>
                {isOwner && (
                  <button
                    onClick={() => onRemoveFromCashier(product)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    شيله من البيع
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
