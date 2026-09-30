// فواتير التوريد — مشترك بين الـ Main والـ Renderer

export type PurchasePaymentType = "cash" | "credit";

export interface PurchaseInvoiceItemInput {
  inventory_item_id: number;
  quantity: number;
  unit_cost: number;
}

export interface CreatePurchaseInvoiceInput {
  reference?: string | null; // رقم/اسم الفاتورة (اختياري)
  invoice_date?: string | null; // YYYY-MM-DD (افتراضي: النهاردة)
  supplier_id?: number | null;
  payment_type: PurchasePaymentType;
  paid_amount?: number; // المدفوع دلوقتي (للآجل)
  drawer_amount?: number; // اللي خرج من الدرج
  drawer_owner_id?: number | null; // درج/وردية مين (لازم لو drawer_amount > 0)
  notes?: string | null;
  items: PurchaseInvoiceItemInput[];
}

export interface PurchaseInvoiceItemDTO {
  id: number;
  inventory_item_id: number;
  item_name: string;
  unit: string | null;
  quantity: number;
  unit_cost: number;
  line_cost: number;
}

export interface PurchaseInvoiceDTO {
  id: number;
  local_id: string;
  reference: string | null;
  invoice_date: string;
  supplier_id: number | null;
  supplier_name: string | null;
  payment_type: PurchasePaymentType;
  total_cost: number;
  paid_amount: number;
  drawer_amount: number;
  drawer_owner_id: number | null;
  drawer_owner_name: string | null;
  notes: string | null;
  created_by_name: string;
  created_at: string;
  items: PurchaseInvoiceItemDTO[];
}

// صف في قائمة الفواتير (بدون البنود)
export interface PurchaseInvoiceListItem {
  id: number;
  reference: string | null;
  invoice_date: string;
  supplier_name: string | null;
  payment_type: PurchasePaymentType;
  total_cost: number;
  paid_amount: number;
  item_count: number;
  created_at: string;
}
