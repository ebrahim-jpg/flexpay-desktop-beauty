// طبقة مشتركة — الإدارة (الحضور والمصاريف) PRD-07.
import type { Role } from "./permissions";

// ===== الحضور والانصراف =====
export type AttendanceType = "clock_in" | "clock_out";

export interface StaffStatusDTO {
  user_id: number;
  name: string;
  role: Role;
  present: boolean;
  since: string | null; // وقت آخر تسجيل حضور لو حاضر
  hasCode: boolean; // عنده كود حضور؟ (يُطلب وقت التسجيل)
}

export interface AttendanceRowDTO {
  user_id: number;
  user_name: string;
  business_date: string; // YYYY-MM-DD
  clock_in: string | null;
  clock_out: string | null;
  clock_in_id: number | null;
  clock_out_id: number | null;
  duration_minutes: number | null; // null = لا يزال حاضراً
}

export interface UpdateAttendanceLogInput {
  id: number;
  timestamp: string; // ISO الجديد
}

export interface AttendanceLogDTO {
  id: number;
  user_id: number;
  user_name: string;
  type: AttendanceType;
  timestamp: string;
  business_date: string;
  note: string | null;
}

export interface ClockInput {
  userId: number;
  note?: string | null;
  code?: string | null; // كود الموظف — مطلوب لو الموظف ليه كود
}

// نتيجة التسجيل الذاتي بالكود — بنعرف الموظف من كوده ونعمل toggle
export interface ClockByCodeResult {
  userId: number;
  name: string;
  action: "in" | "out"; // اتسجّل حضور ولا انصراف
  time: string;
}

// جلسة موظف حاضر دلوقتي + حدوده الفعّالة (للمؤقت والتحذير)
export interface PresentSessionDTO {
  user_id: number;
  name: string;
  since: string; // وقت الحضور
  maxHours: number; // حد الانصراف التلقائي الفعّال (0 = متعطّل)
  warnHours: number; // حد التحذير الفعّال (0 = متعطّل)
}

export interface AttendanceQuery {
  userId?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

// ===== المصاريف =====
export type ExpenseCategory =
  | "staff"
  | "inventory"
  | "utilities"
  | "resources"
  | "maintenance"
  | "cleaning"
  | "other";

export type RecurrenceType = "monthly" | "weekly";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  staff: "موظف",
  inventory: "بضاعة",
  utilities: "كهرباء/مياه",
  resources: "موارد",
  maintenance: "صيانة",
  cleaning: "نظافة",
  other: "أخرى",
};

export const EXPENSE_CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  staff: "👤",
  inventory: "📦",
  utilities: "⚡",
  resources: "🚚",
  maintenance: "🔧",
  cleaning: "🧹",
  other: "📝",
};

// الفئات اللي يضيفها المستخدم يدوياً (بضاعة تلقائية من المخزون فقط)
export const MANUAL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "staff",
  "utilities",
  "resources",
  "maintenance",
  "cleaning",
  "other",
];

export interface ExpenseDTO {
  id: number;
  local_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  drawer_amount: number;
  staff_id: number | null;
  staff_name: string | null;
  inventory_item_id: number | null;
  inventory_item_name: string | null;
  is_recurring: boolean;
  recurrence_type: RecurrenceType | null;
  expense_date: string;
  created_by: number | null;
  created_by_name: string;
  created_at: string;
  is_auto: boolean; // بضاعة تلقائية — لا تُحذف
}

export interface CreateExpenseInput {
  category: Exclude<ExpenseCategory, "inventory">;
  description: string;
  amount: number;
  staff_id?: number | null;
  is_recurring?: boolean;
  recurrence_type?: RecurrenceType | null;
  drawer_owner_id?: number | null; // خرج من درج مين (وإلا اليوزر المسجّل) — للتقفيل والحماية
}

// صافي كاش وردية كاشير النهارده (نفس معادلة التقرير: مبيعات مدفوعة غير مجانية − مصاريف الدرج)
// يُستخدم لحماية «الدرج مايطلعش أكتر مما فيه».
export interface CashierNetDTO {
  cashier_id: number;
  cashier_name: string;
  revenue: number;
  expenses: number;
  net: number;
}

export interface ExpensesQuery {
  category?: ExpenseCategory | "all";
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface ExpenseCategorySummary {
  category: ExpenseCategory;
  total: number; // مجموع drawer_amount
}

export interface ExpensesSummary {
  date: string;
  by_category: ExpenseCategorySummary[];
  total_drawer: number;
}
