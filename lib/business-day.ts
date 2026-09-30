// منطق اليوم التجاري (Business Day) — PRD-02.
// المحل بيشتغل لبعد منتصف الليل، فاليوم التجاري بيبدأ من ساعة يحددها المالك.

// يرجّع تاريخ اليوم التجاري (منتصف ليل اليوم التجاري) للـ timestamp المعطى
export function getBusinessDay(date: Date, startHour: number): Date {
  const d = new Date(date);
  if (d.getHours() < startHour) {
    // قبل ساعة البداية → ينتمي لليوم السابق
    d.setDate(d.getDate() - 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

// يرجّع النطاق الزمني الكامل ليوم تجاري معيّن
// مثال: startHour=3 → من اليوم 3:00 ص لبكرة 2:59:59 ص
export function getBusinessDayRange(
  businessDate: Date,
  startHour: number
): { from: Date; to: Date } {
  const from = new Date(businessDate);
  from.setHours(startHour, 0, 0, 0);

  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setMilliseconds(to.getMilliseconds() - 1);

  return { from, to };
}

// هل الـ date ينتمي لليوم التجاري الحالي؟
export function isToday(date: Date, startHour: number): boolean {
  const target = getBusinessDay(date, startHour).getTime();
  const today = getBusinessDay(new Date(), startHour).getTime();
  return target === today;
}

// "الثلاثاء، 21 مايو 2025"
export function formatBusinessDate(date: Date): string {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
