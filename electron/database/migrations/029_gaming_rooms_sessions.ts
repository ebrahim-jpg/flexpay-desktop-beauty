import type Database from "better-sqlite3";

// Migration 029 — الغرف والجلسات (مجال البلايستيشن). **إضافة بس** — صفر مساس بجداول موجودة.
//
// النموذج:
//   • gaming_rooms            — الغرفة/الجهاز + سعر ساعة سنجل ومالتي.
//   • gaming_sessions         — الجلسة (مفتوحة/مقفولة/ملغية). **الفلوس مش هنا**: القفل بيعمل
//                               فاتورة عادية (orders.source='gaming_session') وده اللي بيحمل الإيراد.
//   • gaming_session_segments — فترات الوضع (سنجل/مالتي) بلقطة السعر وقتها.
//   • gaming_session_items    — مشروبات «الحساب المفتوح». **مش بنود فاتورة** — بتتحوّل لبنود
//                               حقيقية (بتسعير وخصم مخزون الكاشير) لحظة الحساب بس.
//   • settings.gaming_rounding_minutes / gaming_min_minutes — التقريب والحد الأدنى.
export const migration_029 = {
  version: 29,
  name: "gaming_rooms_sessions",
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gaming_rooms (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id      TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        device_label  TEXT,
        rate_single   REAL NOT NULL DEFAULT 0,
        rate_multi    REAL NOT NULL DEFAULT 0,
        is_active     INTEGER NOT NULL DEFAULT 1,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        is_deleted    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT,
        created_by    INTEGER,
        updated_by    INTEGER,
        sync_status   TEXT DEFAULT 'pending',
        synced_at     TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS gaming_sessions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id         TEXT UNIQUE NOT NULL,
        session_number   INTEGER NOT NULL,
        room_id          INTEGER NOT NULL REFERENCES gaming_rooms(id),
        room_name        TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'open',
        started_at       TEXT NOT NULL,
        ended_at         TEXT,
        customer_id      INTEGER REFERENCES customers(id),
        customer_name    TEXT,
        opened_by        INTEGER,
        opened_by_name   TEXT,
        closed_by        INTEGER,
        closed_by_name   TEXT,
        order_id         INTEGER REFERENCES orders(id),
        actual_minutes   REAL NOT NULL DEFAULT 0,
        billed_minutes   INTEGER NOT NULL DEFAULT 0,
        time_amount      REAL NOT NULL DEFAULT 0,
        rounding_minutes INTEGER,
        min_minutes      INTEGER,
        cancel_reason    TEXT,
        notes            TEXT,
        business_date    TEXT NOT NULL,
        is_deleted       INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT NOT NULL,
        updated_at       TEXT,
        sync_status      TEXT DEFAULT 'pending',
        synced_at        TEXT
      );
    `);
    // ⚠️ الحارس الحقيقي على «جلسة مفتوحة واحدة لكل غرفة» في الداتابيز نفسها، مش في الكود:
    // لو نقرتين وصلوا في نفس اللحظة، التانية بترمي UNIQUE بدل ما تفتح جلسة موازية
    // (جلسة موازية = وقت بيتحسب مرتين أو جلسة منسية بتاكل فلوس).
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_gaming_sessions_one_open
         ON gaming_sessions(room_id) WHERE status = 'open';`
    );
    db.exec(`CREATE INDEX IF NOT EXISTS idx_gaming_sessions_status ON gaming_sessions(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_gaming_sessions_bdate ON gaming_sessions(business_date);`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS gaming_session_segments (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id     TEXT UNIQUE NOT NULL,
        session_id   INTEGER NOT NULL REFERENCES gaming_sessions(id),
        mode         TEXT NOT NULL,
        hourly_rate  REAL NOT NULL,
        started_at   TEXT NOT NULL,
        ended_at     TEXT
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_gaming_segments_session ON gaming_session_segments(session_id);`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS gaming_session_items (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id            TEXT UNIQUE NOT NULL,
        session_id          INTEGER NOT NULL REFERENCES gaming_sessions(id),
        product_id          INTEGER NOT NULL REFERENCES products(id),
        product_name        TEXT NOT NULL,
        quantity            REAL NOT NULL,
        modifier_option_ids TEXT NOT NULL DEFAULT '[]',
        notes               TEXT,
        added_by            INTEGER,
        created_at          TEXT NOT NULL
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_gaming_items_session ON gaming_session_items(session_id);`);

    // الإعدادات — الافتراضي «بالدقيقة وبلا حد أدنى» عشان مايبقاش فيه تحصيل مفاجئ؛ المالك يغيّره.
    const cols = (db.prepare("PRAGMA table_info(settings)").all() as { name: string }[]).map(
      (c) => c.name
    );
    if (!cols.includes("gaming_rounding_minutes")) {
      db.exec("ALTER TABLE settings ADD COLUMN gaming_rounding_minutes INTEGER NOT NULL DEFAULT 1;");
    }
    if (!cols.includes("gaming_min_minutes")) {
      db.exec("ALTER TABLE settings ADD COLUMN gaming_min_minutes INTEGER NOT NULL DEFAULT 0;");
    }
  },
};
