import { BaseRepository } from "./base.repository";
import type { AuditLogInput } from "../../types/ipc.types";

// سجل العمليات الحساسة. كل سجل يُضاف لقائمة المزامنة تلقائياً (الدستور §5).
export class AuditRepository extends BaseRepository {
  log(input: AuditLogInput): void {
    const localId = this.newLocalId();
    const ts = this.now();

    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO audit_log (
            local_id, user_id, user_name, action, entity_type, entity_id,
            old_value, new_value, timestamp, sync_status
          ) VALUES (
            @local_id, @user_id, @user_name, @action, @entity_type, @entity_id,
            @old_value, @new_value, @timestamp, 'pending'
          )`
        )
        .run({
          local_id: localId,
          user_id: input.userId,
          user_name: input.userName,
          action: input.action,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          old_value: input.oldValue != null ? JSON.stringify(input.oldValue) : null,
          new_value: input.newValue != null ? JSON.stringify(input.newValue) : null,
          timestamp: ts,
        });

      // audit_log يروح للـ Sync دايماً
      this.enqueue("audit_log", "CREATED", localId, {
        local_id: localId,
        user_id: input.userId,
        user_name: input.userName,
        action: input.action,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        old_value: input.oldValue ?? null,
        new_value: input.newValue ?? null,
        timestamp: ts,
      });
    });
  }
}

export const auditRepository = new AuditRepository();
