import { BaseRepository } from "./base.repository";
import { businessDateKey, shiftDateKey } from "../../shared/business-day";
import type {
  OnlineOrderDTO,
  OnlineOrderItem,
  OnlineOrderStatus,
  PulledOnlineOrder,
} from "../../shared/online-orders";

const ARCHIVE_DAYS = 30;

interface OnlineOrderRow {
  id: number;
  local_id: string;
  business_date: string | null;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  notes: string | null;
  items: string;
  items_count: number;
  subtotal: number;
  web_created_at: string | null;
  pulled_at: string;
  web_acked: number;
  desktop_order_id: number | null;
  completion_synced: number;
  cancel_reason: string | null;
  ticket_printed_at: string | null;
  cancel_synced: number;
}

// طلبات المتجر الإلكتروني المسحوبة من الويب (محلي بحت — مفيش مزامنة صادرة).
export class OnlineOrdersRepository extends BaseRepository {
  private parseItems(raw: string): OnlineOrderItem[] {
    try {
      const p = JSON.parse(raw) as OnlineOrderItem[];
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }

  // ===== اليوم المحاسبي (من الإعدادات — مش منتصف الليل) =====
  private businessDayStart(): number {
    const row = this.db
      .prepare("SELECT business_day_start AS v FROM settings WHERE id = 1")
      .get() as { v: number } | undefined;
    return row?.v ?? 0;
  }

  currentBusinessDate(): string {
    return businessDateKey(new Date(), this.businessDayStart());
  }

  private toDTO(row: OnlineOrderRow): OnlineOrderDTO {
    return {
      id: row.id,
      local_id: row.local_id,
      business_date: row.business_date,
      status: (["new", "done", "cancelled"].includes(row.status)
        ? row.status
        : "new") as OnlineOrderStatus,
      customer_name: row.customer_name,
      customer_phone: row.customer_phone ?? "",
      address: row.address,
      notes: row.notes,
      items: this.parseItems(row.items),
      items_count: row.items_count,
      subtotal: row.subtotal,
      web_created_at: row.web_created_at,
      pulled_at: row.pulled_at,
      desktop_order_id: row.desktop_order_id,
      cancel_reason: row.cancel_reason ?? null,
      ticket_printed_at: row.ticket_printed_at ?? null,
    };
  }

  // إدخال الطلبات المسحوبة (idempotent عبر local_id) — الموجود مايتكتبش تاني
  upsertPulled(orders: PulledOnlineOrder[]): number {
    if (orders.length === 0) return 0;
    const bizDate = this.currentBusinessDate(); // اليوم اللي وصل فيه الطلب للمحل
    const stmt = this.db.prepare(
      `INSERT INTO online_orders (
        local_id, status, business_date, customer_name, customer_phone, address, notes,
        items, items_count, subtotal, web_created_at, web_acked
      ) VALUES (
        @local_id, 'new', @biz, @name, @phone, @address, @notes,
        @items, @count, @subtotal, @created_at, 0
      )
      ON CONFLICT(local_id) DO NOTHING`
    );
    let inserted = 0;
    this.transaction(() => {
      for (const o of orders) {
        const res = stmt.run({
          local_id: o.local_id,
          biz: bizDate,
          name: o.customer?.name ?? null,
          phone: o.customer?.phone ?? "",
          address: o.customer?.address ?? null,
          notes: o.customer?.notes ?? null,
          items: JSON.stringify(o.items ?? []),
          count: o.items?.length ?? 0,
          subtotal: o.subtotal ?? 0,
          created_at: o.created_at ?? null,
        });
        if (res.changes > 0) inserted++;
      }
    });
    return inserted;
  }

  // local_ids اللي محتاجة تأكيد استلام للويب (اتخزّنت بس لسه ماتأكّدتش)
  pendingAckIds(): string[] {
    const rows = this.db
      .prepare("SELECT local_id FROM online_orders WHERE web_acked = 0")
      .all() as { local_id: string }[];
    return rows.map((r) => r.local_id);
  }

  markAcked(localIds: string[]): void {
    if (localIds.length === 0) return;
    const ph = localIds.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE online_orders SET web_acked = 1 WHERE local_id IN (${ph})`)
      .run(...localIds);
  }

  // الطلبات اللي اتضربت ولسه ماتبلّغش للويب (للـ completed ack)
  pendingCompletions(): { local_id: string; desktop_order_id: number }[] {
    return this.db
      .prepare(
        `SELECT local_id, desktop_order_id FROM online_orders
         WHERE desktop_order_id IS NOT NULL AND completion_synced = 0`
      )
      .all() as { local_id: string; desktop_order_id: number }[];
  }

  markCompletionSynced(localIds: string[]): void {
    if (localIds.length === 0) return;
    const ph = localIds.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE online_orders SET completion_synced = 1 WHERE local_id IN (${ph})`)
      .run(...localIds);
  }

  /** ختم إن تذكرة التجهيز اتطبعت — بيمنع ورقة تانية لنفس الأكل عند الحساب */
  markTicketPrinted(localId: string): void {
    this.db
      .prepare("UPDATE online_orders SET ticket_printed_at = ? WHERE local_id = ?")
      .run(new Date().toISOString(), localId);
  }

  // ربط طلب المتجر بالبيعة بعد ما الكاشير يضربها → done
  attachOrder(localId: string, desktopOrderId: number): void {
    this.db
      .prepare(
        `UPDATE online_orders SET desktop_order_id = ?, status = 'done', completion_synced = 0
         WHERE local_id = ?`
      )
      .run(desktopOrderId, localId);
  }




  // رفض الطلب من شاشة طلبات المتجر.
  // ⚠️ `cancel_synced = 0` هو جوهر الإصلاح: قبل كده الحالة كانت بتتغيّر محلياً بس
  // من غير ما تتعلّم للرفع، فالإلغاء عمره ما وصل للويب.
  cancel(localId: string, reason?: string | null): void {
    this.db
      .prepare(
        `UPDATE online_orders SET status = 'cancelled', cancel_reason = @reason,
         cancel_synced = 0 WHERE local_id = @localId`
      )
      .run({ localId, reason: reason?.trim() || null });
  }

  // إلغاء الطلب الأونلاين المربوط ببيعة اتلغت. بينده من orders.cancel() جوّه نفس
  // الترانزاكشن. بلا سبب: الإلغاء جه من شاشة الطلبات مش من رفض الكاشير.
  cancelByDesktopOrderId(desktopOrderId: number): void {
    this.db
      .prepare(
        `UPDATE online_orders SET status = 'cancelled', cancel_synced = 0
         WHERE desktop_order_id = ? AND status != 'cancelled'`
      )
      .run(desktopOrderId);
  }

  // الإلغاءات اللي لسه ماوصلتش للويب.
  // **بلا شرط desktop_order_id IS NOT NULL** — الطلب المرفوض عمره ماياخد واحد،
  // وده اللي كان بيمنعه يترفع أصلاً.
  pendingCancellations(): { local_id: string; reason: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT local_id, cancel_reason FROM online_orders
         WHERE status = 'cancelled' AND cancel_synced = 0`
      )
      .all() as { local_id: string; cancel_reason: string | null }[];
    return rows.map((r) => ({ local_id: r.local_id, reason: r.cancel_reason }));
  }

  markCancelSynced(localIds: string[]): void {
    if (localIds.length === 0) return;
    const ph = localIds.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE online_orders SET cancel_synced = 1 WHERE local_id IN (${ph})`)
      .run(...localIds);
  }

  getByLocalId(localId: string): OnlineOrderDTO | null {
    const row = this.db
      .prepare("SELECT * FROM online_orders WHERE local_id = ?")
      .get(localId) as OnlineOrderRow | undefined;
    return row ? this.toDTO(row) : null;
  }

  // طلبات النهارده (باليوم المحاسبي) + أي طلب جديد لسه ماتعاملناش معاه (مهما كان يومه)
  // عشان مفيش طلب يضيع. الجديد الأول.
  listToday(): OnlineOrderDTO[] {
    const today = this.currentBusinessDate();
    const rows = this.db
      .prepare(
        `SELECT * FROM online_orders
         WHERE business_date = @today OR status = 'new'
         ORDER BY (status = 'new') DESC, id DESC`
      )
      .all({ today }) as OnlineOrderRow[];
    return rows.map((r) => this.toDTO(r));
  }

  // طلبات يوم محدّد من الأرشيف
  listForDate(date: string): OnlineOrderDTO[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM online_orders WHERE business_date = ? ORDER BY id DESC`
      )
      .all(date) as OnlineOrderRow[];
    return rows.map((r) => this.toDTO(r));
  }

  // أيام الأرشيف (الأيام السابقة لليوم الحالي، آخر 30 يوم، الأحدث أول)
  archiveDays(): { date: string; count: number }[] {
    const today = this.currentBusinessDate();
    const floor = shiftDateKey(today, -ARCHIVE_DAYS);
    return this.db
      .prepare(
        `SELECT business_date AS date, COUNT(*) AS count
         FROM online_orders
         WHERE business_date IS NOT NULL AND business_date < @today AND business_date >= @floor
         GROUP BY business_date
         ORDER BY business_date DESC`
      )
      .all({ today, floor }) as { date: string; count: number }[];
  }

  // حذف الطلبات الأقدم من 30 يوم (تنظيف دوري)
  purgeOld(): number {
    const floor = shiftDateKey(this.currentBusinessDate(), -ARCHIVE_DAYS);
    const res = this.db
      .prepare(
        "DELETE FROM online_orders WHERE business_date IS NOT NULL AND business_date < ?"
      )
      .run(floor);
    return res.changes;
  }

  newCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM online_orders WHERE status = 'new'")
      .get() as { c: number };
    return row.c;
  }
}

export const onlineOrdersRepository = new OnlineOrdersRepository();
