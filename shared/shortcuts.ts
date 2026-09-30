// اختصارات لوحة المفاتيح لكل مستخدم (ربط زر بمنتج في الكاشير)

export interface UserShortcut {
  key: string; // حرف/رقم واحد (lowercase)
  product_id: number;
  product_name: string | null;
}

// الأزرار المحجوزة للنظام في الكاشير — ممنوع تتربط بمنتج.
// (مسافة/Enter/Esc/Tab… مش حروف مفردة أصلاً فبتتستبعد تلقائياً، بس بنوثّقها للوضوح)
export const RESERVED_SHORTCUT_KEYS = [
  " ",
  "enter",
  "escape",
  "tab",
  "backspace",
  "delete",
];

// اختصار منتج صالح = حرف لاتيني أو رقم واحد فقط (a-z, 0-9).
// ده بطبيعته بيستبعد كل الأزرار المحجوزة (مسافة/Enter/Esc) وأي combo فيه modifier.
export function isValidShortcutKey(key: string): boolean {
  return /^[a-z0-9]$/.test(key);
}

export function normalizeShortcutKey(key: string): string {
  return key.trim().toLowerCase();
}
