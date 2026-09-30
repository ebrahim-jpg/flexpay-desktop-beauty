import type Database from "better-sqlite3";

// Migration 016 — أعمدة نسبة التهدير على بنود الجرد.
// ⚠️ ليه migration منفصل ومش تعديل على 015؟
//   لأن قواعد بيانات طبّقت 015 (نسخة الجرد الأصلية) قبل تحديث منطق التهدير،
//   فلازم نضيف الأعمدة بـ ALTER عشان تترقّى بأمان (التعديل المباشر على 015 مكنش هيشتغل عليها).
// إضافي بحت (ADD COLUMN بقيمة افتراضية 0) → الصفوف القديمة بتاخد 0، مفيش تلف.
export const migration_016 = {
  version: 16,
  name: "stocktake_tolerance",
  up: (db: Database.Database) => {
    const cols = (
      db.prepare("PRAGMA table_info(stocktake_items)").all() as { name: string }[]
    ).map((c) => c.name);

    if (!cols.includes("expected_min")) {
      // أقل كمية مقبولة بعد التهدير المسموح
      db.exec(`ALTER TABLE stocktake_items ADD COLUMN expected_min REAL NOT NULL DEFAULT 0;`);
    }
    if (!cols.includes("waste_percentage")) {
      // لقطة نسبة التهدير وقت الجرد
      db.exec(`ALTER TABLE stocktake_items ADD COLUMN waste_percentage REAL NOT NULL DEFAULT 0;`);
    }
  },
};
