import type Database from "better-sqlite3";

// Migration 030 — المدة المحددة للجلسة (ساعة/ساعتين…) أو مفتوحة. **إضافة بس.**
//
// `planned_minutes` = المدة اللي الزبون قال هيقعدها (من بداية الجلسة). NULL = مفتوحة.
// ⚠️ **تذكير للموظف مش تسعير:** الحساب بيفضل على الوقت الفعلي بـ computeSessionCharge.
// الجلسة مابتقفلش لوحدها — الشاشة بتنبّه أصفر قبل النهاية وأحمر بصوت بعدها، والتمديد بيزوّد الرقم.
// الجلسات القديمة بتاخد NULL = مفتوحة = نفس سلوكها قبل الـmigration بالظبط.
export const migration_030 = {
  version: 30,
  name: "session_planned_time",
  up: (db: Database.Database) => {
    const cols = (db.prepare("PRAGMA table_info(gaming_sessions)").all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes("planned_minutes")) {
      db.exec("ALTER TABLE gaming_sessions ADD COLUMN planned_minutes INTEGER;");
    }
  },
};
