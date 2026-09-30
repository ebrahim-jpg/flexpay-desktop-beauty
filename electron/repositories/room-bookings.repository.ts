import { BaseRepository } from "./base.repository";
import { businessDateKey, shiftDateKey } from "../../shared/business-day";
import {
  bookingEndsAt,
  overlaps,
  BOOKING_ACTIVE_STATUSES,
  type BookingDTO,
  type BookingStatus,
} from "../../shared/booking";

const ARCHIVE_DAYS = 30;

/** الحجز الجايّ من الويب في رد السحب */
export interface PulledBooking {
  local_id: string;
  /** null لحجز الطاولة — الطاولة بتتحدد وقت التأكيد */
  room_desktop_id: number | null;
  room_name: string;
  /** «بلايستيشن + كافيه» — مش موجود = room (الويب القديم) */
  kind?: "room" | "table";
  party_size?: number | null;
  mode: string;
  starts_at: string;
  duration_minutes: number;
  customer: { name: string | null; phone: string; notes: string | null };
  price_estimate: number;
  created_at: string | null;
}

/** قرار الموظف اللي بيترفع للويب */
export interface BookingDecisionOut {
  local_id: string;
  status: BookingStatus;
  reason: string | null;
  confirm_note: string | null;
  session_desktop_id: number | null;
  /** حجز الطاولة المتأكّد: الطاولة اللي الموظف اختارها — حجز الغرفة مابيبعتهمش (العقد القديم) */
  room_desktop_id?: number;
  room_name?: string;
}

interface BookingRow {
  id: number;
  local_id: string;
  status: string;
  room_id: number | null;
  room_desktop_id: number;
  room_name: string;
  kind: string;
  party_size: number | null;
  mode: string;
  starts_at: string;
  duration_minutes: number;
  business_date: string;
  customer_name: string | null;
  customer_phone: string;
  notes: string | null;
  price_estimate: number;
  confirm_note: string | null;
  session_id: number | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  web_created_at: string | null;
  alerted: number;
}

/**
 * حجوزات الغرف المسحوبة من الويب.
 *
 * ⚠️ **محلي بحت — ممنوع `enqueue`**: الاتجاه ويب→ديسكتوب، والرفع العكسي بعلمين
 * (`web_acked` و`status_synced`) بيتبعتوا في جسم نفس طلب السحب. نفس نمط `online_orders`.
 *
 * ⚠️ **الديسكتوب هو المرجع النهائي للتعارض**: الويب بيمنع الحجز المتداخل وقت الطلب،
 * بس ممكن حجزين يوصلوا في نفس اللحظة أو الموظف يبدأ جلسة يدوي. `confirm()` بيفحص
 * التعارض تاني جوّه ترانزاكشن قبل ما يأكّد.
 */
export class RoomBookingsRepository extends BaseRepository {
  private businessDayStart(): number {
    const row = this.db
      .prepare("SELECT business_day_start AS v FROM settings WHERE id = 1")
      .get() as { v: number } | undefined;
    return row?.v ?? 0;
  }

  private toDTO(row: BookingRow): BookingDTO {
    const known: BookingStatus[] = [
      "new",
      "confirmed",
      "rejected",
      "converted",
      "no_show",
      "cancelled",
    ];
    return {
      id: row.id,
      local_id: row.local_id,
      // حالة مش معروفة (نسخة ويب أحدث) بتترسم «جديد» بدل ما الشاشة تفضى
      status: (known.includes(row.status as BookingStatus) ? row.status : "new") as BookingStatus,
      kind: "table",
      party_size: row.party_size ?? null,
      room_id: row.room_id,
      room_name: row.room_name,
      starts_at: row.starts_at,
      duration_minutes: row.duration_minutes,
      business_date: row.business_date,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone ?? "",
      notes: row.notes,
      confirm_note: row.confirm_note,
      session_id: row.session_id,
      decided_by_name: row.decided_by_name,
      decided_at: row.decided_at,
      decision_reason: row.decision_reason,
      web_created_at: row.web_created_at,
    };
  }

  private getRow(id: number): BookingRow | undefined {
    return this.db.prepare("SELECT * FROM room_bookings WHERE id = ?").get(id) as
      | BookingRow
      | undefined;
  }

  getById(id: number): BookingDTO | null {
    const row = this.getRow(id);
    return row ? this.toDTO(row) : null;
  }

  // ===== السحب =====

  /** إدخال الحجوزات المسحوبة (idempotent عبر local_id) — بيرجّع عدد الجديد */
  upsertPulled(list: PulledBooking[]): number {
    if (list.length === 0) return 0;
    const start = this.businessDayStart();
    const now = this.now();
    const stmt = this.db.prepare(
      `INSERT INTO room_bookings (
         local_id, status, kind, party_size, room_id, room_desktop_id, room_name, mode, starts_at,
         duration_minutes, business_date, customer_name, customer_phone, notes,
         price_estimate, web_created_at, pulled_at, web_acked, status_synced
       ) VALUES (
         @local_id, 'new', @kind, @party_size, @room_id, @room_desktop_id, @room_name, @mode, @starts_at,
         @duration, @biz, @name, @phone, @notes,
         @price, @web_created_at, @pulled_at, 0, 1
       )
       ON CONFLICT(local_id) DO NOTHING`
    );
    // الغرفة على الديسكتوب: الويب بيبعت `desktop_id` اللي هو نفسه `gaming_rooms.id`
    const roomExists = this.db.prepare(
      "SELECT id FROM gaming_rooms WHERE id = ? AND is_deleted = 0"
    );
    let inserted = 0;
    this.transaction(() => {
      for (const b of list) {
        const startMs = Date.parse(b.starts_at);
        if (!b.local_id || !Number.isFinite(startMs)) continue; // صف بايظ مايوقّفش الباقي
        // حجز الطاولة: مفيش طاولة لحد التأكيد (room_desktop_id = 0 مكان الـNOT NULL بتاع 031)
        // ⚠️ نسخة «كافيه» بس: كل حجز طاولة (الويب مابيبعتش حجز غرف لمحل من غير غرف أصلاً)
        const isTable = true;
        const room = isTable ? undefined : (roomExists.get(b.room_desktop_id) as { id: number } | undefined);
        const partySize = isTable && Number.isInteger(b.party_size) && (b.party_size ?? 0) > 0 ? b.party_size : null;
        const res = stmt.run({
          local_id: b.local_id,
          kind: isTable ? "table" : "room",
          party_size: partySize,
          room_id: room?.id ?? null,
          room_desktop_id: isTable ? 0 : (b.room_desktop_id ?? 0),
          room_name: isTable ? "طاولة" : (b.room_name ?? "غرفة"),
          mode: b.mode === "multi" ? "multi" : "single",
          starts_at: new Date(startMs).toISOString(),
          duration: b.duration_minutes ?? 60,
          // اليوم المحاسبي بيتحسب **محلياً** من ميعاد الحجز — الويب مايعرفش بداية يوم المحل
          biz: businessDateKey(new Date(startMs), start),
          name: b.customer?.name ?? null,
          phone: b.customer?.phone ?? "",
          notes: b.customer?.notes ?? null,
          price: b.price_estimate ?? 0,
          web_created_at: b.created_at ?? null,
          pulled_at: now,
        });
        if (res.changes > 0) inserted++;
      }
    });
    return inserted;
  }

  pendingAckIds(): string[] {
    const rows = this.db
      .prepare("SELECT local_id FROM room_bookings WHERE web_acked = 0")
      .all() as { local_id: string }[];
    return rows.map((r) => r.local_id);
  }

  markAcked(localIds: string[]): void {
    if (localIds.length === 0) return;
    const ph = localIds.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE room_bookings SET web_acked = 1 WHERE local_id IN (${ph})`)
      .run(...localIds);
  }

  /** قرارات لسه مارفعتش للويب */
  pendingDecisions(): BookingDecisionOut[] {
    const rows = this.db
      .prepare(
        `SELECT local_id, status, decision_reason, confirm_note, session_id, kind, room_id, room_name
           FROM room_bookings WHERE status_synced = 0`
      )
      .all() as {
      local_id: string;
      status: string;
      decision_reason: string | null;
      confirm_note: string | null;
      session_id: number | null;
      kind: string;
      room_id: number | null;
      room_name: string;
    }[];
    return rows.map((r) => ({
      local_id: r.local_id,
      status: r.status as BookingStatus,
      reason: r.decision_reason,
      confirm_note: r.confirm_note,
      session_desktop_id: r.session_id,
      // الطاولة اللي اتحددت بتتعرض على الويب — حجز الغرفة الجسم بتاعه زي ما هو بالحرف
      ...(r.kind === "table" && r.room_id != null ? { room_desktop_id: r.room_id, room_name: r.room_name } : {}),
    }));
  }

  markDecisionsSynced(localIds: string[]): void {
    if (localIds.length === 0) return;
    const ph = localIds.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE room_bookings SET status_synced = 1 WHERE local_id IN (${ph})`)
      .run(...localIds);
  }

  // ===== قرارات الموظف =====

  /**
   * حجوزات متأكّدة تانية على نفس الغرفة وقتها متداخل — **الفحص النهائي**.
   * الويب بيمنع المتداخل وقت الطلب، بس حجزين ممكن يوصلوا في نفس اللحظة.
   */
  conflictsFor(id: number): BookingDTO[] {
    const row = this.getRow(id);
    if (!row || row.room_id == null) return [];
    const start = Date.parse(row.starts_at);
    const end = bookingEndsAt(row.starts_at, row.duration_minutes);
    const rows = this.db
      .prepare(
        `SELECT * FROM room_bookings
          WHERE id != ? AND room_id = ? AND status = 'confirmed'`
      )
      .all(id, row.room_id) as BookingRow[];
    return rows
      .filter((r) =>
        overlaps(start, end, Date.parse(r.starts_at), bookingEndsAt(r.starts_at, r.duration_minutes))
      )
      .map((r) => this.toDTO(r));
  }

  private decide(
    id: number,
    status: BookingStatus,
    actor: { id: number; name: string },
    extra: { reason?: string | null; confirmNote?: string | null } = {}
  ): BookingDTO {
    const row = this.getRow(id);
    if (!row) throw new Error("الحجز مش موجود");
    this.db
      .prepare(
        `UPDATE room_bookings
            SET status = @status,
                decided_by = @actor_id,
                decided_by_name = @actor_name,
                decided_at = @now,
                decision_reason = COALESCE(@reason, decision_reason),
                confirm_note = COALESCE(@note, confirm_note),
                status_synced = 0
          WHERE id = @id`
      )
      .run({
        id,
        status,
        actor_id: actor.id,
        actor_name: actor.name,
        now: this.now(),
        reason: extra.reason ?? null,
        note: extra.confirmNote ?? null,
      });
    return this.toDTO(this.getRow(id)!);
  }

  /**
   * تأكيد الحجز — بيرفض لو فيه حجز متأكّد تاني متداخل على نفس المكان.
   * حجز الطاولة لازم `tableId`: الطاولة بتتعيّن **جوّه نفس الترانزاكشن**، فلو فيه تعارض الرفض
   * بيرجّع التعيين ومايسيبش الحجز متعلّق بطاولة غلط.
   */
  confirm(
    id: number,
    actor: { id: number; name: string },
    confirmNote?: string | null,
    tableId?: number | null
  ): BookingDTO {
    return this.transaction(() => {
      let row = this.getRow(id);
      if (!row) throw new Error("الحجز مش موجود");
      if (row.kind === "table") {
        if (tableId == null) throw new Error("اختار الطاولة اللي هتتحجز قبل التأكيد");
        const table = this.db
          .prepare("SELECT id, name, kind FROM gaming_rooms WHERE id = ? AND is_deleted = 0 AND is_active = 1")
          .get(tableId) as { id: number; name: string; kind: string } | undefined;
        if (!table || table.kind !== "table") throw new Error("اختار طاولة موجودة ومفعّلة");
        this.db
          .prepare("UPDATE room_bookings SET room_id = ?, room_desktop_id = ?, room_name = ? WHERE id = ?")
          .run(table.id, table.id, table.name, id);
        row = this.getRow(id)!;
      }
      if (row.room_id == null) {
        throw new Error("الغرفة دي اتشالت — كلّم الزبون وارفض الحجز");
      }
      const clash = this.conflictsFor(id);
      if (clash.length > 0) {
        throw new Error(`فيه حجز متأكّد على ${row.room_name} في نفس الوقت — ارفض واحد فيهم`);
      }
      return this.decide(id, "confirmed", actor, { confirmNote: confirmNote ?? null });
    });
  }

  reject(id: number, actor: { id: number; name: string }, reason: string): BookingDTO {
    const clean = reason.trim();
    if (clean.length < 2) throw new Error("اكتب سبب الرفض");
    return this.decide(id, "rejected", actor, { reason: clean.slice(0, 120) });
  }

  cancel(id: number, actor: { id: number; name: string }, reason: string): BookingDTO {
    const clean = reason.trim();
    if (clean.length < 2) throw new Error("اكتب سبب الإلغاء");
    return this.decide(id, "cancelled", actor, { reason: clean.slice(0, 120) });
  }

  markNoShow(id: number, actor: { id: number; name: string }): BookingDTO {
    return this.decide(id, "no_show", actor);
  }

  /** ربط الحجز بالجلسة اللي اتفتحت منه */
  attachSession(id: number, sessionId: number, actor: { id: number; name: string }): BookingDTO {
    const booking = this.decide(id, "converted", actor);
    this.db.prepare("UPDATE room_bookings SET session_id = ? WHERE id = ?").run(sessionId, id);
    this.db
      .prepare("UPDATE gaming_sessions SET booking_local_id = ? WHERE id = ?")
      .run(booking.local_id, sessionId);
    return this.toDTO(this.getRow(id)!);
  }

  // ===== قوايم العرض =====

  /** حجوزات اليوم المحاسبي + أي حجز فعّال جايّ (اللي الموظف محتاج يرد عليه) */
  listToday(): BookingDTO[] {
    const today = businessDateKey(new Date(), this.businessDayStart());
    const rows = this.db
      .prepare(
        `SELECT * FROM room_bookings
          WHERE business_date = @today OR status = 'new'
          ORDER BY (status = 'new') DESC, starts_at ASC`
      )
      .all({ today }) as BookingRow[];
    return rows.map((r) => this.toDTO(r));
  }

  /** الحجوزات الجايّة في المدى ده (بالأيام) — للتبويب «جاي» */
  listUpcoming(days = 7): BookingDTO[] {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + days * 86_400_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM room_bookings
          WHERE starts_at BETWEEN @from AND @to AND status IN ('new', 'confirmed')
          ORDER BY starts_at ASC`
      )
      .all({ from, to }) as BookingRow[];
    return rows.map((r) => this.toDTO(r));
  }

  /**
   * الحجوزات اللي شاشة الغرف محتاجاها: المتأكّدة القريبة (وكمان المتأخرة اللي لسه
   * الموظف ماقفلهاش). النافذة واسعة شوية عشان التنبيه يظهر من بدري.
   */
  activeForBoard(): BookingDTO[] {
    const from = new Date(Date.now() - 6 * 3_600_000).toISOString();
    const to = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM room_bookings
          WHERE status = 'confirmed' AND starts_at BETWEEN @from AND @to
          ORDER BY starts_at ASC`
      )
      .all({ from, to }) as BookingRow[];
    return rows.map((r) => this.toDTO(r));
  }

  listForDate(date: string): BookingDTO[] {
    const rows = this.db
      .prepare("SELECT * FROM room_bookings WHERE business_date = ? ORDER BY starts_at ASC")
      .all(date) as BookingRow[];
    return rows.map((r) => this.toDTO(r));
  }

  /** عدد اللي محتاج رد (بادج التنقّل) */
  pendingCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM room_bookings WHERE status = 'new'")
      .get() as { n: number };
    return row.n;
  }

  /**
   * حجوزات وصل ميعادها ولسه مااتنبّهش عليها — للمراقب الدوري.
   * العلم في الداتابيز عشان التنبيه مايتكررش مع كل إعادة تشغيل للبرنامج.
   */
  dueForAlert(): BookingDTO[] {
    const now = new Date().toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM room_bookings
          WHERE status = 'confirmed' AND alerted = 0 AND starts_at <= @now
          ORDER BY starts_at ASC`
      )
      .all({ now }) as BookingRow[];
    return rows.map((r) => this.toDTO(r));
  }

  markAlerted(ids: number[]): void {
    if (ids.length === 0) return;
    const ph = ids.map(() => "?").join(",");
    this.db.prepare(`UPDATE room_bookings SET alerted = 1 WHERE id IN (${ph})`).run(...ids);
  }

  /** أيام الأرشيف (تاريخ + عدد) */
  archiveDays(): { date: string; count: number }[] {
    const today = businessDateKey(new Date(), this.businessDayStart());
    const from = shiftDateKey(today, -ARCHIVE_DAYS);
    return this.db
      .prepare(
        `SELECT business_date AS date, COUNT(*) AS count
           FROM room_bookings
          WHERE business_date BETWEEN @from AND @today
          GROUP BY business_date
          ORDER BY business_date DESC`
      )
      .all({ from, today }) as { date: string; count: number }[];
  }

  /** تنضيف الحجوزات القديمة — الجدول صندوق بريد مش أرشيف دائم */
  purgeOld(): number {
    const today = businessDateKey(new Date(), this.businessDayStart());
    const cutoff = shiftDateKey(today, -ARCHIVE_DAYS);
    const res = this.db
      .prepare(
        `DELETE FROM room_bookings
          WHERE business_date < @cutoff AND status_synced = 1 AND web_acked = 1`
      )
      .run({ cutoff });
    return res.changes;
  }

  /** الحالات اللي لسه واخدة وقت من الغرفة — للاستخدام في الفحوص */
  static activeStatuses(): BookingStatus[] {
    return [...BOOKING_ACTIVE_STATUSES];
  }
}

export const roomBookingsRepository = new RoomBookingsRepository();
