// Types الجداول — مطابقة لـ Migration 001
import type { Role } from "../shared/permissions";

export type SyncStatus = "pending" | "synced" | "failed";

// الحقول المشتركة في كل جدول (الدستور)
export interface BaseEntity {
  id: number;
  local_id: string;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
  is_deleted: number; // 0 | 1
  deleted_by: number | null;
  deleted_at: string | null;
}

export interface User extends BaseEntity {
  name: string;
  username: string;
  password_hash: string | null;
  pin_hash: string | null;
  role: Role;
  permissions: string; // JSON (Permissions)
  is_active: number; // 0 | 1
  last_login_at: string | null;
  attendance_code_hash: string | null; // كود الحضور (بديل البصمة) — مشفّر
  auto_clockout_hours: number | null; // تخصيص لكل موظف (NULL = القيمة العامة)
  warn_hours: number | null;
  seller_categories: string | null; // فئات البائع JSON (NULL = بائع عام لكل الفئات)
}

export interface AuditLogRow {
  id: number;
  local_id: string;
  user_id: number;
  user_name: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  old_value: string | null; // JSON
  new_value: string | null; // JSON
  timestamp: string;
  sync_status: SyncStatus;
  synced_at: string | null;
}

export interface SettingsRow {
  id: number;
  local_id: string | null;
  shop_name: string;
  shop_logo_path: string | null;
  country: string;
  currency: string;
  currency_symbol: string;
  tax_rate: number;
  business_day_start: number;
  nationalities: string; // JSON
  payment_methods: string | null; // JSON
  delivery_zones: string | null; // JSON [{id,name,price}]
  low_stock_threshold: number;
  absence_alert_days: number;
  receipt_header: string | null;
  receipt_footer: string | null;
  printer_name: string | null;
  kitchen_printer_name: string | null;
  shop_code: string | null;
  secret_key: string | null;
  sync_server_url: string;
  // 1 = المزامنة شغّالة (الافتراضي للكل). صفر = المالك أوقفها من الإعدادات.
  sync_enabled: number;
  auto_hide_out_of_stock: number;
  auto_clockout_hours: number; // انصراف تلقائي بعد كذا ساعة (0 = متعطّل) — عام للكل
  attendance_warn_hours: number; // تحذير «لسه موجود؟» بعد كذا ساعة (0 = متعطّل)
  vertical: string | null; // ختم المجال (migration 028) = 'gaming'
  gaming_rounding_minutes: number; // وحدة تقريب وقت الجلسة (1 = بالدقيقة) — migration 029
  gaming_min_minutes: number; // الحد الأدنى المحتسب للجلسة (0 = بلا حد)
  booking_alert_minutes: number; // التنبيه قبل ميعاد الحجز (دقيقة) — migration 031، بيتكتب من الويب
  updated_at: string | null;
  updated_by: number | null;
  sync_status: SyncStatus;
  synced_at: string | null;
}

export interface SupplierRow extends BaseEntity {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: number;
  balance: number; // الرصيد المستحق للمورد (آجل)
}

export interface SupplierTransactionRow {
  id: number;
  local_id: string;
  supplier_id: number;
  supplier_name: string;
  type: string; // 'purchase' | 'payment'
  total_amount: number;
  paid_amount: number;
  drawer_amount: number;
  balance_change: number;
  balance_after: number;
  description: string | null;
  business_date: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
  is_deleted: number;
  deleted_by: number | null;
  deleted_at: string | null;
}

export interface InventoryItemRow extends BaseEntity {
  name: string;
  unit: string;
  current_quantity: number;
  alert_threshold: number;
  waste_percentage: number;
  cost_per_unit: number;
  supplier_id: number | null;
  category: string | null;
  status: string;
}

export interface InventoryTransactionRow {
  id: number;
  local_id: string;
  item_id: number | null;
  item_name: string;
  unit: string;
  type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  order_id: number | null;
  created_by: number | null;
  created_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
}

export interface CategoryRow extends BaseEntity {
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: number;
}

export interface ProductRow extends BaseEntity {
  name: string;
  description: string | null;
  category_id: number | null;
  price: number;
  barcode: string | null;
  image_path: string | null;
  is_active: number;
  is_available: number;
  modifiers: string; // JSON
  cost_price: number;
  sale_type: string;
  /** 1 = المنتج ده بيتباع بأحجام (نية صريحة مش عدّ مشتق) — الحجم إجباري في البيع */
  has_sizes: number;
  /** 1 = خدمة (مالهاش رصيد بضاعة، بس وصفتها بتخصم مواد عادي) */
  is_service: number;
  /** مدة الخدمة بالدقايق (0 = مش محددة) */
  duration_minutes: number;
}

export interface ProductRecipeRow {
  id: number;
  local_id: string;
  product_id: number;
  inventory_item_id: number | null;
  inventory_item_name: string;
  unit: string;
  standard_qty: number;
  /** الحجم اللي الصف ده بتاعه — `null` = **مشترك لكل الأحجام** */
  variant_id: number | null;
  created_by: number | null;
  created_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
  is_deleted: number;
  deleted_by: number | null;
  deleted_at: string | null;
}

export interface CustomerRow extends BaseEntity {
  name: string;
  phone: string | null;
  gender: string | null;
  nationality: string | null;
  notes: string | null;
  total_visits: number;
  total_spent: number;
  avg_session_duration: number; // legacy (migration 005)
  avg_spent: number;
  last_visit_at: string | null;
  first_visit_at: string | null;
  classification: string | null;
  favorite_items: string; // legacy (migration 005)
  favorite_product_id: number | null;
  favorite_product_name: string | null;
}

export interface OrderRow {
  id: number;
  local_id: string;
  receipt_number: number;
  customer_id: number | null;
  customer_name: string | null;
  is_guest: number;
  order_type: string;
  source: string | null;
  session_id?: number | null; // migration 032 — الحساب اللي الفاتورة طلعت منه
  delivery_zone: string | null;
  delivery_fee: number | null;
  delivery_person_id: number | null;
  delivery_person_name: string | null;
  delivery_address: string | null;
  subtotal: number;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  status: string;
  notes: string | null;
  cashier_id: number;
  cashier_name: string;
  cancelled_by: number | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  business_date: string;
  is_free: number;
  free_recipient_type: string | null;
  free_recipient_id: number | null;
  free_recipient_name: string | null;
  created_by: number | null;
  created_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
  is_deleted: number;
  deleted_by: number | null;
  deleted_at: string | null;
}

export interface OrderItemRow {
  id: number;
  local_id: string;
  order_id: number;
  product_id: number | null;
  product_name: string;
  base_price: number;
  selected_modifiers: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  notes: string | null;
  sale_type: string;
  /** لقطة الحجم على البند (المطاعم) — `null` لأي بند بلا حجم وللفواتير القديمة */
  variant_id: number | null;
  variant_size: string | null;
  /** تكلفة الوحدة لحظة البيع: وصفة الحجم + المشترك + مواد الإضافات → COGS */
  variant_cost_price: number | null;
  created_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
}

export interface AttendanceLogRow {
  id: number;
  local_id: string;
  user_id: number;
  user_name: string;
  type: string;
  timestamp: string;
  business_date: string;
  note: string | null;
  created_by: number | null;
  updated_by: number | null;
  updated_at: string | null;
  sync_status: SyncStatus;
  synced_at: string | null;
  is_deleted: number;
  deleted_by: number | null;
  deleted_at: string | null;
}

export interface ExpenseRow {
  id: number;
  local_id: string;
  category: string;
  description: string;
  amount: number;
  drawer_amount: number;
  staff_id: number | null;
  staff_name: string | null;
  inventory_item_id: number | null;
  inventory_item_name: string | null;
  is_recurring: number;
  recurrence_type: string | null;
  expense_date: string;
  created_by: number;
  created_by_name: string;
  recorded_by_id: number | null;
  recorded_by_name: string | null;
  owner_paid_amount: number | null;
  created_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
  is_deleted: number;
  deleted_by: number | null;
  deleted_at: string | null;
}

export interface PurchaseInvoiceRow {
  id: number;
  local_id: string;
  reference: string | null;
  invoice_date: string;
  supplier_id: number | null;
  supplier_name: string | null;
  payment_type: string;
  total_cost: number;
  paid_amount: number;
  drawer_amount: number;
  drawer_owner_id: number | null;
  drawer_owner_name: string | null;
  notes: string | null;
  created_by: number;
  created_by_name: string;
  created_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
  is_deleted: number;
}

export interface PurchaseInvoiceItemRow {
  id: number;
  local_id: string;
  invoice_id: number;
  invoice_local_id: string;
  inventory_item_id: number;
  item_name: string;
  unit: string | null;
  quantity: number;
  unit_cost: number;
  line_cost: number;
  sync_status: SyncStatus;
}

export interface StocktakeRow {
  id: number;
  local_id: string;
  reference: string | null;
  scope: string | null;
  counted_at: string;
  item_count: number;
  shortage_value: number;
  surplus_value: number;
  variance_value: number;
  notes: string | null;
  created_by: number;
  created_by_name: string;
  created_at: string;
  sync_status: SyncStatus;
  synced_at: string | null;
  is_deleted: number;
}

export interface StocktakeItemRow {
  id: number;
  local_id: string;
  stocktake_id: number;
  stocktake_local_id: string;
  inventory_item_id: number;
  item_name: string;
  unit: string | null;
  category: string | null;
  expected_qty: number;
  expected_min: number;
  waste_percentage: number;
  counted_qty: number;
  variance_qty: number;
  cost_per_unit: number;
  variance_value: number;
  sync_status: SyncStatus;
}

export type SyncQueueStatus = "pending" | "syncing" | "synced" | "failed";
export type SyncEventType = "CREATED" | "UPDATED" | "DELETED";

export interface SyncQueueRow {
  id: number;
  local_id: string;
  entity_type: string;
  event_type: SyncEventType;
  payload: string; // JSON
  status: SyncQueueStatus;
  attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SyncLogRow {
  id: number;
  timestamp: string;
  result: "success" | "error";
  records_count: number;
  message: string | null;
}
