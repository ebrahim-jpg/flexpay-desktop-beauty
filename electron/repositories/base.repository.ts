import type Database from "better-sqlite3";
import { getDatabase } from "../database/connection";
import { newLocalId, nowISO } from "../lib/id";
import { enqueueSync } from "../sync/sync-queue";
import type { SyncEventType } from "../../types/database.types";

// طبقة CRUD مشتركة لكل الـ repositories.
// تضمن قواعد الدستور: local_id, timestamps, soft delete, sync queue.
export abstract class BaseRepository {
  protected get db(): Database.Database {
    return getDatabase();
  }

  protected newLocalId(): string {
    return newLocalId();
  }

  protected now(): string {
    return nowISO();
  }

  // تشغيل مجموعة عمليات في معاملة واحدة (ذرّية)
  protected transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // إضافة السجل لقائمة انتظار المزامنة (لا تضيع بيانة)
  protected enqueue(
    entityType: string,
    eventType: SyncEventType,
    localId: string,
    payload: unknown
  ): void {
    enqueueSync(this.db, { entityType, eventType, localId, payload });
  }
}
