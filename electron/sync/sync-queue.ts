import type Database from "better-sqlite3";
import type { SyncEventType, SyncQueueRow } from "../../types/database.types";

// إضافة عملية لقائمة انتظار المزامنة.
// الدستور: كل بيانة تتسجل لازم تروح للـ Web — هنا بنحطها في الطابور.
export function enqueueSync(
  db: Database.Database,
  params: {
    localId: string;
    entityType: string;
    eventType: SyncEventType;
    payload: unknown;
  }
): void {
  db.prepare(
    `INSERT INTO sync_queue (local_id, entity_type, event_type, payload, status, attempts)
     VALUES (@local_id, @entity_type, @event_type, @payload, 'pending', 0)`
  ).run({
    local_id: params.localId,
    entity_type: params.entityType,
    event_type: params.eventType,
    payload: JSON.stringify(params.payload),
  });
}

export function getPendingCount(db: Database.Database): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM sync_queue WHERE status = 'pending'")
    .get() as { c: number };
  return row.c;
}

export interface QueueStats {
  pending: number;
  synced: number;
  failed: number;
  syncing: number;
}

export function getQueueStats(db: Database.Database): QueueStats {
  const rows = db
    .prepare("SELECT status, COUNT(*) AS c FROM sync_queue GROUP BY status")
    .all() as { status: string; c: number }[];
  const stats: QueueStats = { pending: 0, synced: 0, failed: 0, syncing: 0 };
  for (const r of rows) {
    if (r.status in stats) stats[r.status as keyof QueueStats] = r.c;
  }
  return stats;
}

// أقدم دفعة منتظرة (للإرسال)
export function getPendingBatch(
  db: Database.Database,
  limit: number
): SyncQueueRow[] {
  return db
    .prepare(
      `SELECT * FROM sync_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC, id ASC
       LIMIT ?`
    )
    .all(limit) as SyncQueueRow[];
}

// قائمة المنتظر/الفاشل لعرضها في المراقب
export function getQueueList(
  db: Database.Database,
  limit: number
): SyncQueueRow[] {
  return db
    .prepare(
      `SELECT * FROM sync_queue
       WHERE status IN ('pending', 'syncing', 'failed')
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(limit) as SyncQueueRow[];
}

export function markSyncing(db: Database.Database, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE sync_queue SET status = 'syncing', last_attempt_at = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders})`
  ).run(...ids);
}

export function markSynced(db: Database.Database, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE sync_queue SET status = 'synced' WHERE id IN (${placeholders})`
  ).run(...ids);
}

// فشل الدفعة: زوّد المحاولات، ولو وصلت الحد علّمها failed وإلا رجّعها pending
export function markBatchFailed(
  db: Database.Database,
  ids: number[],
  error: string,
  maxAttempts: number
): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  // كلها positional (?) — better-sqlite3 مابيسمحش بخلط named و positional
  db.prepare(
    `UPDATE sync_queue
     SET attempts = attempts + 1,
         error_message = ?,
         last_attempt_at = CURRENT_TIMESTAMP,
         status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END
     WHERE id IN (${placeholders})`
  ).run(error, maxAttempts, ...ids);
}

// تحرير دفعة من حالة syncing لـ pending **من غير ما نحرق محاولة** —
// بنستخدمها لما الفشل بسبب الشبكة (مش غلطة الداتا)، فالبيانة تتعاد زي ما هي.
export function releaseBatch(db: Database.Database, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE sync_queue SET status = 'pending'
     WHERE id IN (${placeholders}) AND status = 'syncing'`
  ).run(...ids);
}

// إعادة المحاولة للفاشلة: رجّعها pending وصفّر المحاولات
export function resetFailed(db: Database.Database): number {
  const res = db
    .prepare(
      `UPDATE sync_queue SET status = 'pending', attempts = 0, error_message = NULL
       WHERE status = 'failed'`
    )
    .run();
  return res.changes;
}

// تسجيل نتيجة دفعة مزامنة في سجل المزامنة
export function logSyncRun(
  db: Database.Database,
  result: "success" | "error",
  recordsCount: number,
  message: string | null
): void {
  db.prepare(
    `INSERT INTO sync_log (result, records_count, message) VALUES (?, ?, ?)`
  ).run(result, recordsCount, message);
}
