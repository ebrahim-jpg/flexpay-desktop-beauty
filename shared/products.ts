// طبقة مشتركة بين الـ Main والـ Renderer لتعريفات المنتجات والفئات.

// نوع البيع: بالقطعة (كمية صحيحة) أو بالوزن/كيلو (كمية عشرية)
export type SaleType = "piece" | "weight";

export const SALE_TYPE_LABELS: Record<SaleType, string> = {
  piece: "بالقطعة",
  weight: "بالوزن (كيلو)",
};

// وحدة العرض لكل نوع
export function saleUnitLabel(saleType: SaleType): string {
  return saleType === "weight" ? "كجم" : "";
}

// ===== الخيارات والإضافات (Modifiers) =====
export interface ModifierOption {
  id: string;
  name: string;
  price_adjustment: number;
  // ===== خصم مخزون الإضافة (المطاعم) =====
  // «جبنة إضافي» = ٣٠ جرام جبنة. الحقلين جوّه نفس JSON الخيارات عن قصد: جدول جانبي
  // بمفتاح `option_id` كان هيبقى هشّ — إعادة بناء المجموعة بتولّد ids جديدة فالوصفة
  // بتبقى يتيمة. هنا الخيار وخصمه بيعيشوا ويموتوا مع بعض.
  // `null`/غايب = الإضافة سعر بس (السلوك القديم لكل المنتجات الموجودة).
  inventory_item_id?: number | null;
  consume_qty?: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  is_required: boolean;
  multi_select: boolean;
  options: ModifierOption[];
}

/**
 * مواد الإضافات المختارة — **دالة نقية** بيستخدمها التسعير (تكلفة البند) وخصم المخزون
 * مع بعض، عشان مايبقاش فيه منطقين بيحسبوا نفس الحاجة بشكل مختلف.
 * بتجمع نفس المادة لو اتكررت في أكتر من خيار.
 */
export function modifierConsumptions(
  groups: ModifierGroup[],
  optionIds: string[]
): { inventory_item_id: number; qty: number }[] {
  const picked = new Set(optionIds);
  const byItem = new Map<number, number>();
  for (const g of groups) {
    for (const o of g.options) {
      if (!picked.has(o.id)) continue;
      const itemId = o.inventory_item_id;
      const qty = o.consume_qty ?? 0;
      if (itemId == null || !(qty > 0)) continue;
      byItem.set(itemId, (byItem.get(itemId) ?? 0) + qty);
    }
  }
  return [...byItem].map(([inventory_item_id, qty]) => ({ inventory_item_id, qty }));
}

// ===== الفئات =====
export interface CategoryDTO {
  id: number;
  local_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  product_count: number;
}

export interface CreateCategoryInput {
  name: string;
  icon?: string | null;
}

export interface UpdateCategoryInput {
  id: number;
  name?: string;
  icon?: string | null;
}

// ===== المنتجات =====
export interface ProductDTO {
  id: number;
  local_id: string;
  name: string;
  description: string | null;
  category_id: number | null;
  category_name: string | null;
  price: number;
  barcode: string | null;
  image: string | null; // data URL للعرض
  is_active: boolean;
  is_available: boolean;
  modifiers: ModifierGroup[];
  cost_price: number;
  profit_margin: number; // %
  sale_type: SaleType;
  /**
   * المنتج ده بيتباع بأحجام؟ (نية صريحة — شوف migration 035)
   * لو `true`: الكاشير **لازم** يختار حجم، والسعر سعر الحجم مش سعر المنتج،
   * وخانة السعر في مودال المنتج بتتقفل (بتتحسب من أرخص حجم).
   */
  has_sizes: boolean;
}

export interface CreateProductInput {
  name: string;
  category_id: number | null;
  price: number;
  description?: string | null;
  barcode?: string | null;
  modifiers?: ModifierGroup[];
  is_active?: boolean;
  is_available?: boolean;
  imageDataUrl?: string | null;
  sale_type?: SaleType;
}

export interface UpdateProductInput {
  id: number;
  name?: string;
  category_id?: number | null;
  price?: number;
  description?: string | null;
  barcode?: string | null;
  modifiers?: ModifierGroup[];
  is_active?: boolean;
  is_available?: boolean;
  imageDataUrl?: string | null; // صورة جديدة
  removeImage?: boolean;
  sale_type?: SaleType;
}

// ===== الوصفات =====
/** مدخل قراءة الوصفة: رقم = كل صفوف المنتج (توافق) · كائن = نطاق محدد */
export type GetRecipeInput = number | { product_id: number; variant_id?: number | null };

export interface RecipeItemDTO {
  inventory_item_id: number;
  inventory_item_name: string;
  unit: string;
  standard_qty: number;
  cost_per_unit: number;
  line_cost: number;
}

export interface SaveRecipeInput {
  product_id: number;
  items: { inventory_item_id: number; standard_qty: number }[];
  /**
   * نطاق الوصفة: `null`/غايب = **مشترك لكل الأحجام**، رقم = وصفة الحجم ده.
   * ⚠️ الحفظ بيمسح ويكتب **في نطاقه بس** — حفظ اللارج مايمسحش السمول ولا المشترك.
   */
  variant_id?: number | null;
}

export interface ProductCostSummary {
  cost: number;
  price: number;
  profit_margin: number;
}

// نظرة عامة على وصفات كل المنتجات (لتاب الوصفات في المخزون)
export interface RecipeOverviewItem {
  productId: number;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  price: number;
  isActive: boolean;
  /** مكوّنات المنتج — وللمنتج بأحجام: **المشتركة** بس (الخاصة بكل حجم في `sizes`) */
  items: { name: string; qty: number; unit: string }[];
  /**
   * تكلفة الوصفة. للمنتج بأحجام = تكلفة **أرخص حجم** (مطابِقة لسعره المعروض)،
   * مش مجموع وصفات الأحجام كلها — الجمع كان بيطلّع تكلفة متضخّمة وهامش مغلوط.
   */
  cost: number;
  margin: number | null; // % (null لو مفيش تكلفة/سعر)
  /** أحجام المنتج بتكلفة كل واحد — فاضية للمنتج بلا أحجام */
  sizes: { size: string; price: number; cost: number; hasRecipe: boolean }[];
}
