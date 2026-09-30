"use client";

import { Star, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import type { CustomerDTO } from "@/shared/customers";

export function FavoriteProduct({ customer }: { customer: CustomerDTO }) {
  if (!customer.favorite_product_name || customer.total_visits === 0) {
    return (
      <EmptyState
        icon={Package}
        title="مفيش مشتريات بعد"
        description="هيظهر هنا المنتج المفضل بعد أول فاتورة للعميل."
      />
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-sm text-text-secondary">
        <Star className="h-4 w-4 text-accent" />
        المفضل دايماً
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-secondary">
          <Package className="h-7 w-7 text-text-secondary" />
        </div>
        <div>
          <p className="text-lg font-bold text-text-primary">
            {customer.favorite_product_name}
          </p>
          <p className="text-sm text-text-secondary">المنتج الأكثر طلباً</p>
        </div>
      </div>
    </Card>
  );
}
