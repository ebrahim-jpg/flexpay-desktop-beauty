// طبقة مشتركة بين الـ Main والـ Renderer لتعريفات المخزون والموردين.

export type InventoryStatus = "sufficient" | "low" | "out_of_stock";

export type TransactionType =
  | "restock"
  | "deduction"
  | "adjustment"
  | "waste"
  | "stocktake";

// الوحدات المتاحة
export const INVENTORY_UNITS = [
  "كيلو",
  "جرام",
  "لتر",
  "مل",
  "علبة",
  "قطعة",
  "كيس",
] as const;

// ===== الموردين =====
export interface SupplierDTO {
  id: number;
  local_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  item_count: number;
  balance: number; // المستحق للمورد (آجل) — موجب = احنا مدينينله
}

// ===== آجل ودفعات الموردين =====
export type SupplierTxType = "purchase" | "payment";

export interface SupplierTransactionDTO {
  id: number;
  type: SupplierTxType;
  total_amount: number;
  paid_amount: number;
  drawer_amount: number;
  balance_change: number;
  balance_after: number;
  description: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface SupplierLedger {
  supplier: SupplierDTO;
  transactions: SupplierTransactionDTO[];
  total_purchased: number; // إجمالي اللي اتشترى آجل
  total_paid: number; // إجمالي اللي اتدفع
}

export interface RecordSupplierPaymentInput {
  supplier_id: number;
  amount: number; // مبلغ الدفعة (يتخصم من رصيد المورد)
  drawer_amount: number; // منهم كام خرج من درج النهاردة (يتسجّل في المالية)
  drawer_owner_id?: number | null; // درج/وردية مين خرجت الفلوس (لازم لو drawer_amount > 0)
  notes?: string | null;
}

export const SUPPLIER_TX_LABELS: Record<SupplierTxType, string> = {
  purchase: "آجل (توريد)",
  payment: "دفعة",
};

export interface CreateSupplierInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateSupplierInput {
  id: number;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

// ===== مواد المخزون =====
export interface InventoryItemDTO {
  id: number;
  local_id: string;
  name: string;
  unit: string;
  current_quantity: number;
  alert_threshold: number;
  waste_percentage: number;
  cost_per_unit: number;
  supplier_id: number | null;
  supplier_name: string | null;
  category: string | null;
  status: InventoryStatus;
  // النطاق المتوقع (محسوب)
  expected_min: number;
  expected_max: number;
  waste_amount: number;
}

export interface CreateInventoryItemInput {
  name: string;
  unit: string;
  current_quantity: number;
  alert_threshold: number;
  waste_percentage: number;
  cost_per_unit: number;
  supplier_id?: number | null;
  category?: string | null;
}

export interface UpdateInventoryItemInput {
  id: number;
  name?: string;
  unit?: string;
  alert_threshold?: number;
  waste_percentage?: number;
  cost_per_unit?: number;
  supplier_id?: number | null;
  category?: string | null;
}

export type RestockPaymentType = "cash" | "credit";

export interface RestockInput {
  id: number;
  quantity: number;
  cost_per_unit?: number; // سعر الوحدة وقت الاستلام (يحدّث التكلفة)
  drawer_amount?: number; // اللي خرج من الدرج فعلاً اليوم (يُسجَّل كمصروف)
  payment_type?: RestockPaymentType; // كاش (مدفوع كامل) أو آجل
  paid_amount?: number; // المدفوع دلوقتي (للآجل) — الباقي يبقى دين على المورد
  supplier_id?: number | null; // المورد اللي يتحطله الدين (افتراضي مورد المادة)
  drawer_owner_id?: number | null; // درج/وردية مين خرجت الفلوس (لازم لو drawer_amount > 0)
  notes?: string | null;
}

export interface WasteInput {
  id: number;
  quantity: number;
  reason: string;
}

// ===== حركات المخزون =====
export interface TransactionDTO {
  id: number;
  type: TransactionType;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  user_name: string | null;
  created_at: string;
}

export interface TransactionsPage {
  rows: TransactionDTO[];
  total: number;
  page: number;
  page_size: number;
}

// ===== الخصم التلقائي (يُستدعى من الكاشير في PRD-05) =====
export interface DeductForOrderInput {
  orderId: number | null;
  items: DeductLine[];
}

/**
 * بند للخصم. `variant_id` = الحجم المباع (وصفته + المشترك)، و`option_ids` = الإضافات
 * (ممكن تخصم مواد كمان). القديم (`{product_id, quantity}` بس) لسه صالح: الحجم والخيارات
 * اختياريين والسلوك بيرجع للوصفة المشتركة = **سلوك الأساس بالحرف**.
 */
export interface DeductLine {
  product_id: number;
  quantity: number;
  variant_id?: number | null;
  option_ids?: string[];
}

// ===== الدوال النقية =====
export interface ExpectedRange {
  recorded: number;
  min: number;
  max: number;
  waste_pct: number;
  waste_amount: number;
}

// النطاق المتوقع بناءً على نسبة التهدير
export function calculateExpectedRange(item: {
  current_quantity: number;
  waste_percentage: number;
}): ExpectedRange {
  const wasteAmount =
    item.current_quantity * (item.waste_percentage / 100);
  return {
    recorded: item.current_quantity,
    min: item.current_quantity - wasteAmount,
    max: item.current_quantity,
    waste_pct: item.waste_percentage,
    waste_amount: wasteAmount,
  };
}

// حالة المادة حسب الكمية وحد التنبيه
export function computeStatus(
  quantity: number,
  threshold: number
): InventoryStatus {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= threshold) return "low";
  return "sufficient";
}

export const STATUS_LABELS: Record<InventoryStatus, string> = {
  sufficient: "متوفر",
  low: "منخفض",
  out_of_stock: "نفد",
};

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  restock: "إضافة كمية",
  deduction: "خصم بيع",
  adjustment: "تعديل",
  waste: "هالك/تالف",
  stocktake: "تسوية جرد",
};
