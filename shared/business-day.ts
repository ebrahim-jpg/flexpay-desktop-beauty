// مفتاح اليوم التجاري YYYY-MM-DD — مشترك بين الـ Main والـ Renderer.
// الطلبات/الحضور/المصاريف كلها بتستخدمه عشان "اليوم" يبقى موحّد.
export function businessDateKey(date: Date, startHour: number): string {
  const x = new Date(date);
  if (x.getHours() < startHour) x.setDate(x.getDate() - 1);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// يطرح N يوم من مفتاح تاريخ (للنطاقات: آخر 30 يوم)
export function shiftDateKey(key: string, days: number): string {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
