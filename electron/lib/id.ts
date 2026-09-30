import { randomUUID } from "node:crypto";

// UUID يتولد على الجهاز قبل الحفظ (الدستور: لا سجل بدون local_id)
export function newLocalId(): string {
  return randomUUID();
}

// توقيت ISO موحد للحفظ في SQLite
export function nowISO(): string {
  return new Date().toISOString();
}
