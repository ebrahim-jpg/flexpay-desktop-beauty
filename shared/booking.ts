// طبقة مشتركة بين الـ Main والـ Renderer — حجوزات الغرف الجايّة من الويب.
//
// ⚠️ `bookingTimer` و`overlaps` هما **مصدر الحقيقة الوحيد** لحالة الحجز: شريط التنبيه
// على شاشة الغرف، وفحص التعارض وقت القبول، والمراقب الدوري — كلهم بيندهوا نفس الدالة.
// لو اتحسبت الحدود inline في مكان تاني، الموظف هيشوف «الوقت لسه» والنظام يرفض الحجز.
//
// ولا حالة من دول بتقفل جلسة ولا بتفتح واحدة ولا بتحجز مكان: القرار كله للموظف.

export type BookingStatus =
  | "new" // لسه مااتراجعش — الموظف بيكلّم الزبون ويتأكد من التحويل
  | "confirmed" // اتأكد
  | "rejected" // اترفض (سبب إجباري)
  | "converted" // بقى جلسة فعلية
  | "no_show" // الميعاد عدّى والزبون مجاش
  | "cancelled"; // اتلغى بعد التأكيد (الزبون طلب)

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  new: "جديد",
  confirmed: "متأكّد",
  rejected: "مرفوض",
  converted: "بقى جلسة",
  no_show: "مجاش",
  cancelled: "ملغي",
};

/** الحالات اللي لسه واخدة وقت من الغرفة — بتدخل في التعارض وفي تنبيه الشاشة */
export const BOOKING_ACTIVE_STATUSES: BookingStatus[] = ["new", "confirmed"];

/** مهلة السماح بعد الميعاد: جوّاها الحجز «واجب دلوقتي»، وبعدها «متأخر» */
export const BOOKING_GRACE_MINUTES = 15;
/** التنبيه قبل الميعاد — القيمة الفعلية بتيجي من لوحة الويب مع رد السحب */
export const DEFAULT_ALERT_BEFORE_MINUTES = 60;
export const ALERT_BEFORE_OPTIONS = [15, 30, 60, 120] as const;
/**
 * بعد كام دقيقة من الميعاد يبطّل الحجز يتصدّر كارت الغرفة.
 * ⚠️ بيختفي من الكارت بس — بيفضل في صفحة «طلبات الحجز» لحد ما الموظف يقفله (قرار المرونة).
 */
export const BOOKING_STALE_MINUTES = 180;

export type BookingAlert = "idle" | "soon" | "due" | "late";

export interface BookingTimer {
  status: BookingAlert;
  /** فاضل قد إيه على الميعاد (صفر لو الميعاد عدّى) */
  startsInMs: number;
  /** عدّى قد إيه على مهلة السماح (صفر لو لسه) */
  lateMs: number;
  startsAtMs: number;
  endsAtMs: number;
}

/** نهاية الحجز = البداية + المدة (المدة نيّة مش تسعير — التسعير على الوقت الفعلي) */
export function bookingEndsAt(startsAt: string, durationMinutes: number): number {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return 0;
  return start + Math.max(0, durationMinutes) * 60_000;
}

/**
 * حالة الحجز بالنسبة للوقت: ساكن · قرّب (أصفر) · واجب دلوقتي (أحمر + صوت) · متأخر (أحمر بلا صوت).
 * تاريخ بايظ بيرجّع «ساكن» بدل ما يكسر الشاشة.
 */
export function bookingTimer(
  startsAt: string,
  durationMinutes: number,
  now: number,
  alertBeforeMinutes: number = DEFAULT_ALERT_BEFORE_MINUTES,
  graceMinutes: number = BOOKING_GRACE_MINUTES
): BookingTimer {
  const startsAtMs = Date.parse(startsAt);
  if (!Number.isFinite(startsAtMs)) {
    return { status: "idle", startsInMs: 0, lateMs: 0, startsAtMs: 0, endsAtMs: 0 };
  }
  const endsAtMs = startsAtMs + Math.max(0, durationMinutes) * 60_000;
  const startsInMs = Math.max(0, startsAtMs - now);
  const graceEnd = startsAtMs + Math.max(0, graceMinutes) * 60_000;
  const lateMs = now >= graceEnd ? now - graceEnd : 0;

  if (now >= graceEnd) return { status: "late", startsInMs: 0, lateMs, startsAtMs, endsAtMs };
  if (now >= startsAtMs) return { status: "due", startsInMs: 0, lateMs: 0, startsAtMs, endsAtMs };
  const alertMs = Math.max(0, alertBeforeMinutes) * 60_000;
  return {
    status: startsInMs <= alertMs ? "soon" : "idle",
    startsInMs,
    lateMs: 0,
    startsAtMs,
    endsAtMs,
  };
}

/**
 * تداخل فترتين — **نصف مفتوح** `[start, end)`.
 * يعني حجز 8→9 وحجز 9→10 مايتعارضوش: الغرفة بتفضى بالظبط الساعة 9.
 */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * صيغة الساعة للعرض: 0→«12ص» · 9→«9ص» · 12→«12م» · 13→«1م» · 21:30→«9:30م».
 * ⚠️ **متطابقة حرفياً** مع `clockLabel` في `app-web/lib/gaming/booking-slots.ts` — الزبون
 * بيشوف «9م» على صفحة الحجز والموظف لازم يشوف نفس الكلمة (حارس الويب بيقارن النصّين).
 */
export function clockLabel(hour: number, minute: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const suffix = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const m = Math.floor(minute);
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** ساعة ميعاد الحجز بتوقيت الجهاز (الجهاز في المحل = توقيت المحل) */
export function bookingTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return clockLabel(d.getHours(), d.getMinutes());
}

export interface BookingDTO {
  id: number;
  local_id: string;
  status: BookingStatus;
  /**
   * حجز طاولة: بيوصل **من غير طاولة** (`room_id = null`) — ميعاد + عدد أفراد، والموظف
   * بيحدد الطاولة وقت التأكيد. نسخة «كافيه» مالهاش حجز غرف.
   */
  kind: "table";
  /** عدد الأفراد — لحجز الطاولة بس */
  party_size: number | null;
  /** null = الغرفة اتشالت من الديسكتوب بعد الحجز (الاسم اللقطة بيفضل) */
  room_id: number | null;
  room_name: string;
  starts_at: string; // ISO UTC — المرجع الوحيد لأي مقارنة
  duration_minutes: number;
  business_date: string;
  customer_name: string | null;
  customer_phone: string;
  notes: string | null;
  /** ملاحظة الموظف وقت التأكيد (مثلاً «حوّل 50 على فودافون كاش») — نص بس، مفيش فلوس في النظام */
  confirm_note: string | null;
  session_id: number | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  web_created_at: string | null;
}

/** هل الحجزين على نفس الغرفة ووقتهم متداخل؟ (الاتنين لازم يكونوا في حالة فعّالة) */
export function bookingsConflict(a: BookingDTO, b: BookingDTO): boolean {
  if (a.local_id === b.local_id) return false;
  if (a.room_id == null || b.room_id == null || a.room_id !== b.room_id) return false;
  const aStart = Date.parse(a.starts_at);
  const bStart = Date.parse(b.starts_at);
  if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return false;
  return overlaps(
    aStart,
    bookingEndsAt(a.starts_at, a.duration_minutes),
    bStart,
    bookingEndsAt(b.starts_at, b.duration_minutes)
  );
}

/**
 * أقرب حجز يستاهل يتعرض على كارت غرفة: المتأكّد اللي قرّب أو واجب أو متأخر لسه في وقته.
 * بيرجّع null لو مفيش — الكارت يفضل نضيف.
 */
export function roomBookingAlert(
  bookings: BookingDTO[],
  roomId: number,
  now: number,
  alertBeforeMinutes: number = DEFAULT_ALERT_BEFORE_MINUTES
): { booking: BookingDTO; timer: BookingTimer } | null {
  let best: { booking: BookingDTO; timer: BookingTimer } | null = null;
  for (const b of bookings) {
    if (b.room_id !== roomId) continue;
    if (b.status !== "confirmed") continue;
    const timer = bookingTimer(b.starts_at, b.duration_minutes, now, alertBeforeMinutes);
    if (timer.status === "idle") continue;
    if (timer.status === "late" && timer.lateMs > BOOKING_STALE_MINUTES * 60_000) continue;
    if (!best || timer.startsAtMs < best.timer.startsAtMs) best = { booking: b, timer };
  }
  return best;
}
