"use client";

import { Scissors } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProductCard } from "./ProductCard";
import type { ProductDTO } from "@/shared/products";

interface ProductGridProps {
  products: ProductDTO[];
  canManage: boolean;
  isOwner: boolean;
  onEdit: (product: ProductDTO) => void;
  onToggleAvailable: (product: ProductDTO, available: boolean) => void;
  onRemoveFromCashier: (product: ProductDTO) => void;
  onRestoreToCashier: (product: ProductDTO) => void;
  onAdd: () => void;
}

export function ProductGrid({
  products,
  canManage,
  isOwner,
  onEdit,
  onToggleAvailable,
  onRemoveFromCashier,
  onRestoreToCashier,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Scissors}
        title="مفيش خدمات هنا"
        description="ابدأ بإضافة أول خدمة في الفئة دي."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          canManage={canManage}
          isOwner={isOwner}
          onEdit={onEdit}
          onToggleAvailable={onToggleAvailable}
          onRemoveFromCashier={onRemoveFromCashier}
          onRestoreToCashier={onRestoreToCashier}
        />
      ))}
    </div>
  );
}
