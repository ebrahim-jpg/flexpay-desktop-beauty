import type { RecipeItemDTO } from "@/shared/products";

// تكلفة الإنتاج = Σ (الكمية المعيارية × تكلفة وحدة المادة)
export function calculateProductCost(recipe: RecipeItemDTO[]): number {
  return recipe.reduce(
    (sum, item) => sum + item.standard_qty * item.cost_per_unit,
    0
  );
}

// هامش الربح % = ((السعر − التكلفة) / السعر) × 100
export function calculateProfitMargin(price: number, cost: number): number {
  if (!price || price <= 0) return 0;
  return Math.round(((price - cost) / price) * 100);
}
