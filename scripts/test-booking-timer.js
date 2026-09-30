// اختبار عدّاد الحجز — `bookingTimer` و`overlaps` (دوال صافية بلا داتابيز).
//   npm run build:electron && node scripts/test-booking-timer.js
//
// ⚠️ ليه اختبار لوحده: الحجز بيتحسب في **مكانين** — شريط التنبيه على شاشة الغرف
// وفحص التعارض وقت القبول. لو الحدود اختلفت بينهم، الموظف يشوف «الوقت لسه» والنظام
// يرفض الحجز، أو العكس. الدالة دي مصدر الحقيقة الوحيد للاتنين.
const path = require("node:path");
const {
  bookingTimer,
  overlaps,
  bookingEndsAt,
  BOOKING_STATUS_LABELS,
  BOOKING_GRACE_MINUTES,
  DEFAULT_ALERT_BEFORE_MINUTES,
  clockLabel,
  bookingTimeLabel,
} = require(path.resolve(__dirname, "..", "dist-electron", "shared", "booking.js"));

let failed = 0;
function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) failed++;
}
function eq(actual, expected, m) {
  ok(actual === expected, `${m} (المتوقّع ${expected} — الفعلي ${actual})`);
}

// حجز الساعة 8 مساءً بتوقيت جرينتش، مدته ساعتين
const START = "2026-09-20T20:00:00.000Z";
const T = Date.parse(START);
const at = (min) => T + min * 60_000;
const st = (min, alert = 60) => bookingTimer(START, 120, at(min), alert).status;

console.log("— حالات العدّاد —");
eq(st(-120), "idle", "قبل الميعاد بساعتين (والتنبيه ساعة) = ساكن");
eq(st(-61), "idle", "قبل الميعاد بـ61 دقيقة = لسه ساكن");
eq(st(-60), "soon", "بالظبط عند بداية التنبيه = قرّب");
eq(st(-1), "soon", "قبل الميعاد بدقيقة = قرّب");
eq(st(0), "due", "في الميعاد = واجب دلوقتي");
eq(st(BOOKING_GRACE_MINUTES - 1), "due", "جوّه مهلة السماح = لسه واجب");
eq(st(BOOKING_GRACE_MINUTES), "late", "بعد مهلة السماح = متأخر");
eq(st(600), "late", "بعد 10 ساعات = متأخر برضو (بيفضل ظاهر لحد ما الموظف يقفله)");

console.log("\n— التنبيه قابل للتعديل —");
eq(st(-100, 120), "soon", "تنبيه بساعتين: قبل الميعاد بـ100 دقيقة = قرّب");
eq(st(-100, 30), "idle", "تنبيه بنص ساعة: نفس اللحظة = ساكن");
eq(DEFAULT_ALERT_BEFORE_MINUTES, 60, "التنبيه الافتراضي ساعة");

console.log("\n— الأرقام —");
const t = bookingTimer(START, 120, at(-30));
eq(t.startsInMs, 30 * 60_000, "فاضل نص ساعة على الميعاد");
eq(t.lateMs, 0, "مش متأخر");
eq(bookingTimer(START, 120, at(45)).lateMs, 30 * 60_000, "متأخر نص ساعة (بعد مهلة السماح)");
eq(bookingEndsAt(START, 120), T + 120 * 60_000, "نهاية الحجز = البداية + المدة");
eq(bookingTimer("مش تاريخ", 60, T).status, "idle", "تاريخ بايظ = ساكن (مايكسرش الشاشة)");

console.log("\n— التداخل نصف المفتوح —");
const H = 60 * 60_000;
ok(!overlaps(T, T + H, T + H, T + 2 * H), "حجز 8→9 وحجز 9→10 مايتعارضوش (الحد نصف مفتوح)");
ok(overlaps(T, T + 2 * H, T + H, T + 3 * H), "8→10 و9→11 بيتعارضوا");
ok(overlaps(T + H, T + 3 * H, T, T + 2 * H), "التعارض متماثل مهما كان الترتيب");
ok(overlaps(T, T + 3 * H, T + H, T + 2 * H), "حجز جوّه حجز = تعارض");
ok(!overlaps(T, T + H, T + 2 * H, T + 3 * H), "فترتين بعيدين = مفيش تعارض");

console.log("\n— أسماء الحالات —");
for (const s of ["new", "confirmed", "rejected", "converted", "no_show", "cancelled"]) {
  ok(typeof BOOKING_STATUS_LABELS[s] === "string" && BOOKING_STATUS_LABELS[s].length > 0, `حالة «${s}» ليها اسم عربي`);
}

console.log("\n— صيغة الساعة (9ص / 1م) — نفس الويب حرفياً —");
ok(typeof clockLabel === "function", "clockLabel موجودة");
if (typeof clockLabel === "function") {
  const cases = [[0, 0, "12ص"], [9, 0, "9ص"], [11, 59, "11:59ص"], [12, 0, "12م"], [13, 0, "1م"], [21, 30, "9:30م"], [23, 5, "11:05م"], [24, 0, "12ص"]];
  for (const [h, m, want] of cases) ok(clockLabel(h, m) === want, `clockLabel(${h}, ${m}) = «${want}» (الفعلي «${clockLabel(h, m)}»)`);
}
ok(typeof bookingTimeLabel === "function", "bookingTimeLabel موجودة");
if (typeof bookingTimeLabel === "function") {
  const d = new Date(2026, 8, 17, 21, 0, 0);
  ok(bookingTimeLabel(d.toISOString()) === "9م", `ميعاد 21:00 بالتوقيت المحلي = «9م» (الفعلي «${bookingTimeLabel(d.toISOString())}»)`);
  const d2 = new Date(2026, 8, 17, 0, 30, 0);
  ok(bookingTimeLabel(d2.toISOString()) === "12:30ص", "ميعاد 00:30 = «12:30ص»");
  ok(bookingTimeLabel("مش تاريخ") === "—", "تاريخ بايظ = «—» مش NaN");
}

console.log(failed === 0 ? "\n✅ عدّاد الحجز سليم" : `\n❌ ${failed} فحص فشل`);
process.exit(failed === 0 ? 0 : 1);
