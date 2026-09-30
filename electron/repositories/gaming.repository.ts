import { BaseRepository } from "./base.repository";
import { ordersRepository } from "./orders.repository";
import { sizesRepository } from "./sizes.repository";
import { customersRepository } from "./customers.repository";
import { assertPositive } from "../../shared/validation";
import { computeTotals, type CreateOrderResult } from "../../shared/orders";
import {
  formatSessionNumber,
  MAX_AREA_LENGTH,
  TABLE_SESSION_SOURCE,
  tableElapsedMinutes,
  type RoomKind,
  type SplitCheckoutInput,
  type GamingRoomDTO,
  type GamingSessionDTO,
  type GamingSessionStatus,
  type GamingBoard,
  type GamingTodaySummary,
  type SaveRoomInput,
  type SessionItemDTO,
  type SessionQuote,
  type OpenSessionInput,
  type AddSessionItemInput,
  type CheckoutSessionInput,
} from "../../shared/gaming";

interface RoomRow {
  id: number;
  local_id: string;
  kind: string;
  area: string | null;
  name: string;
  is_active: number;
  sort_order: number;
  is_deleted: number;
  created_at: string;
  updated_at: string | null;
}

interface SessionRow {
  id: number;
  local_id: string;
  kind: string;
  merged_into_id: number | null;
  session_number: number;
  room_id: number;
  room_name: string;
  status: GamingSessionStatus;
  started_at: string;
  ended_at: string | null;
  customer_id: number | null;
  customer_name: string | null;
  opened_by: number | null;
  opened_by_name: string | null;
  closed_by: number | null;
  closed_by_name: string | null;
  order_id: number | null;
  actual_minutes: number;
  cancel_reason: string | null;
  notes: string | null;
  business_date: string;
  created_at: string;
  updated_at: string | null;
  /** عدّاد دفعات المطبخ — التذكرة بتقول «دفعة ٢» */
  kitchen_batches: number;
  staff_id: number | null;
  staff_name: string | null;
}

interface ItemRow {
  id: number;
  session_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  modifier_option_ids: string;
  notes: string | null;
  variant_id: number | null;
  /** الكمية اللي راحت للمطبخ من البند ده — المعلّق = quantity - sent_qty */
  sent_qty: number;
  staff_id: number | null;
  staff_name: string | null;
}

export interface Actor {
  id: number;
  name: string;
}

export interface CheckoutSessionResult extends CreateOrderResult {
  session: GamingSessionDTO;
}

/** نوع كل مكان بيتكتب في النسخة دي */
const TABLE: RoomKind = "table";

// تاريخ اليوم التجاري YYYY-MM-DD حسب ساعة البداية (نفس منطق الطلبات بالظبط)
function toBusinessDate(date: Date, startHour: number): string {
  const x = new Date(date);
  if (x.getHours() < startHour) x.setDate(x.getDate() - 1);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isUniqueOpenViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("UNIQUE") && msg.includes("gaming_sessions");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ===== الطاولات (نسخة «كافيه» بس) =====
// الطاولة = صف في `gaming_rooms` بـ`kind = 'table'`، وحسابها = `gaming_sessions` بـ`kind = 'table'`
// (الجداول متوارثة ومابتتغيّرش عشان عقد المزامنة). **مفيش غرف ولا تسعير وقت** في النسخة دي.
// القاعدة الحاكمة: **الفلوس في الفاتورة مش في الحساب.** القفل بيعمل فاتورة عادية عبر
// `ordersRepository.create` (source = table_session) فالمالية والدرج والإيصال والمزامنة وخصم المخزون
// شغّالين بلا أي منطق مالي جديد.
export class GamingRepository extends BaseRepository {
  private settings(): { businessDayStart: number; taxRate: number } {
    const row = this.db.prepare("SELECT business_day_start, tax_rate FROM settings WHERE id = 1").get() as
      | { business_day_start: number | null; tax_rate: number | null }
      | undefined;
    return { businessDayStart: row?.business_day_start ?? 0, taxRate: row?.tax_rate ?? 0 };
  }

  // ===================== الطاولات =====================

  private roomRow(id: number): RoomRow | null {
    const r = this.db.prepare("SELECT * FROM gaming_rooms WHERE id = ? AND is_deleted = 0").get(id) as
      | RoomRow
      | undefined;
    return r ?? null;
  }

  private roomDTO(r: RoomRow): GamingRoomDTO {
    return {
      id: r.id,
      local_id: r.local_id,
      kind: TABLE,
      area: r.area ?? null,
      name: r.name,
      is_active: r.is_active === 1,
      sort_order: r.sort_order,
    };
  }

  // payload المزامنة — نفس شكل gaming_room بالحرف (SYNC-CONTRACT §5.21/§5.23): الطاولة سعرها صفر
  private roomPayload(r: RoomRow) {
    return {
      id: r.id,
      local_id: r.local_id,
      name: r.name,
      device_label: null,
      rate_single: 0,
      rate_multi: 0,
      is_active: r.is_active === 1,
      sort_order: r.sort_order,
      kind: TABLE,
      area: r.area ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  private hasOpenSession(roomId: number): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM gaming_sessions WHERE room_id = ? AND status = 'open' LIMIT 1")
      .get(roomId);
  }

  listRooms(includeInactive = false): GamingRoomDTO[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM gaming_rooms WHERE is_deleted = 0 AND kind = 'table' ${includeInactive ? "" : "AND is_active = 1"}
         ORDER BY sort_order ASC, name ASC`
      )
      .all() as RoomRow[];
    return rows.map((r) => this.roomDTO(r));
  }

  getRoom(id: number): GamingRoomDTO | null {
    const r = this.roomRow(id);
    return r && r.kind === TABLE ? this.roomDTO(r) : null;
  }

  saveRoom(input: SaveRoomInput, actorId: number | null): { room: GamingRoomDTO; before: GamingRoomDTO | null } {
    const name = (input.name ?? "").trim();
    if (!name) throw new Error("اسم الطاولة مطلوب");
    const area = (input.area ?? "").trim().slice(0, MAX_AREA_LENGTH) || null;

    const dup = this.db
      .prepare("SELECT id FROM gaming_rooms WHERE is_deleted = 0 AND lower(name) = lower(?) AND id <> ?")
      .get(name, input.id ?? -1);
    if (dup) throw new Error("فيه طاولة تانية بنفس الاسم");

    const now = this.now();
    return this.transaction(() => {
      if (input.id != null) {
        const existing = this.roomRow(input.id);
        if (!existing || existing.kind !== TABLE) throw new Error("الطاولة غير موجودة");
        const deactivating = input.is_active === false && existing.is_active === 1;
        if (deactivating && this.hasOpenSession(existing.id)) {
          throw new Error("الطاولة عليها حساب مفتوح — اقفله الأول قبل إيقاف الطاولة");
        }
        this.db
          .prepare(
            `UPDATE gaming_rooms SET name = @name, area = @area, is_active = @active, sort_order = @sort,
               updated_at = @now, updated_by = @actor, sync_status = 'pending'
             WHERE id = @id`
          )
          .run({
            id: existing.id,
            name,
            area,
            active: input.is_active === false ? 0 : 1,
            sort: input.sort_order ?? existing.sort_order,
            now,
            actor: actorId,
          });
        const row = this.roomRow(existing.id)!;
        this.enqueue("gaming_room", "UPDATED", row.local_id, this.roomPayload(row));
        return { room: this.roomDTO(row), before: this.roomDTO(existing) };
      }

      const maxSort = (
        this.db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM gaming_rooms").get() as { m: number }
      ).m;
      const localId = this.newLocalId();
      // ⚠️ النوع `table` دايماً — النسخة دي مابتعملش غرف (الحارس verify-cafe-no-rooms)
      const kind = "table";
      const res = this.db
        .prepare(
          `INSERT INTO gaming_rooms (local_id, kind, area, name, device_label, rate_single, rate_multi, is_active, sort_order,
             created_at, updated_at, created_by, updated_by, sync_status)
           VALUES (@local_id, @kind, @area, @name, NULL, 0, 0, @active, @sort, @now, @now, @actor, @actor, 'pending')`
        )
        .run({
          local_id: localId,
          kind,
          area,
          name,
          active: input.is_active === false ? 0 : 1,
          sort: input.sort_order ?? maxSort + 1,
          now,
          actor: actorId,
        });
      const row = this.roomRow(Number(res.lastInsertRowid))!;
      this.enqueue("gaming_room", "CREATED", row.local_id, this.roomPayload(row));
      return { room: this.roomDTO(row), before: null };
    });
  }

  deleteRoom(id: number, actorId: number | null): GamingRoomDTO {
    const existing = this.roomRow(id);
    if (!existing) throw new Error("الطاولة غير موجودة");
    if (this.hasOpenSession(id)) throw new Error("الطاولة عليها حساب مفتوح — اقفله الأول");
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE gaming_rooms SET is_deleted = 1, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, now: this.now(), actor: actorId });
      this.enqueue("gaming_room", "DELETED", existing.local_id, { local_id: existing.local_id });
      return this.roomDTO(existing);
    });
  }

  // ===================== الحسابات =====================

  private sessionRow(id: number): SessionRow | null {
    const r = this.db.prepare("SELECT * FROM gaming_sessions WHERE id = ? AND is_deleted = 0").get(id) as
      | SessionRow
      | undefined;
    return r ?? null;
  }

  private openSessionRow(id: number): SessionRow {
    const s = this.sessionRow(id);
    if (!s) throw new Error("الحساب غير موجود");
    if (s.status !== "open") {
      throw new Error(
        s.status === "closed"
          ? "الحساب اتحاسب قبل كده"
          : s.status === "merged"
            ? "الحساب ده اتدمج في طاولة تانية"
            : "الحساب ملغي"
      );
    }
    return s;
  }

  /**
   * الحلاق/الأخصائي — لازم يكون موجود وفعّال ودوره بيشتغل على العملاء.
   * ⚠️ التحقق في الريبو مش في الواجهة بس: العمولة بتتحسب من الرقم ده، فرقم
   * مستخدم محذوف أو موقوف معناه عمولة معلّقة في الهوا.
   */
  private staffRow(staffId: number): { id: number; name: string } {
    const row = this.db
      .prepare("SELECT id, name, is_active FROM users WHERE id = ? AND is_deleted = 0")
      .get(staffId) as { id: number; name: string; is_active: number } | undefined;
    if (!row) throw new Error("الموظف غير موجود");
    if (row.is_active !== 1) throw new Error(`${row.name} موقوف — اختار حد تاني`);
    return { id: row.id, name: row.name };
  }

  private loadItemRows(sessionId: number): ItemRow[] {
    return this.db
      .prepare(
        `SELECT id, session_id, product_id, product_name, quantity, modifier_option_ids, notes, variant_id, sent_qty,
                staff_id, staff_name
         FROM gaming_session_items WHERE session_id = ? ORDER BY id ASC`
      )
      .all(sessionId) as ItemRow[];
  }

  private parseOptionIds(raw: string): string[] {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  private itemDTO(r: ItemRow): SessionItemDTO {
    return {
      id: r.id,
      product_id: r.product_id,
      product_name: r.product_name,
      quantity: r.quantity,
      modifier_option_ids: this.parseOptionIds(r.modifier_option_ids),
      notes: r.notes,
      variant_id: r.variant_id ?? null,
      variant_size: r.variant_id ? (sizesRepository.getById(r.variant_id)?.size ?? null) : null,
      sent_qty: r.sent_qty ?? 0,
      staff_id: r.staff_id ?? null,
      staff_name: r.staff_name ?? null,
    };
  }

  /** بنود الحساب بصيغة الفاتورة */
  private orderItems(items: SessionItemDTO[]) {
    return items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      modifier_option_ids: i.modifier_option_ids,
      notes: i.notes ?? undefined,
      variant_id: i.variant_id,
    }));
  }

  // مجموع الطلبات بتسعير الفاتورة نفسه — بند مش متاح دلوقتي بيتجاهل في العرض بس
  // (الحساب هيرفضه بصوت عالي، مش هيعدّيه بسعر قديم)
  private itemsSubtotal(items: SessionItemDTO[]): number {
    let sum = 0;
    for (const it of items) {
      try {
        sum += ordersRepository.calculateTotals({
          items: this.orderItems([it]),
          discount_type: "none",
          discount_value: 0,
        }).subtotal;
      } catch {
        /* منتج اتشال/نفد — بيبان وقت الحساب */
      }
    }
    return sum;
  }

  private toDTO(r: SessionRow): GamingSessionDTO {
    const items = this.loadItemRows(r.id).map((i) => this.itemDTO(i));
    return {
      id: r.id,
      local_id: r.local_id,
      kind: TABLE,
      session_number: r.session_number,
      session_label: formatSessionNumber(r.session_number),
      kitchen_batches: r.kitchen_batches ?? 0,
      staff_id: r.staff_id ?? null,
      staff_name: r.staff_name ?? null,
      merged_into_id: r.merged_into_id ?? null,
      room_id: r.room_id,
      room_name: r.room_name,
      status: r.status,
      started_at: r.started_at,
      ended_at: r.ended_at,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      opened_by: r.opened_by,
      opened_by_name: r.opened_by_name,
      closed_by: r.closed_by,
      closed_by_name: r.closed_by_name,
      order_id: r.order_id,
      actual_minutes: r.actual_minutes,
      cancel_reason: r.cancel_reason,
      notes: r.notes,
      business_date: r.business_date,
      items,
      items_subtotal: r.status === "open" ? this.itemsSubtotal(items) : 0,
    };
  }

  // payload المزامنة — نفس شكل gaming_session بالحرف (SYNC-CONTRACT §5.22/§5.23):
  // الطاولة من غير وقت محسوب ولا فترات. الطلبات مابتتبعتش — بتوصل جوّه الفاتورة.
  private syncPayload(id: number): Record<string, unknown> | null {
    const r = this.sessionRow(id);
    if (!r) return null;
    const itemsCount = (
      this.db
        .prepare("SELECT COALESCE(SUM(quantity), 0) AS c FROM gaming_session_items WHERE session_id = ?")
        .get(id) as { c: number }
    ).c;
    return {
      id: r.id,
      local_id: r.local_id,
      kind: TABLE,
      merged_into_id: r.merged_into_id ?? null,
      session_number: r.session_number,
      room_id: r.room_id,
      room_name: r.room_name,
      status: r.status,
      started_at: r.started_at,
      ended_at: r.ended_at,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      opened_by: r.opened_by,
      opened_by_name: r.opened_by_name,
      closed_by: r.closed_by,
      closed_by_name: r.closed_by_name,
      order_id: r.order_id,
      actual_minutes: r.actual_minutes,
      billed_minutes: 0,
      time_amount: 0,
      items_count: itemsCount,
      planned_minutes: null,
      cancel_reason: r.cancel_reason,
      notes: r.notes,
      segments: [],
      business_date: r.business_date,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  private enqueueSession(id: number, event: "CREATED" | "UPDATED"): void {
    const payload = this.syncPayload(id);
    if (payload) this.enqueue("gaming_session", event, String(payload.local_id), payload);
  }

  getSession(id: number): GamingSessionDTO | null {
    const r = this.sessionRow(id);
    return r ? this.toDTO(r) : null;
  }

  getBoard(): GamingBoard {
    const open = this.db
      .prepare("SELECT * FROM gaming_sessions WHERE status = 'open' AND is_deleted = 0 ORDER BY started_at ASC")
      .all() as SessionRow[];
    return { tables: this.listRooms(false), sessions: open.map((s) => this.toDTO(s)) };
  }

  todaySummary(): GamingTodaySummary {
    const { businessDayStart } = this.settings();
    const bd = toBusinessDate(new Date(), businessDayStart);
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
           SUM(CASE WHEN status = 'closed' AND business_date = @bd THEN 1 ELSE 0 END) AS closed_count,
           SUM(CASE WHEN status = 'cancelled' AND business_date = @bd THEN 1 ELSE 0 END) AS cancelled_count
         FROM gaming_sessions WHERE is_deleted = 0`
      )
      .get({ bd }) as { open_count: number | null; closed_count: number | null; cancelled_count: number | null };
    // أعداد بس — مفيش فلوس: الشاشة دي قدّام الزباين، والإيراد مكانه التقارير
    return {
      business_date: bd,
      open_count: row.open_count ?? 0,
      closed_count: row.closed_count ?? 0,
      cancelled_count: row.cancelled_count ?? 0,
    };
  }

  openSession(input: OpenSessionInput, actor: Actor): GamingSessionDTO {
    const room = this.roomRow(input.room_id);
    if (!room || room.is_active !== 1) throw new Error("الكرسي مش موجود أو متوقف");
    if (room.kind !== TABLE) throw new Error("النسخة دي للتجميل — افتح الجلسة على كرسي");

    // ⚠️ **الحلاق إجباري.** عليه بتتحسب عمولته، فجلسة بلا حلاق = فلوس مش معروف
    // صاحبها. وده **مش** `opened_by` (الكاشير بيفتح والحلاق بيشتغل).
    const staff = this.staffRow(input.staff_id);

    const customerName =
      input.customer_id != null ? (customersRepository.getById(input.customer_id)?.name ?? null) : null;
    const { businessDayStart } = this.settings();
    const now = this.now();

    try {
      return this.transaction(() => {
        const next = (
          this.db.prepare("SELECT COALESCE(MAX(session_number), 0) + 1 AS n FROM gaming_sessions").get() as { n: number }
        ).n;
        const res = this.db
          .prepare(
            `INSERT INTO gaming_sessions (local_id, kind, session_number, room_id, room_name, status, started_at,
               customer_id, customer_name, opened_by, opened_by_name, staff_id, staff_name,
               notes, business_date, created_at, updated_at, sync_status)
             VALUES (@local_id, 'table', @n, @room_id, @room_name, 'open', @now, @customer_id, @customer_name,
               @actor_id, @actor_name, @staff_id, @staff_name, @notes, @bd, @now, @now, 'pending')`
          )
          .run({
            local_id: this.newLocalId(),
            n: next,
            room_id: room.id,
            room_name: room.name,
            now,
            customer_id: input.customer_id ?? null,
            customer_name: customerName,
            actor_id: actor.id,
            actor_name: actor.name,
            staff_id: staff.id,
            staff_name: staff.name,
            notes: input.notes?.trim() || null,
            bd: toBusinessDate(new Date(now), businessDayStart),
          });
        const id = Number(res.lastInsertRowid);
        this.enqueueSession(id, "CREATED");
        return this.toDTO(this.sessionRow(id)!);
      });
    } catch (e) {
      // الحارس الحقيقي الفهرس الفريد — نقرتين في نفس اللحظة مايفتحوش حسابين
      if (isUniqueOpenViolation(e)) throw new Error(`${room.name} عليها حساب شغّال بالفعل`);
      throw e;
    }
  }

  // العميل على حساب مفتوح (اختياري — ينفع يتحدد بعد الفتح أو يتغيّر لحد الحساب)
  setCustomer(sessionId: number, customerId: number | null): GamingSessionDTO {
    this.openSessionRow(sessionId);
    let name: string | null = null;
    if (customerId != null) {
      const c = customersRepository.getById(customerId);
      if (!c) throw new Error("العميل غير موجود");
      name = c.name;
    }
    const now = this.now();
    return this.transaction(() => {
      this.db
        .prepare(
          "UPDATE gaming_sessions SET customer_id = ?, customer_name = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?"
        )
        .run(customerId, name, now, sessionId);
      this.enqueueSession(sessionId, "UPDATED");
      return this.toDTO(this.sessionRow(sessionId)!);
    });
  }

  // تحقق بند بنفس تسعير الفاتورة (منتج موجود · مفعّل · متاح · خياراته المطلوبة)
  private validateItem(
    productId: number,
    quantity: number,
    optionIds: string[],
    notes: string | null,
    variantId?: number | null
  ): void {
    assertPositive(quantity, "الكمية");
    ordersRepository.calculateTotals({
      items: [
        {
          product_id: productId,
          quantity,
          modifier_option_ids: optionIds,
          notes: notes ?? undefined,
          variant_id: variantId ?? null,
        },
      ],
      discount_type: "none",
      discount_value: 0,
    });
  }

  addItem(input: AddSessionItemInput, actor: Actor): GamingSessionDTO {
    this.openSessionRow(input.session_id);
    const optionIds = [...(input.modifier_option_ids ?? [])].map(String).sort();
    const notes = input.notes?.trim() || null;
    const variantId = input.variant_id ?? null;
    this.validateItem(input.product_id, input.quantity, optionIds, notes, variantId);

    // ⚠️ **الخدمة بتورث الحلاق الأساسي** لو الموظف مااختارش حد. بيتحدد صراحةً بس
    // لما حلاق تاني يعمل خدمة في نفس القعدة (سماح الصبغة ومنى الاستشوار) — وده
    // اللي بيخلّي العمولة دقيقة ١٠٠٪ بلمسة واحدة في الغالب.
    const sessionRow = this.sessionRow(input.session_id)!;
    const itemStaff =
      input.staff_id != null
        ? this.staffRow(input.staff_id)
        : sessionRow.staff_id != null
          ? { id: sessionRow.staff_id, name: sessionRow.staff_name ?? "" }
          : null;

    const product = this.db.prepare("SELECT name FROM products WHERE id = ?").get(input.product_id) as
      | { name: string }
      | undefined;
    const optionsJson = JSON.stringify(optionIds);

    return this.transaction(() => {
      // ⚠️ الحجم جزء من مفتاح التجميع: من غيره «بيتزا سمول» و«بيتزا لارج» على نفس
      // الطاولة كانوا بيتلمّوا في بند واحد بسعر واحد.
      // ⚠️ الحلاق جزء من مفتاح التجميع: نفس الخدمة بحلاقين مختلفين = **بندين**،
      // وإلا العمولة بتروح كلها لواحد منهم.
      const existing = this.db
        .prepare(
          `SELECT id, quantity FROM gaming_session_items
           WHERE session_id = ? AND product_id = ? AND modifier_option_ids = ? AND COALESCE(notes, '') = ?
             AND COALESCE(variant_id, 0) = ? AND COALESCE(staff_id, 0) = ?`
        )
        .get(
          input.session_id,
          input.product_id,
          optionsJson,
          notes ?? "",
          variantId ?? 0,
          itemStaff?.id ?? 0
        ) as { id: number; quantity: number } | undefined;
      if (existing) {
        const qty = existing.quantity + input.quantity;
        this.validateItem(input.product_id, qty, optionIds, notes, variantId);
        this.db.prepare("UPDATE gaming_session_items SET quantity = ? WHERE id = ?").run(qty, existing.id);
      } else {
        this.db
          .prepare(
            `INSERT INTO gaming_session_items (local_id, session_id, product_id, product_name, quantity,
               modifier_option_ids, notes, variant_id, staff_id, staff_name, added_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            this.newLocalId(),
            input.session_id,
            input.product_id,
            product?.name ?? "منتج",
            input.quantity,
            optionsJson,
            notes,
            variantId,
            itemStaff?.id ?? null,
            itemStaff?.name ?? null,
            actor.id,
            this.now()
          );
      }
      return this.toDTO(this.sessionRow(input.session_id)!);
    });
  }

  updateItemQuantity(itemId: number, quantity: number): GamingSessionDTO {
    const item = this.db.prepare("SELECT * FROM gaming_session_items WHERE id = ?").get(itemId) as ItemRow | undefined;
    if (!item) throw new Error("البند غير موجود");
    this.openSessionRow(item.session_id);
    if (!(quantity > 0)) {
      this.db.prepare("DELETE FROM gaming_session_items WHERE id = ?").run(itemId);
    } else {
      this.validateItem(
        item.product_id,
        quantity,
        this.parseOptionIds(item.modifier_option_ids),
        item.notes,
        item.variant_id
      );
      // ⚠️ `sent_qty` بيتقصّر للكمية الجديدة لو بقت أقل: النادل ممكن يقلّل بند
      // راح للمطبخ خلاص (الزبون غيّر رأيه). من غير التقصير المعلّق بيبقى **سالب**
      // والدفعة الجاية تتلخبط. (الواجهة بتسأله تأكيد قبل كده.)
      this.db
        .prepare(
          "UPDATE gaming_session_items SET quantity = @q, sent_qty = MIN(sent_qty, @q) WHERE id = @id"
        )
        .run({ q: quantity, id: itemId });
    }
    return this.toDTO(this.sessionRow(item.session_id)!);
  }


  removeItem(itemId: number): GamingSessionDTO {
    return this.updateItemQuantity(itemId, 0);
  }

  quote(sessionId: number, discountType: "none" | "percentage" | "fixed" = "none", discountValue = 0): SessionQuote {
    const s = this.openSessionRow(sessionId);
    const at = this.now();
    const items = this.loadItemRows(sessionId).map((i) => this.itemDTO(i));
    // ⚠️ هنا بيرمي لو صنف نفد — أحسن الموظف يعرف قبل ما يقبض من الزبون
    const itemsSubtotal = items.length
      ? ordersRepository.calculateTotals({ items: this.orderItems(items), discount_type: "none", discount_value: 0 })
          .subtotal
      : 0;
    const totals = computeTotals(itemsSubtotal, discountType, discountValue, this.settings().taxRate);
    return {
      at,
      actual_minutes: tableElapsedMinutes(s.started_at, at),
      items_subtotal: itemsSubtotal,
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_rate: totals.tax_rate,
      tax_amount: totals.tax_amount,
      total: totals.total,
    };
  }

  /**
   * فاتورة حساب الطاولة — نفس مسار الفاتورة بالحرف. `session_id` بيربط **كل** فواتير الحساب
   * (تقسيم الفاتورة بيطلّع أكتر من فاتورة للحساب الواحد).
   */
  private createSessionOrder(
    s: SessionRow,
    items: SessionItemDTO[],
    input: CheckoutSessionInput,
    customerId: number | null,
    actor: Actor
  ): CreateOrderResult {
    const isFree = input.is_free === true;
    const orderItems = this.orderItems(items);
    // ⚠️ **العمولة**: لقطة «مين عمل إيه» بتتحوّل لـ`order_sellers` مع الفاتورة.
    // نصيب كل واحد = **مجموع أسعار بنوده بالظبط** — مش تقسيم بالفئات ولا بالتساوي.
    // (نسخة التجزئة بتسند لكل البائعين الحاضرين؛ هنا الإسناد **صريح** فأدق منها.)
    const staffShares = this.staffShares(items);
    // غير الكاش: المدفوع = الإجمالي بالظبط (مفيش «باقي» في الكارت/المحفظة)
    let amountPaid = input.amount_paid;
    if (!isFree && input.payment_method !== "cash") {
      const subtotal = ordersRepository.calculateTotals({ items: orderItems, discount_type: "none", discount_value: 0 })
        .subtotal;
      amountPaid = computeTotals(subtotal, input.discount_type, input.discount_value, this.settings().taxRate).total;
    }
    return ordersRepository.create(
      {
        items: orderItems,
        customer_id: customerId,
        is_guest: customerId == null,
        order_type: "counter",
        discount_type: input.discount_type,
        discount_value: input.discount_value,
        payment_method: input.payment_method,
        amount_paid: amountPaid,
        is_free: isFree,
        free_recipient_type: isFree ? (input.free_recipient_type ?? null) : null,
        free_recipient_id: isFree ? (input.free_recipient_id ?? null) : null,
        free_recipient_name: isFree ? (input.free_recipient_name ?? null) : null,
        notes: input.notes?.trim() || `${formatSessionNumber(s.session_number)} — ${s.room_name}`,
        source: TABLE_SESSION_SOURCE,
        session_id: s.id,
        sellers: staffShares,
      },
      actor.id,
      actor.name
    );
  }

  /**
   * نصيب كل حلاق من الجلسة = مجموع أسعار بنوده.
   * التسعير بيتحسب من `calculateTotals` (سيرفر-سايد) عشان يطابق الفاتورة بالحرف —
   * ممنوع الواجهة تحسب نصيب موازي.
   */
  private staffShares(items: SessionItemDTO[]): { id: number; name: string; amount: number }[] {
    const by = new Map<number, { id: number; name: string; amount: number }>();
    for (const it of items) {
      if (it.staff_id == null) continue;
      let amount = 0;
      try {
        amount = ordersRepository.calculateTotals({
          items: this.orderItems([it]),
          discount_type: "none",
          discount_value: 0,
        }).subtotal;
      } catch {
        /* صنف اتشال/نفد — بيبان وقت الحساب */
      }
      const cur = by.get(it.staff_id);
      if (cur) cur.amount = round2(cur.amount + amount);
      else by.set(it.staff_id, { id: it.staff_id, name: it.staff_name ?? "—", amount: round2(amount) });
    }
    return [...by.values()];
  }

  private closeSession(s: SessionRow, at: string, actor: Actor, orderId: number, customerId: number | null): void {
    const customerName =
      customerId != null ? (customersRepository.getById(customerId)?.name ?? s.customer_name) : null;
    this.db
      .prepare(
        `UPDATE gaming_sessions SET status = 'closed', ended_at = @at, closed_by = @actor_id, closed_by_name = @actor_name,
           order_id = @order_id, actual_minutes = @actual, billed_minutes = 0, time_amount = 0,
           customer_id = @customer_id, customer_name = @customer_name, updated_at = @at, sync_status = 'pending'
         WHERE id = @id`
      )
      .run({
        id: s.id,
        at,
        actor_id: actor.id,
        actor_name: actor.name,
        order_id: orderId,
        actual: round2(tableElapsedMinutes(s.started_at, at)),
        customer_id: customerId,
        customer_name: customerName,
      });
    this.enqueueSession(s.id, "UPDATED");
  }

  // ===== الحساب = الحدث المالي الوحيد =====
  checkout(input: CheckoutSessionInput, actor: Actor): CheckoutSessionResult {
    const s = this.openSessionRow(input.session_id);
    const at = this.now();
    return this.transaction(() => {
      const items = this.loadItemRows(s.id).map((i) => this.itemDTO(i));
      if (!items.length) throw new Error("الحساب مالوش طلبات — لو اتفتح بالغلط استخدم الإلغاء");
      const customerId = input.customer_id ?? s.customer_id ?? null;
      const result = this.createSessionOrder(s, items, input, customerId, actor);
      this.closeSession(s, at, actor, result.order.id, customerId);
      return { ...result, session: this.toDTO(this.sessionRow(s.id)!) };
    });
  }

  // ===================== نقل · دمج · تقسيم =====================

  /** نقل الحساب بطلباته لطاولة فاضية (الزباين غيّروا مكانهم) */
  transferSession(sessionId: number, toRoomId: number): GamingSessionDTO {
    const s = this.openSessionRow(sessionId);
    const target = this.roomRow(toRoomId);
    if (!target || target.is_active !== 1 || target.kind !== TABLE) throw new Error("الطاولة مش موجودة أو متوقفة");
    if (target.id === s.room_id) throw new Error("الحساب على الطاولة دي بالفعل");
    if (this.hasOpenSession(target.id)) throw new Error(`${target.name} عليها حساب مفتوح — استخدم الدمج لو هيقعدوا مع بعض`);
    const now = this.now();
    try {
      return this.transaction(() => {
        this.db
          .prepare("UPDATE gaming_sessions SET room_id = ?, room_name = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?")
          .run(target.id, target.name, now, s.id);
        this.enqueueSession(s.id, "UPDATED");
        return this.toDTO(this.sessionRow(s.id)!);
      });
    } catch (e) {
      // نقرتين في نفس اللحظة: الفهرس الفريد هو الحارس الحقيقي
      if (isUniqueOpenViolation(e)) throw new Error(`${target.name} عليها حساب مفتوح`);
      throw e;
    }
  }

  /**
   * دمج حساب طاولة في حساب طاولة تانية: البنود بتتنقل (والمتشابه بيتجمع في بند واحد)،
   * والحساب اللي اتدمج بيبقى `merged` — **مش ملغي**: الطلبات هتتحاسب في الحساب التاني.
   */
  mergeSessions(fromId: number, intoId: number, actor?: Actor): GamingSessionDTO {
    if (fromId === intoId) throw new Error("مينفعش تدمج الحساب في نفسه");
    const from = this.openSessionRow(fromId);
    const into = this.openSessionRow(intoId);
    const now = this.now();
    return this.transaction(() => {
      for (const it of this.loadItemRows(from.id)) {
        const same = this.db
          .prepare(
            `SELECT id, quantity FROM gaming_session_items
             WHERE session_id = ? AND product_id = ? AND modifier_option_ids = ? AND COALESCE(notes, '') = ?
               AND COALESCE(variant_id, 0) = ?`
          )
          .get(into.id, it.product_id, it.modifier_option_ids, it.notes ?? "", it.variant_id ?? 0) as
          | { id: number; quantity: number }
          | undefined;
        if (same) {
          // ⚠️ `sent_qty` بيتجمع زي الكمية: من غير كده دمج طاولتين بيخلّي أصناف
          // **راحت للمطبخ خلاص** تبان معلّقة وتتطبع تاني في الدفعة الجاية.
          this.db
            .prepare(
              "UPDATE gaming_session_items SET quantity = @q, sent_qty = sent_qty + @sent WHERE id = @id"
            )
            .run({ q: same.quantity + it.quantity, sent: it.sent_qty ?? 0, id: same.id });
          this.db.prepare("DELETE FROM gaming_session_items WHERE id = ?").run(it.id);
        } else {
          this.db.prepare("UPDATE gaming_session_items SET session_id = ? WHERE id = ?").run(into.id, it.id);
        }
      }
      if (into.customer_id == null && from.customer_id != null) {
        this.db
          .prepare("UPDATE gaming_sessions SET customer_id = ?, customer_name = ? WHERE id = ?")
          .run(from.customer_id, from.customer_name, into.id);
      }
      this.db
        .prepare(
          `UPDATE gaming_sessions SET status = 'merged', merged_into_id = @into, ended_at = @now,
             closed_by = @actor_id, closed_by_name = @actor_name, actual_minutes = @actual,
             updated_at = @now, sync_status = 'pending'
           WHERE id = @id`
        )
        .run({
          id: from.id,
          into: into.id,
          now,
          actor_id: actor?.id ?? null,
          actor_name: actor?.name ?? null,
          actual: round2(tableElapsedMinutes(from.started_at, now)),
        });
      this.db.prepare("UPDATE gaming_sessions SET updated_at = ?, sync_status = 'pending' WHERE id = ?").run(now, into.id);
      this.enqueueSession(from.id, "UPDATED");
      this.enqueueSession(into.id, "UPDATED");
      return this.toDTO(this.sessionRow(into.id)!);
    });
  }

  /** بنود الجزء المختار من الحساب — كل بند لازم يكون على الحساب وبكمية مش أكبر من اللي عليه */
  private pickSplit(s: SessionRow, lines: SplitCheckoutInput["lines"] | undefined) {
    const wanted = new Map<number, number>();
    for (const l of lines ?? []) {
      assertPositive(l.quantity, "الكمية");
      wanted.set(l.item_id, (wanted.get(l.item_id) ?? 0) + l.quantity);
    }
    if (wanted.size === 0) throw new Error("اختار البنود اللي هتتدفع");
    const rows = new Map(this.loadItemRows(s.id).map((r) => [r.id, r]));
    const picked: SessionItemDTO[] = [];
    for (const [itemId, qty] of wanted) {
      const row = rows.get(itemId);
      if (!row) throw new Error("بند مش على الحساب ده");
      if (qty > row.quantity + 1e-9) throw new Error(`${row.product_name}: المطلوب أكتر من اللي على الحساب (${row.quantity})`);
      picked.push({ ...this.itemDTO(row), quantity: qty });
    }
    return { wanted, rows, picked };
  }

  /** عرض جزء من الحساب بنفس تسعير الفاتورة — الواجهة مابتحسبش إجمالي موازي */
  quoteSplit(
    sessionId: number,
    lines: SplitCheckoutInput["lines"],
    discountType: "none" | "percentage" | "fixed" = "none",
    discountValue = 0
  ): Omit<SessionQuote, "at" | "actual_minutes"> {
    const s = this.openSessionRow(sessionId);
    const { picked } = this.pickSplit(s, lines);
    const itemsSubtotal = ordersRepository.calculateTotals({
      items: this.orderItems(picked),
      discount_type: "none",
      discount_value: 0,
    }).subtotal;
    const totals = computeTotals(itemsSubtotal, discountType, discountValue, this.settings().taxRate);
    return {
      items_subtotal: itemsSubtotal,
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_rate: totals.tax_rate,
      tax_amount: totals.tax_amount,
      total: totals.total,
    };
  }

  /**
   * تقسيم الفاتورة: فاتورة للبنود المختارة (كمية جزئية مسموحة)، والحساب يفضل مفتوح بالباقي.
   * آخر جزء بيقفل الحساب ويتربط بفاتورته. كل الأجزاء عليها `session_id` نفسه.
   */
  splitCheckout(input: SplitCheckoutInput, actor: Actor): CheckoutSessionResult {
    const s = this.openSessionRow(input.session_id);
    const { wanted, rows, picked } = this.pickSplit(s, input.lines);
    const at = this.now();
    return this.transaction(() => {
      // ① فاتورة الجزء — العميل بتاع الجزء ده بس (كل واحد بيدفع لنفسه)
      const result = this.createSessionOrder(s, picked, input, input.customer_id ?? null, actor);
      // ② نقص البنود اللي اتدفعت من الحساب
      for (const [itemId, qty] of wanted) {
        const row = rows.get(itemId)!;
        const rest = Math.round((row.quantity - qty) * 1000) / 1000;
        if (rest <= 0) this.db.prepare("DELETE FROM gaming_session_items WHERE id = ?").run(itemId);
        else this.db.prepare("UPDATE gaming_session_items SET quantity = ? WHERE id = ?").run(rest, itemId);
      }
      // ③ آخر جزء بيقفل الحساب
      if (this.loadItemRows(s.id).length === 0) this.closeSession(s, at, actor, result.order.id, s.customer_id);
      return { ...result, session: this.toDTO(this.sessionRow(s.id)!) };
    });
  }

  // ===== الإلغاء = بلا فاتورة وبلا فلوس (الصلاحية والتدقيق في الـIPC) =====
  cancelSession(sessionId: number, reason: string, actor: Actor): { session: GamingSessionDTO; minutes: number } {
    const why = (reason ?? "").trim();
    if (!why) throw new Error("اكتب سبب الإلغاء");
    const s = this.openSessionRow(sessionId);
    const at = this.now();
    const minutes = round2(tableElapsedMinutes(s.started_at, at));
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE gaming_sessions SET status = 'cancelled', ended_at = @at, closed_by = @actor_id, closed_by_name = @actor_name,
             cancel_reason = @reason, actual_minutes = @actual, billed_minutes = 0, time_amount = 0,
             updated_at = @at, sync_status = 'pending'
           WHERE id = @id`
        )
        .run({ id: s.id, at, actor_id: actor.id, actor_name: actor.name, reason: why, actual: minutes });
      this.enqueueSession(s.id, "UPDATED");
      return { session: this.toDTO(this.sessionRow(s.id)!), minutes };
    });
  }
}

export const gamingRepository = new GamingRepository();
