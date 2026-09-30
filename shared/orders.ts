// طبقة مشتركة بين الـ Main والـ Renderer — الطلبات والكاشير.
import type { SaleType } from "./products";

// عرض الكمية بالوحدة: وزن "0.5 كجم" | قطعة "× 2"
export function formatQty(quantity: number, saleType: SaleType): string {
  if (saleType === "weight") {
    const n = Number(quantity.toFixed(3));
    return `${n} كجم`;
  }
  return `× ${quantity}`;
}

// عادي = الزبون بياخد ويمشي (يصح زائر) | توصيل = لازم عميل محدد
export type OrderType = "counter" | "delivery";

// مصدر الطلب: الكاشير (تيك أواي/توصيل) | جاي من المنيو الأونلاين | حساب طاولة في الصالة
// — المصدر هو «القسم» في التقارير: الصالة / الكاشير / أونلاين
export type OrderSource = "pos" | "online_store" | "table_session";

export const ORDER_SOURCE_LABELS: Record<string, string> = {
  pos: "الكاشير",
  online_store: "أونلاين",
  // ⚠️ المفتاح في الداتابيز لسه `table_session` — «جلسة» هو لفظه في التجميل (مفيش migration)
  table_session: "جلسة",
};

// بند خدمة بلا منتج (وقت لعب) — بيدخل الإجمالي والخصم والضريبة زي أي بند،
// بس **مابيخصمش مخزون** ومالوش فئة (البائع المحدّد بفئات مابيتحسبلوش).
export interface ServiceLineInput {
  name: string;
  price: number;
}

// المستفيد من الفاتورة المجانية: موظف (من المستخدمين) أو عميل
export type FreeRecipientType = "staff" | "customer";
export type DiscountType = "none" | "percentage" | "fixed";
export type OrderStatus = "paid" | "cancelled";

// "counter" محفوظ كقيمة لكن معناه "عادي". "takeaway" قيمة قديمة (legacy).
export const ORDER_TYPE_LABELS: Record<string, string> = {
  // ⚠️ القيم في الداتابيز زي ما هي — دي ألفاظ بس (مفيش migration).
  // التجميل مافيهوش توصيل، و«counter» = بيعة من الكاشير (منتج لزبون داخل).
  counter: "بيع",
  delivery: "توصيل",
  takeaway: "بيع",
};

export function orderTypeLabel(type: string): string {
  return ORDER_TYPE_LABELS[type] ?? type;
}

// خيار مختار على بند في الطلب (snapshot وقت البيع)
export interface SelectedModifier {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price_adjustment: number;
}

// بند في سلة الكاشير (Renderer)
export interface CartItem {
  lineId: string; // مفتاح فريد للبند (نفس المنتج بخيارات مختلفة = بنود منفصلة)
  productId: number;
  productName: string;
  image: string | null;
  basePrice: number;
  selectedModifiers: SelectedModifier[];
  unitPrice: number; // basePrice + مجموع الإضافات (للقطعة أو للكيلو)
  quantity: number; // قطعة: صحيح | وزن: عشري (كيلو)
  totalPrice: number; // unitPrice × quantity
  itemNotes: string;
  saleType: SaleType;
  // ===== الحجم (المطاعم) =====
  // ⚠️ الحجم **بديل سعر مش زيادة**: `basePrice` هنا = سعر الحجم نفسه، والإضافات
  // بتتجمع فوقه. منتج بلا أحجام → `variantId = null` والسلوك زي الأساس بالحرف.
  variantId: number | null;
  variantSize: string | null;
}

// ===== مدخلات إنشاء الطلب (تُرسل للـ Main) =====
export interface CreateOrderItemInput {
  product_id: number;
  quantity: number;
  modifier_option_ids: string[]; // الخيارات المختارة
  notes?: string;
  /** الحجم المختار — **إجباري** لأي منتج `has_sizes` (الـMain بيرفض من غيره) */
  variant_id?: number | null;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  customer_id?: number | null;
  is_guest: boolean;
  order_type: OrderType;
  discount_type: DiscountType;
  discount_value: number;
  payment_method: string;
  amount_paid: number;
  is_free?: boolean; // فاتورة مجانية: تخصم المخزون لكن متتحسبش في الفلوس
  free_recipient_type?: FreeRecipientType | null; // مين خد المجاني
  free_recipient_id?: number | null;
  free_recipient_name?: string | null;
  notes?: string;
  source?: OrderSource; // افتراضي pos؛ "online_store" للطلبات الجاية من المتجر
  /** الحساب (غرفة/طاولة) اللي الفاتورة طلعت منه — تقسيم الفاتورة بيطلّع أكتر من فاتورة للحساب */
  session_id?: number | null;
  // بنود خدمة بلا منتج (وقت جلسة البلايستيشن) — بتتحط قبل بنود المنتجات
  service_lines?: ServiceLineInput[];
  /**
   * إسناد صريح: مين خد إيه من الفاتورة دي (التجميل — عمولة الحلاقين).
   *
   * ⚠️ **الفرق عن نسخة التجزئة:** هناك الإسناد **مشتق** من الحضور (كل بائع حاضر
   * بياخد نصيب من أصناف فئاته). هنا **صريح**: كل خدمة مسجّلة باللي عملها، فنصيبه
   * = مجموع أسعار بنوده بالظبط. أدق، ولأن فلوس الناس بتتحدد بيه — التخمين ممنوع.
   */
  sellers?: { id: number; name: string; amount: number }[];
  online_order_local_id?: string | null; // ربط بطلب المتجر اللي اتضرب (لتحديث حالته)
  // ===== التوصيل (عرض/فاتورة فقط — مايدخلش أي حساب مالي) =====
  delivery_zone_id?: string | null; // id منطقة التوصيل من الإعدادات
  delivery_person_id?: number | null; // الدليفري (مستخدم بدور delivery)
  delivery_address?: string | null; // عنوان التوصيل (يتطبع في الفاتورة للدليفري)
}

// ===== مخرجات =====
export interface OrderTotals {
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
}

export interface OrderItemDTO {
  id: number;
  product_id: number | null;
  product_name: string;
  base_price: number;
  selected_modifiers: SelectedModifier[];
  unit_price: number;
  quantity: number;
  total_price: number;
  notes: string | null;
  sale_type: SaleType;
  /** لقطة الحجم على البند — الفاتورة والتذكرة والتقارير */
  variant_id: number | null;
  variant_size: string | null;
}

export interface OrderDTO {
  id: number;
  local_id: string;
  receipt_number: number;
  receipt_label: string; // "#0052"
  customer_id: number | null;
  customer_name: string | null;
  is_guest: boolean;
  order_type: OrderType;
  source: OrderSource;
  // التوصيل — عرض/فاتورة فقط، مش داخل أي حساب مالي
  delivery_zone: string | null; // اسم المنطقة (لقطة)
  delivery_fee: number; // سعر التوصيل (لقطة) — للعرض بس
  delivery_person_id: number | null;
  delivery_person_name: string | null;
  delivery_address: string | null; // عنوان التوصيل (لقطة) — للفاتورة
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  status: OrderStatus;
  is_free: boolean;
  free_recipient_type: FreeRecipientType | null;
  free_recipient_id: number | null;
  free_recipient_name: string | null;
  notes: string | null;
  cashier_id: number;
  cashier_name: string;
  business_date: string;
  created_at: string;
  items: OrderItemDTO[];
  sellers: OrderSellerDTO[]; // البائعون الحاضرون وقت البيع (لتحليل أداء البائعين)
}

export interface OrderSellerDTO {
  id: number;
  name: string;
  attributed_amount?: number | null; // نصيب البائع من الفاتورة (فئاته فقط)
}

export interface CreateOrderResult {
  order: OrderDTO;
  change: number;
}

export interface CalculateTotalsInput {
  items: CreateOrderItemInput[];
  discount_type: DiscountType;
  discount_value: number;
}

export interface CancelOrderInput {
  id: number;
  reason: string;
}

// ===== حساب الإجماليات (دالة نقية تُستخدم في الواجهة للعرض الفوري) =====
export function computeDiscountAmount(
  subtotal: number,
  type: DiscountType,
  value: number
): number {
  if (type === "percentage") {
    return Math.min(subtotal, (subtotal * value) / 100);
  }
  if (type === "fixed") {
    return Math.min(subtotal, value);
  }
  return 0;
}

export function computeTotals(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number,
  taxRatePercent: number
): OrderTotals {
  const discount_amount = computeDiscountAmount(subtotal, discountType, discountValue);
  const taxable = subtotal - discount_amount;
  const tax_amount = (taxable * taxRatePercent) / 100;
  const total = taxable + tax_amount;
  return {
    subtotal,
    discount_type: discountType,
    discount_value: discountValue,
    discount_amount,
    tax_rate: taxRatePercent,
    tax_amount,
    total,
  };
}

export function formatReceiptNumber(seq: number): string {
  return "#" + String(seq).padStart(4, "0");
}
