import type Database from "better-sqlite3";
import { hashPassword } from "../lib/crypto";
import { newLocalId, nowISO } from "../lib/id";
import { defaultPermissionsFor } from "../../shared/permissions";
import {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_NATIONALITIES,
} from "../../shared/settings";

// بيانات أولية — تُنشأ مرة واحدة عند أول تشغيل
export function seedDatabase(db: Database.Database): void {
  seedSettings(db);
  seedOwner(db);
}

// صف الإعدادات الوحيد (id = 1)
function seedSettings(db: Database.Database): void {
  const exists = db.prepare("SELECT id FROM settings WHERE id = 1").get();
  if (exists) return;

  db.prepare(
    `INSERT INTO settings (
      id, local_id, payment_methods, nationalities, updated_at, sync_status
    ) VALUES (1, @local_id, @payment_methods, @nationalities, @now, 'pending')`
  ).run({
    local_id: newLocalId(),
    payment_methods: JSON.stringify(DEFAULT_PAYMENT_METHODS),
    nationalities: JSON.stringify(DEFAULT_NATIONALITIES),
    now: nowISO(),
  });

  // eslint-disable-next-line no-console
  console.log("[db] seeded default settings row");
}

function seedOwner(db: Database.Database): void {
  const userCount = db
    .prepare("SELECT COUNT(*) AS c FROM users")
    .get() as { c: number };

  if (userCount.c > 0) return;

  // مستخدم مالك افتراضي: admin / admin123
  const now = nowISO();
  db.prepare(
    `INSERT INTO users (
      local_id, name, username, password_hash, pin_hash, role,
      permissions, is_active, created_by, updated_by,
      created_at, updated_at, sync_status
    ) VALUES (
      @local_id, @name, @username, @password_hash, NULL, @role,
      @permissions, 1, NULL, NULL, @now, @now, 'pending'
    )`
  ).run({
    local_id: newLocalId(),
    name: "المالك",
    username: "admin",
    password_hash: hashPassword("admin123"),
    role: "owner",
    permissions: JSON.stringify(defaultPermissionsFor("owner")),
    now,
  });

  // eslint-disable-next-line no-console
  console.log("[db] seeded default owner (admin / admin123)");
}
