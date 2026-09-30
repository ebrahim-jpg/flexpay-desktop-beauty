// طبقة مشتركة بين الـ Main والـ Renderer — الطاولات (نسخة «كافيه» بس).
//
// الطاولة = صف في `gaming_rooms` بـ`kind = "table"` (الجداول متوارثة من نسخة البلايستيشن ومابتتغيّرش
// عشان عقد المزامنة مع الويب يفضل هو هو). الحساب مفتوح بالطلبات بس — **مفيش تسعير وقت ولا أوضاع
// ولا مدة** — وبيتقفل بفاتورة `source = 'table_session'`.
// ⚠️ النسخة دي مالهاش غرف خالص: الحارس scripts/verify-cafe-no-rooms.js.

/** نوع المكان في الداتابيز — النسخة دي بتكتب `table` بس */
export type RoomKind = "table";
/** مصدر فاتورة حساب الطاولة = قسمها في التقارير */
export const TABLE_SESSION_SOURCE = "table_session" as const;
export const MAX_AREA_LENGTH = 40;
/** اسم مفيش منطقة ليه في تابات صفحة الطاولات */
export const NO_AREA_LABEL = "بدون منطقة";

// merged = حساب طاولة اتدمج في حساب تاني (طلباته اتنقلت هناك) — مش إلغاء
export type GamingSessionStatus = "open" | "closed" | "cancelled" | "merged";
export const GAMING_STATUS_LABELS: Record<GamingSessionStatus, string> = {
  open: "مفتوح",
  closed: "اتحاسب",
  cancelled: "ملغي",
  merged: "اتدمج",
};

/** «ساعة» · «ساعتين» · «ساعة ونص» · «45 دقيقة» — مدة حجز الطاولة وشرايط التنبيه */
export function plannedLabel(minutes: number | null): string {
  if (minutes == null) return "مفتوح";
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "ساعة" : h === 2 ? "ساعتين" : `${h} ساعات`;
  }
  if (minutes % 30 === 0) {
    const h = Math.floor(minutes / 60);
    return h === 0 ? "نص ساعة" : h === 1 ? "ساعة ونص" : h === 2 ? "ساعتين ونص" : `${h} ساعات ونص`;
  }
  return `${minutes} دقيقة`;
}

export interface GamingRoomDTO {
  id: number;
  local_id: string;
  kind: RoomKind;
  /** منطقة الطاولة (داخلي/خارجي/الدور التاني) */
  area: string | null;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export interface SaveRoomInput {
  id?: number;
  area?: string | null;
  name: string;
  is_active?: boolean;
  sort_order?: number;
}

export interface SessionItemDTO {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  modifier_option_ids: string[];
  notes: string | null;
  /** الحجم المطلوب — لازم للمنتج اللي له أحجام (الفاتورة بتتسعّر منه وقت الحساب) */
  variant_id: number | null;
  variant_size: string | null;
  /**
   * الكمية اللي **راحت للمطبخ** من البند ده. المعلّق = `quantity - sent_qty`.
   * الواجهة بتعلّم البند: راح كله ✓ · راح جزء «×٢ (راح ١)» · لسه معلّق.
   */
  sent_qty: number;
  /** اللي عمل الخدمة دي — عليه بتتحسب عمولته */
  staff_id: number | null;
  staff_name: string | null;
}

/** بند معلّق للمطبخ — بالفرق مش بالكمية الكاملة (قالب التذكرة بياخده زي ما هو) */
export interface KitchenPendingItem {
  item_id: number;
  name: string;
  size: string | null;
  quantity: number;
  options: string[];
  notes: string | null;
}

/** نتيجة «أرسل للمطبخ» */
export interface SendToKitchenResult {
  /** عدد الأصناف اللي اتطبعت في الدفعة دي */
  printed: number;
  /** رقم الدفعة — التذكرة بتقول «دفعة ٢» */
  batch: number;
  session: GamingSessionDTO;
}

// ===== مدخلات ومخرجات الـIPC =====
export interface OpenSessionInput {
  room_id: number;
  customer_id?: number | null;
  notes?: string | null;
  /**
   * الحلاق/الأخصائي اللي هيشتغل على العميل — **إجباري**.
   * ⚠️ ده مش «مين فتح الجلسة» (`opened_by`): الكاشير بيفتح والحلاق بيشتغل.
   * وعليه بتتحدد **عمولته**، فالسيبانه فاضي معناه فلوس بتروح لحد غلط.
   */
  staff_id: number;
}

export interface AddSessionItemInput {
  session_id: number;
  product_id: number;
  quantity: number;
  modifier_option_ids?: string[];
  notes?: string | null;
  variant_id?: number | null;
  /**
   * اللي عمل الخدمة دي. **فاضي = بيورث الحلاق الأساسي بتاع الجلسة.**
   * بيتحدد صراحةً لما حلاق تاني يعمل خدمة في نفس القعدة (سماح الصبغة ومنى الاستشوار).
   */
  staff_id?: number | null;
}

export interface CheckoutSessionInput {
  session_id: number;
  payment_method: string;
  amount_paid: number;
  discount_type: "none" | "percentage" | "fixed";
  discount_value: number;
  is_free?: boolean;
  free_recipient_type?: "staff" | "customer" | null;
  free_recipient_id?: number | null;
  free_recipient_name?: string | null;
  customer_id?: number | null;
  notes?: string | null;
}

/** بند من الحساب في تقسيم الفاتورة — كمية جزئية مسموحة */
export interface SplitLineInput {
  item_id: number;
  quantity: number;
}

/** دفع جزء من حساب الطاولة: فاتورة للبنود دي، والحساب يفضل مفتوح بالباقي */
export interface SplitCheckoutInput extends CheckoutSessionInput {
  lines: SplitLineInput[];
}

/** عرض حساب الطاولة من السيرفر بنفس تسعير الفاتورة */
export interface SessionQuote {
  at: string;
  /** القعدة الفعلية لحد دلوقتي — للعرض بس */
  actual_minutes: number;
  items_subtotal: number;
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
}

export interface GamingBoard {
  tables: GamingRoomDTO[];
  sessions: GamingSessionDTO[]; // المفتوحة بس
}

export interface GamingTodaySummary {
  business_date: string;
  open_count: number;
  closed_count: number;
  cancelled_count: number;
}

export interface GamingSessionDTO {
  id: number;
  local_id: string;
  kind: RoomKind;
  session_number: number;
  session_label: string;
  /** عدد دفعات المطبخ اللي راحت للحساب ده — التذكرة الجاية بتبقى «دفعة N+1» */
  kitchen_batches: number;
  /** الحلاق الأساسي للجلسة — الخدمات بتورثه */
  staff_id: number | null;
  staff_name: string | null;
  /** الحساب اللي الطاولة دي اتدمجت فيه (status = merged) */
  merged_into_id: number | null;
  room_id: number;
  room_name: string;
  status: GamingSessionStatus;
  started_at: string;
  ended_at: string | null;
  customer_id: number | null;
  customer_name: string | null;
  opened_by: number | null;
  opened_by_name: string | null;
  closed_by: number | null;
  closed_by_name: string | null;
  order_id: number | null;
  /** القعدة الفعلية بالدقيقة (تتسجّل وقت القفل) */
  actual_minutes: number;
  cancel_reason: string | null;
  notes: string | null;
  business_date: string;
  items: SessionItemDTO[];
  /** مجموع الطلبات بأسعار دلوقتي (للعرض) — الفاتورة بتتسعّر من جديد وقت الحساب */
  items_subtotal: number;
}

export function formatSessionNumber(n: number): string {
  return `حساب #${String(n).padStart(4, "0")}`;
}

/** دقايق القعدة الفعلية لحساب طاولة — للعرض والتحليل بس، مش تسعير */
export function tableElapsedMinutes(startedAt: string, at: string | Date): number {
  const start = Date.parse(startedAt);
  const end = typeof at === "string" ? Date.parse(at) : at.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start) / 60_000;
}

/** «1:05» — ساعات:دقايق من عدد دقايق */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
