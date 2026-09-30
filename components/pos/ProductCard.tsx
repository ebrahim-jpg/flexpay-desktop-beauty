"use client";

import { Package, Plus } from "lucide-react";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import type { ProductDTO } from "@/shared/products";

interface ProductCardProps {
  product: ProductDTO;
  onSelect: (product: ProductDTO) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const disabled = !product.is_available;

  return (
    <button
      onClick={() => !disabled && onSelect(product)}
      disabled={disabled}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-right shadow-sm transition-all duration-150",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0 active:shadow-sm"
      )}
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface-secondary">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            className={cn(
              "h-full w-full object-cover transition-transform duration-200 group-hover:scale-105",
              disabled && "grayscale"
            )}
          />
        ) : (
          <Package className="h-10 w-10 text-text-secondary" />
        )}

        {/* شارات */}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {product.modifiers.length > 0 && !disabled && (
            <span className="rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
              خيارات
            </span>
          )}
        </div>

        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="rounded-md bg-danger px-3 py-1 text-sm font-bold text-white">
              نفد
            </span>
          </div>
        )}

        {/* زر إضافة يظهر عند المرور */}
        {!disabled && (
          <span className="absolute bottom-2 left-2 flex h-8 w-8 translate-y-1 items-center justify-center rounded-full bg-accent text-accent-foreground opacity-0 shadow-gold transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
            <Plus className="h-4 w-4" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-tight text-text-primary">
          {product.name}
        </p>
        <p className="mt-auto text-base font-bold text-primary tabular-nums">
          {formatCurrency(product.price)}
        </p>
      </div>
    </button>
  );
}
