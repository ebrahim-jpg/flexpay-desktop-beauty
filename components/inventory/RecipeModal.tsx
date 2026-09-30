"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecipeBuilder } from "@/components/products/RecipeBuilder";

// مودال تعديل وصفة منتج — يعيد استخدام RecipeBuilder بتاع شاشة المنتجات
export function RecipeModal({
  product,
  onOpenChange,
  onSaved,
}: {
  product: { id: number; name: string; price: number } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>وصفة: {product?.name ?? ""}</DialogTitle>
        </DialogHeader>
        {product && (
          <RecipeBuilder
            key={product.id}
            productId={product.id}
            price={product.price}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
