import type Database from "better-sqlite3";

// Migration 008 — Soft delete لسجلات الحضور (عشان التعديل/الحذف اليدوي)
export const migration_008 = {
  version: 8,
  name: "attendance_softdelete",
  up: (db: Database.Database) => {
    const cols = (db.prepare("PRAGMA table_info(attendance_logs)").all() as {
      name: string;
    }[]).map((c) => c.name);

    if (!cols.includes("is_deleted")) {
      db.exec("ALTER TABLE attendance_logs ADD COLUMN is_deleted INTEGER DEFAULT 0;");
    }
    if (!cols.includes("deleted_by")) {
      db.exec("ALTER TABLE attendance_logs ADD COLUMN deleted_by INTEGER;");
    }
    if (!cols.includes("deleted_at")) {
      db.exec("ALTER TABLE attendance_logs ADD COLUMN deleted_at DATETIME;");
    }
    if (!cols.includes("updated_by")) {
      db.exec("ALTER TABLE attendance_logs ADD COLUMN updated_by INTEGER;");
    }
    if (!cols.includes("updated_at")) {
      db.exec("ALTER TABLE attendance_logs ADD COLUMN updated_at DATETIME;");
    }
  },
};
