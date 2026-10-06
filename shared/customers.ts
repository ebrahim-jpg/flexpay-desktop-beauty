// طبقة مشتركة — العملاء (PRD-06).

export type Gender = "male" | "female";
export type Classification = "new" | "champion" | "loyal" | "at_risk" | "lost";

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  champion: "مميز",
  loyal: "منتظم",
  at_risk: "في خطر",
  lost: "مفقود",
  new: "جديد",
};

export const CLASSIFICATION_EMOJI: Record<Classification, string> = {
  champion: "👑",
  loyal: "❤️",
  at_risk: "⚠️",
  lost: "💔",
  new: "🆕",
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: "رجل",
  female: "امرأة",
};

// ===== DTOs =====
export interface CustomerDTO {
  id: number;
  local_id: string;
  name: string;
  phone: string | null;
  gender: Gender | null;
  nationality: string | null;
  notes: string | null;
  classification: Classification;
  total_visits: number;
  total_spent: number;
  avg_spent: number;
  first_visit_at: string | null;
  last_visit_at: string | null;
  favorite_product_id: number | null;
  favorite_product_name: string | null;
  days_since_last: number | null; // أيام الغياب (محسوب)
}

export interface CreateCustomerInput {
  name: string;
  phone: string;
  gender?: Gender;
  nationality?: string;
  notes?: string | null;
}

export interface UpdateCustomerInput {
  id: number;
  name?: string;
  phone?: string;
  gender?: Gender;
  nationality?: string;
  notes?: string | null;
}

export type CustomerSortKey =
  | "last_visit"
  | "total_spent"
  | "total_visits"
  | "name";

export interface CustomerListQuery {
  search?: string;
  classification?: Classification | "all";
  sort?: CustomerSortKey;
}

// طلب مختصر في سجل مشتريات العميل
export interface CustomerOrderRow {
  id: number;
  receipt_label: string;
  created_at: string;
  total: number;
  payment_method: string;
  status: string;
  items_summary: string; // "قص × 1، صبغة × 1"
}

export interface CustomerOrdersPage {
  rows: CustomerOrderRow[];
  total: number;
  page: number;
  page_size: number;
  period_visits: number;
  period_spent: number;
}

export interface CustomerOrdersQuery {
  customerId: number;
  page?: number;
  pageSize?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
}

// صنف مجاني خده العميل (للبروفايل — نعرف مين خد إيه مجاني قبل كده)
export interface CustomerFreeItem {
  product_name: string;
  quantity: number;
  sale_type: "piece" | "weight";
  value: number; // قيمته لو كان مدفوع (للمراجعة)
}

export interface CustomerFreeOrder {
  id: number;
  receipt_label: string;
  created_at: string;
  cashier_name: string;
  total: number; // القيمة الإجمالية اللي خدها مجاني
  items: CustomerFreeItem[];
}

// ===== الدوال النقية =====

// عدد أيام الغياب من آخر زيارة لليوم
export function daysSince(lastVisitISO: string | null): number | null {
  if (!lastVisitISO) return null;
  const last = new Date(lastVisitISO).getTime();
  if (Number.isNaN(last)) return null;
  const diff = Date.now() - last;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// التصنيف التلقائي حسب النشاط (PRD-06)
export function classify(
  totalVisits: number,
  daysSinceLast: number | null,
  absenceAlertDays: number
): Classification {
  const d = daysSinceLast ?? Infinity;

  if (totalVisits >= 10 && d <= 7) return "champion";
  if (totalVisits >= 4 && d <= 14) return "loyal";
  if (daysSinceLast !== null && d > absenceAlertDays && d <= absenceAlertDays * 2)
    return "at_risk";
  if (daysSinceLast !== null && d > absenceAlertDays * 2) return "lost";
  return "new";
}
