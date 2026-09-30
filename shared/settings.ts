// طبقة مشتركة بين الـ Main والـ Renderer لتعريفات الإعدادات.

export interface PaymentMethod {
  key: string;
  label: string;
  enabled: boolean;
}

// طرق الدفع الافتراضية. الكاش مفعّل دائماً ولا يمكن تعطيله.
export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { key: "cash", label: "كاش", enabled: true },
  { key: "card", label: "بطاقة", enabled: false },
  { key: "instapay", label: "إنستاباي", enabled: false },
];

export const DEFAULT_NATIONALITIES: string[] = ["مصري"];

// منطقة توصيل: اسم + سعر. ⚠️ السعر للعرض/الفاتورة فقط — مايدخلش أي حساب مالي في السيستم.
export interface DeliveryZone {
  id: string;
  name: string;
  price: number;
}

// شكل الإعدادات المُرسَل للـ Renderer (JSON مفكوك + شعار كـ data URL)
export interface SettingsDTO {
  shopName: string;
  shopLogo: string | null; // data URL للعرض
  country: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  businessDayStart: number; // 0-23
  nationalities: string[];
  paymentMethods: PaymentMethod[];
  deliveryZones: DeliveryZone[]; // مناطق التوصيل وأسعارها (عرض فقط)
  lowStockThreshold: number;
  absenceAlertDays: number;
  receiptHeader: string;
  receiptFooter: string;
  printerName: string | null;
  /** طابعة تذكرة المطبخ — null = نفس طابعة الفاتورة (محل بطابعة واحدة) */
  kitchenPrinterName: string | null;
  shopCode: string | null;
  // ⚠️ المفتاح السري **مايخرجش** للواجهة — آخر ٤ خانات بس للتعرّف عليه وقت الدعم.
  // الواجهة مش محتاجاه، والـDTO دي بتوصل الـrenderer وبتتسجّل في سجل التدقيق.
  secretKeyTail: string | null;
  syncServerUrl: string;
  syncEnabled: boolean;
  autoHideOutOfStock: boolean;
  autoClockoutHours: number; // انصراف تلقائي بعد كذا ساعة (0 = متعطّل) — عام للكل
  attendanceWarnHours: number; // تحذير «لسه موجود؟» بعد كذا ساعة (0 = متعطّل)
  /** التنبيه قبل ميعاد الحجز (دقيقة) — بيتظبط من لوحة الويب وبيوصل مع السحب */
  bookingAlertMinutes: number;
  updatedAt: string | null;
}

// الحقول القابلة للتعديل من الواجهة (الشعار له قناة منفصلة).
//
// ⚠️ `shopCode` و`secretKey` **مش هنا عن قصد** — هوية المزامنة بتتحدّد من كود
// التفعيل بس (`setActivation`). لو رجعوا هنا، أي نداء `settings:update` يقدر
// يكتب فوق هوية المحل، وتفضيتهم بتقفل التطبيق كله ورا شاشة التفعيل.
export type UpdateSettingsInput = Partial<{
  shopName: string;
  country: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  businessDayStart: number;
  nationalities: string[];
  paymentMethods: PaymentMethod[];
  deliveryZones: DeliveryZone[];
  lowStockThreshold: number;
  absenceAlertDays: number;
  receiptHeader: string;
  receiptFooter: string;
  printerName: string | null;
  kitchenPrinterName: string | null;
  syncServerUrl: string;
  syncEnabled: boolean;
  autoHideOutOfStock: boolean;
  autoClockoutHours: number;
  attendanceWarnHours: number;
}>;

// حقول الهوية اللي **ممنوع** تتسجّل في سجل التدقيق المحلي.
// السجل بيتخزّن plain في قاعدة المحل، وكان بيتكتب فيه المفتاح السري في **كل**
// تغيير إعدادات — فأي حد يفتح القاعدة يلاقي المفتاح حتى بعد ما يتدوّر.
const REDACTED_KEYS = ["secretKey", "secretKeyTail"] as const;

// بتشيل حقول الهوية من أي كائن إعدادات قبل ما يتسجّل. بتشتغل على `unknown`
// عشان تنفع للـDTO القديمة كمان (سجلّات محفوظة من نسخ أقدم).
export function redactSettings<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of REDACTED_KEYS) delete copy[key];
  return copy as T;
}

export interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface SyncTestResult {
  reachable: boolean;
  message: string;
}
