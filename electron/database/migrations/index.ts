import type Database from "better-sqlite3";
import { migration_001 } from "./001_initial";
import { migration_002 } from "./002_settings";
import { migration_003 } from "./003_products";
import { migration_004 } from "./004_inventory";
import { migration_005 } from "./005_orders";
import { migration_006 } from "./006_customers";
import { migration_007 } from "./007_management";
import { migration_008 } from "./008_attendance_softdelete";
import { migration_009 } from "./009_sale_type";
import { migration_010 } from "./010_sync_log";
import { migration_011 } from "./011_free_invoice";
import { migration_012 } from "./012_free_recipient";
import { migration_013 } from "./013_supplier_credit";
import { migration_014 } from "./014_purchase_invoices";
import { migration_015 } from "./015_stocktake";
import { migration_016 } from "./016_stocktake_tolerance";
import { migration_017 } from "./017_user_shortcuts";
import { migration_018 } from "./018_order_sellers";
import { migration_019 } from "./019_order_source";
import { migration_020 } from "./020_online_orders";
import { migration_021 } from "./021_online_orders_business_date";
import { migration_022 } from "./022_delivery";
import { migration_023 } from "./023_attendance_codes";
import { migration_024 } from "./024_seller_categories";
import { migration_025 } from "./025_delivery_address";
import { migration_026 } from "./026_online_order_cancel";
import { migration_027 } from "./027_sync_toggle";
import { migration_028 } from "./028_gaming_vertical";
import { migration_029 } from "./029_gaming_rooms_sessions";
import { migration_030 } from "./030_session_planned_time";
import { migration_031 } from "./031_room_bookings";
import { migration_032 } from "./032_tables";
import { migration_033 } from "./033_cafe_vertical";
import { migration_034 } from "./034_restaurant_vertical";
import { migration_035 } from "./035_product_sizes";
import { migration_036 } from "./036_kitchen_batches";

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

// كل الـ migrations بالترتيب — تُضاف هنا في المراحل القادمة
export const migrations: Migration[] = [
  migration_001,
  migration_002,
  migration_003,
  migration_004,
  migration_005,
  migration_006,
  migration_007,
  migration_008,
  migration_009,
  migration_010,
  migration_011,
  migration_012,
  migration_013,
  migration_014,
  migration_015,
  migration_016,
  migration_017,
  migration_018,
  migration_019,
  migration_020,
  migration_021,
  migration_022,
  migration_023,
  migration_024,
  migration_025,
  migration_026,
  migration_027,
  migration_028,
  migration_029,
  migration_030,
  migration_031,
  migration_032,
  migration_033,
  migration_034,
  migration_035,
  migration_036,
];

// يشغّل كل الـ migrations الناقصة بالترتيب باستخدام PRAGMA user_version
export function runMigrations(db: Database.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;

  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    const tx = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    tx();
    // eslint-disable-next-line no-console
    console.log(`[db] applied migration ${migration.version} (${migration.name})`);
  }
}
