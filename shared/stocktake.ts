// الجرد (Stocktake) — مشترك بين الـ Main والـ Renderer

export type StocktakeScopeType = "all" | "categories" | "manual";

export interface StocktakeScopeInput {
  type: StocktakeScopeType;
  categories?: string[]; // لما type = categories
  itemIds?: number[]; // لما type = manual
  excludeItemIds?: number[]; // استثناء مواد معيّنة
}

// صف للعدّ (المتوقع) — بيرجع وقت بدء الجرد
export interface StocktakeCountRow {
  inventory_item_id: number;
  item_name: string;
  unit: string;
  category: string | null;
  expected_qty: number; // اللي السيستم شايفه (أعلى النطاق)
  expected_min: number; // أقل كمية مقبولة بعد التهدير المسموح
  waste_percentage: number;
  cost_per_unit: number;
}

export type StocktakeStatus = "ok" | "shortage" | "surplus";

// المقارنة مع مراعاة نسبة التهدير (نطاق [min, expected]).
// counted داخل النطاق = تمام (variance 0). أقل = عجز (من حد التهدير). أكتر = زيادة (من السيستم).
export function evaluateStocktake(
  expected: number,
  counted: number,
  wastePercentage: number
): { expectedMin: number; variance: number; status: StocktakeStatus } {
  const expectedMin = expected - expected * (Math.max(0, wastePercentage) / 100);
  if (counted > expected) {
    return { expectedMin, variance: counted - expected, status: "surplus" };
  }
  if (counted < expectedMin) {
    return { expectedMin, variance: counted - expectedMin, status: "shortage" };
  }
  return { expectedMin, variance: 0, status: "ok" };
}

export interface StocktakeItemInput {
  inventory_item_id: number;
  counted_qty: number;
}

export interface CommitStocktakeInput {
  reference?: string | null;
  notes?: string | null;
  scope?: StocktakeScopeInput;
  items: StocktakeItemInput[]; // المواد اللي اتعدّت بكميتها الفعلية
}

export interface StocktakeItemDTO {
  id: number;
  inventory_item_id: number;
  item_name: string;
  unit: string | null;
  category: string | null;
  expected_qty: number;
  expected_min: number; // أقل كمية مقبولة بعد التهدير
  waste_percentage: number;
  counted_qty: number;
  variance_qty: number; // الفرق غير الطبيعي بعد التهدير (سالب = عجز)
  cost_per_unit: number;
  variance_value: number;
}

export interface StocktakeDTO {
  id: number;
  local_id: string;
  reference: string | null;
  counted_at: string;
  item_count: number;
  shortage_value: number; // قيمة العجز (موجب)
  surplus_value: number; // قيمة الزيادة (موجب)
  variance_value: number; // الصافي (surplus - shortage)
  notes: string | null;
  created_by_name: string;
  created_at: string;
  items: StocktakeItemDTO[];
}

export interface StocktakeListItem {
  id: number;
  reference: string | null;
  counted_at: string;
  item_count: number;
  shortage_value: number;
  surplus_value: number;
  variance_value: number;
  created_by_name: string;
  created_at: string;
}
