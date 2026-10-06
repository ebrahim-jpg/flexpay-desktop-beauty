// طبقة مشتركة بين الـ Main والـ Renderer لاستيراد/تصدير البيانات (إكسل).
//
// ⚠️ **ده مش النسخ الاحتياطي.** النسخة الاحتياطية بتمسح الداتابيز كلها وتحط
// مكانها؛ الاستيراد ده **بيضيف ويحدّث بس** ومابيحذفش ولا بيوقّف حاجة.

import type { SaleType } from "./products";

// ===== أسماء الأعمدة =====
//
// ⚠️ نقبل العربي والإنجليزي، وترتيب الأعمدة مالوش أي أهمية — بنقرا الصف الأول
// ونطابق. ملف بيتصدّر مننا لازم يرجع يتستورد من غير ما المستخدم يعدّل حاجة.

// ⚠️ **خدمات بس**: مفيش باركود (خدمة مالهاش باركود) ومفيش «النوع» (مفيش بيع
// بالوزن — الكيلو للخامات في المخزون مش للبيع). الأسماء القديمة فاضلة في
// `COLUMN_ALIASES` عشان ملف قديم يتستورد من غير ما يقع — بتتجاهل بس.
export type ProductColumn = "name" | "price" | "category" | "cost";
export type CustomerColumn = "name" | "phone";

export const PRODUCT_HEADERS: Record<ProductColumn, string[]> = {
  name: ["الاسم", "اسم الخدمة", "الخدمة", "اسم المنتج", "المنتج", "name", "service", "product"],
  price: ["السعر", "سعر البيع", "price", "sale price"],
  category: ["الفئة", "القسم", "category", "group"],
  cost: ["التكلفة", "سعر الشراء", "سعر التكلفة", "cost", "cost price", "purchase price"],
};

export const CUSTOMER_HEADERS: Record<CustomerColumn, string[]> = {
  name: ["الاسم", "اسم العميل", "العميل", "name", "customer", "customer name"],
  phone: ["الموبايل", "التليفون", "الهاتف", "رقم الموبايل", "phone", "mobile", "phone number"],
};

/** الأعمدة اللي بيتصدّر بيها الملف — نفس ترتيب القالب */
export const PRODUCT_EXPORT_ORDER: ProductColumn[] = ["name", "price", "cost", "category"];
export const PRODUCT_EXPORT_LABEL: Record<ProductColumn, string> = {
  name: "اسم الخدمة",
  price: "السعر",
  cost: "التكلفة",
  category: "الفئة",
};
export const CUSTOMER_EXPORT_LABEL: Record<CustomerColumn, string> = {
  name: "الاسم",
  phone: "الموبايل",
};

// ===== التطبيع =====

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/**
 * تحويل الأرقام العربية/الفارسية لإنجليزية.
 *
 * ⚠️ **ده مش تجميل.** التحقق في المشروع بيستخدم `/^\d{11}$/`، و`\d` في
 * جافاسكربت **مابيطابقش `٠١٢٣٤٥٦٧٨٩`**. ملف إكسل متكتب على كيبورد عربي = كل
 * الصفوف مرفوضة برسالة «رقم الموبايل لازم يكون 11 رقم» والمستخدم شايف رقم
 * صح قدامه.
 */
export function toEnglishDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    const p = PERSIAN_DIGITS.indexOf(ch);
    out += p >= 0 ? String(p) : ch;
  }
  return out;
}

/** نص من خانة إكسل — بيشيل المسافات الزيادة ويوحّدها */
export function cellText(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" && "text" in (v as object)
    ? String((v as { text: unknown }).text ?? "")
    : String(v);
  return s.replace(/\s+/g, " ").trim();
}

/**
 * تطبيع الموبايل المصري.
 *
 * بيقبل اللي المستخدم بيكتبه فعلاً: أرقام عربية · مسافات وشرط · `+20` · `0020`.
 * ⚠️ التطبيع هنا **في الاستيراد بس** — تعديل التحقق نفسه لمس لمسار البيع
 * والكاشير، وده بره النطاق.
 */
export function normalizePhone(raw: string): string {
  let s = toEnglishDigits(cellText(raw)).replace(/[\s\-()]/g, "");
  if (s.startsWith("+20")) s = "0" + s.slice(3);
  else if (s.startsWith("0020")) s = "0" + s.slice(4);
  else if (s.startsWith("20") && s.length === 12) s = "0" + s.slice(2);
  return s;
}

export function isValidPhone(phone: string): boolean {
  return /^\d{11}$/.test(phone);
}

/** رقم من خانة إكسل — `null` لو فاضية، `NaN` لو مش رقم (عشان نفرّق) */
export function cellNumber(v: unknown): number | null {
  const s = toEnglishDigits(cellText(v)).replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const WEIGHT_WORDS = ["كيلو", "وزن", "بالوزن", "بالكيلو", "kg", "weight", "kilo"];

/** نوع البيع من نص حر — الافتراضي بالقطعة */
export function parseSaleType(raw: string): SaleType {
  const s = cellText(raw).toLowerCase();
  if (!s) return "piece";
  return WEIGHT_WORDS.some((w) => s.includes(w)) ? "weight" : "piece";
}

export function saleTypeLabel(t: SaleType): string {
  return t === "weight" ? "كيلو" : "قطعة";
}

/** مفتاح مقارنة الأسماء — بيوحّد المسافات وحالة الحروف (للفئات والمنتجات) */
export function nameKey(s: string): string {
  return cellText(s).toLowerCase();
}

// ===== أنواع بتعدّي على الـIPC =====
//
// ⚠️ مكانها هنا مش في `electron/` — الواجهة بتستلمها من `plan` وبترجّعها
// لـ`apply` زي ما هي، فلازم تبقى متعرّفة في الطبقة المشتركة.

/** صف منتج بعد ما اتقرا من الإكسل واتطبّع */
export interface ProductImportRow {
  /** رقم الصف زي ما المستخدم شايفه في إكسل */
  row: number;
  name: string;
  /** `null` = الخانة فاضية · `NaN` = فيها نص مش رقم */
  price: number | null;
  category: string;
  cost: number | null;
}

export interface CustomerImportRow {
  row: number;
  name: string;
  phone: string;
}

// ===== أنواع الخطة والنتيجة =====

export type RowAction = "create" | "update" | "skip" | "error";

export interface ProductPlanRow {
  /** رقم الصف في ملف الإكسل زي ما المستخدم شايفه */
  row: number;
  action: RowAction;
  name: string;
  /** سبب التخطّي أو الخطأ — بيتعرض للمستخدم بالرقم */
  message?: string;
  /** المنتج الموجود اللي هيتحدّث */
  targetId?: number;
  /** التغييرات اللي هتحصل: الحقل → [قديم, جديد] */
  changes?: Record<string, [string, string]>;
}

export interface ProductPlan {
  rows: ProductPlanRow[];
  /** أسماء الفئات اللي هتتعمل جديدة */
  newCategories: string[];
  counts: { create: number; update: number; skip: number; error: number };
  /** ترويسات في الملف مش متعرّف عليها — بتتعرض للمستخدم */
  unknownHeaders: string[];
}

export interface CustomerPlanRow {
  row: number;
  action: RowAction;
  name: string;
  phone: string;
  message?: string;
}

export interface CustomerPlan {
  rows: CustomerPlanRow[];
  counts: { create: number; update: number; skip: number; error: number };
  unknownHeaders: string[];
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  /** مسار النسخة الاحتياطية اللي اتاخدت قبل التنفيذ */
  backupPath: string | null;
}
