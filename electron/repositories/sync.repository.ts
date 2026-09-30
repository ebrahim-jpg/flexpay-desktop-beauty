import { BaseRepository } from "./base.repository";
import { getQueueList, resetFailed } from "../sync/sync-queue";
import { entityTypeLabel } from "../../shared/sync";
import type { SyncQueueItemDTO, SyncLogDTO } from "../../shared/sync";
import type { SyncLogRow } from "../../types/database.types";

export class SyncRepository extends BaseRepository {
  // قائمة المنتظر/الفاشل (للعرض في المراقب)
  getQueueList(limit = 50): SyncQueueItemDTO[] {
    return getQueueList(this.db, limit).map((r) => ({
      id: r.id,
      entity_type: r.entity_type,
      event_type: r.event_type,
      status: r.status,
      attempts: r.attempts,
      error_message: r.error_message,
      created_at: r.created_at,
    }));
  }

  // سجل آخر عمليات المزامنة
  getLog(limit = 50): SyncLogDTO[] {
    const rows = this.db
      .prepare("SELECT * FROM sync_log ORDER BY id DESC LIMIT ?")
      .all(limit) as SyncLogRow[];
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      result: r.result,
      records_count: r.records_count,
      message: r.message,
    }));
  }

  // إعادة المحاولة للفاشلة → ترجع pending
  retryFailed(): number {
    return resetFailed(this.db);
  }
}

// نص عربي لنوع الكيان — يُعاد تصديره للراحة
export { entityTypeLabel };

export const syncRepository = new SyncRepository();
