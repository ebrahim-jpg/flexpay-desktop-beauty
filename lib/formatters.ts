// تنسيق الأرقام والتواريخ — العملة ديناميكية من الإعدادات (الدستور §10)

// أرقام بالفواصل، العملة تُمرَّر من الإعدادات
export function formatCurrency(value: number, symbol = "ج.م"): string {
  const formatted = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0);
  return `${formatted} ${symbol}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ar-EG").format(value || 0);
}

// التواريخ: dd/mm/yyyy بالتوقيت المحلي
export function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDateTime(value: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const time = new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${formatDate(d)} - ${time}`;
}

// "النهاردة" | "إمبارح" | "منذ X يوم" — من عدد أيام الغياب
export function formatAbsence(days: number | null): string {
  if (days === null) return "لسه مجاش";
  if (days <= 0) return "النهاردة";
  if (days === 1) return "إمبارح";
  if (days === 2) return "من يومين";
  return `من ${formatNumber(days)} يوم`;
}
