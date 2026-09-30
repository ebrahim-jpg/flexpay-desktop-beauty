import type Database from "better-sqlite3";

// Migration 019 — مصدر الطلب (من فين جه الطلب).
// ⚠️ إضافي بحت: عمود واحد على orders. الطلبات القديمة قيمتها NULL = نقطة بيع عادية (pos).
//    القيمة "online_store" تتحط بس على الطلبات اللي جايّة من المتجر الإلكتروني (0.9.0)
//    عشان نفرّق في التقارير بين توصيل المتجر وتوصيل الاتصالات.
//    دفاعيًا: نتأكد العمود مش موجود قبل ما نضيفه (نفس درس migration 016).
export const migration_019 = {
  version: 19,
  name: "order_source",
  up: (db: Database.Database) => {
    const cols = db
      .prepare("PRAGMA table_info(orders)")
      .all() as { name: string }[];
    const hasSource = cols.some((c) => c.name === "source");
    if (!hasSource) {
      db.exec(`ALTER TABLE orders ADD COLUMN source TEXT;`);
    }
  },
};
