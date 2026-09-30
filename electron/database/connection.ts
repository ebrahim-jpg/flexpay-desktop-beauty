import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { runMigrations } from "./migrations";
import { seedDatabase } from "./seed";

let db: Database.Database | null = null;

// يفتح الاتصال، يضبط الـ pragmas، يشغّل migrations + seed عند أول تشغيل
export function initDatabase(userDataDir: string): Database.Database {
  if (db) return db;

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const dbPath = path.join(userDataDir, "database.db");
  db = new Database(dbPath);

  // إعدادات الأداء والسلامة
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  runMigrations(db);
  seedDatabase(db);

  return db;
}

// الوصول للاتصال المفتوح (يفشل لو ما اتفتحش بعد)
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
