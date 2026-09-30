// طبقة مشتركة بين الـ Main والـ Renderer لأنواع التقارير (PRD-08).
// سياسة العرض: آخر 30 يوم تجاري فقط. الأقدم موجود في DB بس مش بيظهر هنا.

export const REPORT_WINDOW_DAYS = 30;

// ===== تقرير المبيعات =====
export interface SalesCategoryRow {
  category: string;
  count: number;
  revenue: number;
}

export interface SalesPaymentRow {
  method: string;
  count: number;
  revenue: number;
}

export interface SalesOrderItemRow {
  product_name: string;
  category_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  sale_type: "piece" | "weight";
  selected_modifiers: { option_name: string }[];
}

export interface SalesOrderRow {
  id: number;
  receipt_number: number;
  receipt_label: string;
  time: string; // ISO
  customer_name: string;
  items_count: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  tax_rate: number;
  total: number;
  amount_paid: number;
  change_amount: number;
  payment_method: string;
  cashier_id: number;
  cashier_name: string;
  status: "paid" | "cancelled";
  is_free: boolean;
  free_recipient_type: "staff" | "customer" | null;
  free_recipient_name: string | null;
  // مصدر الفاتورة: pos = الكاشير (تيك أواي/توصيل) · table_session = حساب صالة (فلتر «القسم»)
  source: string;
  // التوصيل (عرض/تحاسب فقط — مش داخل الفلوس)
  order_type: "counter" | "delivery";
  delivery_fee: number;
  delivery_person_id: number | null;
  delivery_person_name: string | null;
  items: SalesOrderItemRow[];
}

// مصروف مبسّط لحساب الصافي (مع مين سجّله)
export interface SalesExpenseLite {
  drawer_amount: number;
  created_by: number | null;
  created_by_name: string;
  category: string;
  description: string;
}

// كاشير له نشاط في اليوم (بيع أو تسجيل مصروف) — لفلتر الوردية
export interface SalesCashier {
  id: number;
  name: string;
}

export interface SalesDayReport {
  date: string; // YYYY-MM-DD (business date)
  totalOrders: number;
  totalRevenue: number;
  totalDiscount: number;
  totalTax: number;
  byCategory: SalesCategoryRow[];
  byPaymentMethod: SalesPaymentRow[];
  orders: SalesOrderRow[];
  expenses: SalesExpenseLite[];
  cashiers: SalesCashier[];
}

// بيانات طباعة ملخص المبيعات الحراري (بدل طباعة كل الفواتير)
export interface SalesSummaryPrintData {
  date: string; // business date YYYY-MM-DD
  cashierName?: string | null; // الوردية اللي الفلتر عليها (لو فيه فلتر)
  orders: number;
  revenue: number;
  discount: number;
  expenses: number;
  net: number;
  byCategory: { name: string; count: number; revenue: number }[];
  byPayment: { label: string; count: number; revenue: number }[];
}

export interface SalesSummaryRow {
  date: string;
  total_orders: number;
  total_revenue: number;
  top_category: string | null;
}

// ===== تقرير المخزون =====
export type InventoryReportStatus = "sufficient" | "low" | "out_of_stock";

export interface InventoryStatusRow {
  id: number;
  name: string;
  unit: string;
  current_quantity: number;
  alert_threshold: number;
  waste_percentage: number;
  expected_min: number; // current × (1 - waste%/100)
  status: InventoryReportStatus;
  cost_per_unit: number;
  total_value: number;
  supplier_name: string | null;
  last_restock_date: string | null;
  last_restock_qty: number | null;
  total_deducted_30d: number;
  total_wasted_30d: number;
}

export interface InventoryReportSummary {
  totalItems: number;
  lowCount: number;
  outCount: number;
  totalValue: number;
}

export interface InventoryMovementRow {
  id: number;
  created_at: string;
  type: "restock" | "deduction" | "adjustment" | "waste";
  quantity: number;
  quantity_after: number;
  reason: string | null;
}

// ===== لوحة التحكم =====
export interface DashboardAlert {
  kind: "out_of_stock" | "low_stock" | "absent_staff";
  message: string;
}

export interface DashboardRecentOrder {
  id: number;
  receipt_number: number;
  receipt_label: string;
  customer_name: string;
  total: number;
  time: string;
  status: "paid" | "cancelled";
}

export interface DashboardSummary {
  todaySales: number;
  todayOrders: number;
  avgOrderValue: number;
  newCustomers: number;
  lowStockCount: number;
  outOfStockCount: number;
  todayExpenses: number;
  todayNet: number;
  alerts: DashboardAlert[];
  recentOrders: DashboardRecentOrder[];
}

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  restock: "استلام توريد",
  deduction: "خصم بيع",
  adjustment: "تعديل",
  waste: "هالك/تالف",
  stocktake: "تسوية جرد",
};

export const INVENTORY_STATUS_LABELS: Record<InventoryReportStatus, string> = {
  sufficient: "كافٍ",
  low: "منخفض",
  out_of_stock: "نفد",
};
