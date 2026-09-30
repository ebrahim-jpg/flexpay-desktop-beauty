import type Database from "better-sqlite3";

// Migration 017 — اختصارات لوحة المفاتيح لكل مستخدم (ربط زر بمنتج في الكاشير)
// ⚠️ إضافي بحت (جدول جديد). محلي بس — تفضيل واجهة، الويب مش محتاجه (مفيش مزامنة).
export const migration_017 = {
  version: 17,
  name: "user_shortcuts",
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_shortcuts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id      TEXT UNIQUE NOT NULL,
        user_id       INTEGER NOT NULL REFERENCES users(id),
        shortcut_key  TEXT NOT NULL,        -- حرف/رقم واحد (lowercase)
        product_id    INTEGER NOT NULL,
        product_name  TEXT,                 -- لقطة للعرض
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, shortcut_key)
      );
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_user_shortcuts_user ON user_shortcuts(user_id);`
    );
  },
};
