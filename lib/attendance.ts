// حساب مدة الحضور — "9 ساعات و 30 دقيقة" أو "لا يزال حاضراً"
import { formatNumber } from "@/lib/formatters";

export function durationMinutes(
  clockIn: string,
  clockOut: string | null
): number | null {
  if (!clockOut) return null;
  const a = new Date(clockIn).getTime();
  const b = new Date(clockOut).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "لا يزال حاضراً";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${formatNumber(m)} دقيقة`;
  if (m === 0) return `${formatNumber(h)} ساعة`;
  return `${formatNumber(h)} ساعة و ${formatNumber(m)} دقيقة`;
}

// مدة منقضية من وقت معيّن للآن (للموظف الحاضر)
export function formatElapsedSince(since: string | null): string {
  if (!since) return "";
  const mins = durationMinutes(since, new Date().toISOString());
  if (mins === null) return "";
  return formatDuration(mins);
}
