// طبقة مشتركة بين الـ Main والـ Renderer لأنواع المزامنة (PRD-08).

export type SyncEngineState =
  | "disabled" // مش مفعّلة (مفيش كود/مفتاح محل بعد — الويب لسه)
  | "offline" // مفعّلة بس مفيش اتصال بالسيرفر
  | "online" // متصلة وجاهزة
  | "syncing"; // بتبعت دفعة دلوقتي

export interface SyncStatusDTO {
  state: SyncEngineState;
  configured: boolean; // فيه كود ومفتاح محل؟
  pending: number; // سجلات في الانتظار
  synced: number; // سجلات اتبعتت بنجاح
  failed: number; // سجلات فشلت نهائياً
  lastSyncAt: string | null; // آخر مزامنة ناجحة
  message: string; // وصف الحالة بالعربي
}

export interface SyncQueueItemDTO {
  id: number;
  entity_type: string;
  event_type: "CREATED" | "UPDATED" | "DELETED";
  status: "pending" | "syncing" | "synced" | "failed";
  attempts: number;
  error_message: string | null;
  created_at: string;
}

export interface SyncLogDTO {
  id: number;
  timestamp: string;
  result: "success" | "error";
  records_count: number;
  message: string | null;
}

// نص عربي لكل نوع كيان في الطابور
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  order: "طلب",
  order_item: "بند طلب",
  customer: "عميل",
  product: "منتج",
  product_recipe: "وصفة",
  category: "فئة",
  inventory_item: "مادة مخزون",
  inventory_transaction: "حركة مخزون",
  supplier: "مورّد",
  expense: "مصروف",
  attendance: "حضور",
  user: "مستخدم",
  settings: "إعدادات",
  audit_log: "سجل عملية",
};

export function entityTypeLabel(type: string): string {
  return ENTITY_TYPE_LABELS[type] ?? type;
}

export const SYNC_EVENT_LABELS: Record<string, string> = {
  CREATED: "إضافة",
  UPDATED: "تعديل",
  DELETED: "حذف",
};
