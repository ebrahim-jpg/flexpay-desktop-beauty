// أحجام المنتج (product_variants) — نسخة المطاعم.
//
// ⚠️ الفرق الجوهري عن نسخة الملابس: هناك الفاريانت **وحدة مخزون** (الرصيد والباركود
// عليه). هنا الحجم محور **سعر ووصفة** بس، والرصيد فاضل في المواد (`inventory_items`)
// عبر الوصفات. فمفيش `stock_qty` ولا باركود ولا حد تنبيه على الحجم.
//
// والفرق عن الخيارات (modifiers): الحجم **بديل سعر** (بيستبدل سعر المنتج) وواحد
// إجباري وليه وصفة. الخيار **زيادة سعر** (`price_adjustment`) ومتعدد واختياري.

export interface SizeDTO {
  id: number;
  local_id: string;
  product_id: number;
  product_name: string;
  size: string;
  sort_order: number;
  price_override: number | null; // null = يرث سعر المنتج
  price: number; // السعر الفعّال (override ?? سعر المنتج)
  cost_price: number; // تكلفة وصفة الحجم + المشترك
  profit_margin: number; // % من سعر الحجم
  is_active: boolean;
  has_recipe: boolean; // فيه وصفة خاصة بالحجم؟ (تحذير في الواجهة لو لأ)
}

export interface SizeInput {
  size: string;
  price_override?: number | null;
  sort_order?: number;
  is_active?: boolean;
}

// حفظ مصفوفة أحجام منتج: اللي مالوش id يتعمل، والمختفي من المصفوفة يتشال (soft delete).
// ⚠️ بتحدّث `products.has_sizes` و`products.price` (أرخص حجم) في نفس الـtransaction.
export interface SaveSizesInput {
  product_id: number;
  sizes: (SizeInput & { id?: number | null })[];
}

/** وصف الحجم للعرض والفاتورة والتذكرة */
export function sizeLabel(size: string | null | undefined): string {
  const s = (size ?? "").trim();
  return s.length ? s : "";
}

/** «بيتزا — لارج» للفاتورة وتذكرة المطبخ */
export function productWithSize(productName: string, size: string | null | undefined): string {
  const s = sizeLabel(size);
  return s ? `${productName} — ${s}` : productName;
}
