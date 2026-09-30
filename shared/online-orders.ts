// طبقة مشتركة لطلبات المتجر الإلكتروني (Main ↔ Renderer).

export type OnlineOrderStatus = "new" | "done" | "cancelled";

export const ONLINE_ORDER_STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  new: "جديد",
  done: "اتجهّز",
  cancelled: "ملغي",
};

export interface OnlineOrderItem {
  product_desktop_id: number;
  name: string;
  price: number; // الوزني = للكيلو
  quantity: number; // الوزني = عشري (كجم)
  sale_type?: "piece" | "weight";
  notes: string | null;
  // المطاعم: الحجم اللي الزبون اختاره في المنيو — لو موجود، **الكاشير مايختارش تاني**.
  // (الويب بيعيد التحقق من السعر من المرآة، فالسعر هنا للعرض بس.)
  variant_desktop_id?: number | null; // FK → product_variants.id
  variant_size?: string | null;
}

// عرض الكمية: وزن "0.5 كجم" | قطعة "× 2"
export function formatOnlineQty(quantity: number, saleType?: string): string {
  if (saleType === "weight") {
    const n = Number(quantity.toFixed(3));
    return `${n.toLocaleString("ar-EG")} كجم`;
  }
  return `× ${quantity.toLocaleString("ar-EG")}`;
}

export interface OnlineOrderDTO {
  id: number;
  local_id: string;
  business_date: string | null;
  status: OnlineOrderStatus;
  customer_name: string | null;
  customer_phone: string;
  address: string | null;
  notes: string | null;
  items: OnlineOrderItem[];
  items_count: number;
  subtotal: number;
  web_created_at: string | null;
  pulled_at: string;
  desktop_order_id: number | null;
  /** سبب رفض الكاشير — null لو الإلغاء جه من إلغاء الفاتورة */
  cancel_reason?: string | null;
  /**
   * إمتى اتطبعت تذكرة التجهيز للطلب ده — `null` = لسه.
   * ⚠️ الكاشير بيقراها عشان **مايطبعش ورقة تانية لنفس الأكل** عند الحساب.
   */
  ticket_printed_at?: string | null;
}

// يوم في الأرشيف (تاريخ محاسبي + عدد الطلبات)
export interface OnlineOrderArchiveDay {
  date: string;
  count: number;
}

// شكل الطلب الجاي من الويب في السحب
export interface PulledOnlineOrder {
  local_id: string;
  customer: {
    name: string | null;
    phone: string;
    address: string | null;
    notes: string | null;
  };
  items: OnlineOrderItem[];
  subtotal: number;
  created_at: string | null;
}
