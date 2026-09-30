import { BaseRepository } from "./base.repository";
import {
  classify,
  daysSince,
  type CustomerDTO,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type CustomerListQuery,
  type CustomerOrdersQuery,
  type CustomerOrdersPage,
  type CustomerOrderRow,
  type CustomerFreeOrder,
  type Gender,
  type Classification,
} from "../../shared/customers";
import type { CustomerRow } from "../../types/database.types";

export class CustomersRepository extends BaseRepository {
  private absenceAlertDays(): number {
    const row = this.db
      .prepare("SELECT absence_alert_days FROM settings WHERE id = 1")
      .get() as { absence_alert_days: number } | undefined;
    return row?.absence_alert_days ?? 14;
  }

  private defaultNationality(): string {
    const row = this.db
      .prepare("SELECT nationalities FROM settings WHERE id = 1")
      .get() as { nationalities: string } | undefined;
    try {
      const arr = JSON.parse(row?.nationalities ?? "[]") as string[];
      return arr[0] ?? "مصري";
    } catch {
      return "مصري";
    }
  }

  private toDTO(row: CustomerRow, absenceAlertDays: number): CustomerDTO {
    const days = daysSince(row.last_visit_at);
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      phone: row.phone,
      gender: (row.gender as Gender | null) ?? null,
      nationality: row.nationality,
      notes: row.notes,
      classification: classify(row.total_visits, days, absenceAlertDays),
      total_visits: row.total_visits,
      total_spent: row.total_spent,
      avg_spent: row.avg_spent ?? 0,
      first_visit_at: row.first_visit_at,
      last_visit_at: row.last_visit_at,
      favorite_product_id: row.favorite_product_id ?? null,
      favorite_product_name: row.favorite_product_name ?? null,
      days_since_last: days,
    };
  }

  private findRow(id: number): CustomerRow | null {
    const row = this.db
      .prepare("SELECT * FROM customers WHERE id = ? AND is_deleted = 0")
      .get(id) as CustomerRow | undefined;
    return row ?? null;
  }

  phoneExists(phone: string, excludeId?: number): boolean {
    const row = this.db
      .prepare(
        "SELECT id FROM customers WHERE phone = ? AND is_deleted = 0 AND id != ?"
      )
      .get(phone, excludeId ?? -1) as { id: number } | undefined;
    return !!row;
  }

  getById(id: number): CustomerDTO | null {
    const row = this.findRow(id);
    return row ? this.toDTO(row, this.absenceAlertDays()) : null;
  }

  getAll(query: CustomerListQuery): CustomerDTO[] {
    const sortSql =
      query.sort === "total_spent"
        ? "total_spent DESC"
        : query.sort === "total_visits"
          ? "total_visits DESC"
          : query.sort === "name"
            ? "name ASC"
            : "last_visit_at DESC NULLS LAST, name ASC";

    const params: unknown[] = [];
    let where = "is_deleted = 0";
    if (query.search && query.search.trim()) {
      where += " AND (name LIKE ? OR phone LIKE ?)";
      const q = `%${query.search.trim()}%`;
      params.push(q, q);
    }

    const rows = this.db
      .prepare(`SELECT * FROM customers WHERE ${where} ORDER BY ${sortSql}`)
      .all(...params) as CustomerRow[];

    const alert = this.absenceAlertDays();
    let list = rows.map((r) => this.toDTO(r, alert));

    // التصنيف محسوب ديناميكياً → نفلتره في JS
    if (query.classification && query.classification !== "all") {
      list = list.filter((c) => c.classification === query.classification);
    }
    return list;
  }

  search(term: string): CustomerDTO[] {
    const q = `%${term.trim()}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM customers
         WHERE is_deleted = 0 AND (name LIKE ? OR phone LIKE ?)
         ORDER BY last_visit_at DESC NULLS LAST, name ASC
         LIMIT 20`
      )
      .all(q, q) as CustomerRow[];
    const alert = this.absenceAlertDays();
    return rows.map((r) => this.toDTO(r, alert));
  }

  getAbsent(): CustomerDTO[] {
    const alert = this.absenceAlertDays();
    const rows = this.db
      .prepare(
        `SELECT * FROM customers
         WHERE is_deleted = 0 AND last_visit_at IS NOT NULL
         ORDER BY last_visit_at ASC`
      )
      .all() as CustomerRow[];
    return rows
      .map((r) => this.toDTO(r, alert))
      .filter((c) => (c.days_since_last ?? 0) > alert);
  }

  create(input: CreateCustomerInput, actorId: number | null): CustomerDTO {
    const phone = input.phone?.trim() || null;
    if (!phone || !/^\d{11}$/.test(phone)) {
      throw new Error("رقم الموبايل لازم يكون 11 رقم");
    }
    if (this.phoneExists(phone)) {
      throw new Error("الموبايل مستخدم لعميل تاني");
    }
    const localId = this.newLocalId();
    const now = this.now();
    const nationality = input.nationality?.trim() || this.defaultNationality();
    // الاسم اختياري — لو فاضي نستخدم الموبايل كاسم عرض
    const name = input.name?.trim() || phone;

    return this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO customers (
            local_id, name, phone, gender, nationality, notes, classification,
            created_by, updated_by, created_at, updated_at, sync_status
          ) VALUES (
            @local_id, @name, @phone, @gender, @nationality, @notes, 'new',
            @actor, @actor, @now, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          name,
          phone,
          gender: input.gender ?? null,
          nationality,
          notes: input.notes ?? null,
          actor: actorId,
          now,
        });
      const created = this.findRow(Number(result.lastInsertRowid))!;
      this.enqueue("customer", "CREATED", localId, this.toSyncPayload(created));
      return this.toDTO(created, this.absenceAlertDays());
    });
  }

  // البحث عن عميل بالموبايل أو إنشاؤه (لتجهيز طلبات المتجر — 0.9.0)
  findOrCreateByPhone(
    phone: string,
    name: string | null,
    actorId: number | null
  ): CustomerDTO {
    const clean = phone.trim();
    if (!/^\d{11}$/.test(clean)) {
      throw new Error("رقم الموبايل لازم يكون 11 رقم");
    }
    const existing = this.db
      .prepare("SELECT id FROM customers WHERE phone = ? AND is_deleted = 0")
      .get(clean) as { id: number } | undefined;
    if (existing) {
      return this.toDTO(this.findRow(existing.id)!, this.absenceAlertDays());
    }
    // الاسم فاضي → create بيستخدم الموبايل كاسم عرض تلقائياً
    return this.create({ phone: clean, name: name ?? "" }, actorId);
  }

  update(input: UpdateCustomerInput, actorId: number | null): CustomerDTO {
    const existing = this.findRow(input.id);
    if (!existing) throw new Error("العميل غير موجود");

    if (input.phone !== undefined) {
      const phone = input.phone.trim();
      if (!/^\d{11}$/.test(phone)) {
        throw new Error("رقم الموبايل لازم يكون 11 رقم");
      }
      if (this.phoneExists(phone, input.id)) {
        throw new Error("الموبايل مستخدم لعميل تاني");
      }
    }

    const fields: string[] = ["updated_at = @now", "updated_by = @actor", "sync_status = 'pending'"];
    const params: Record<string, unknown> = {
      id: input.id,
      now: this.now(),
      actor: actorId,
    };
    if (input.name !== undefined) {
      // الاسم اختياري — لو فاضي يفضل بالموبايل (الحالي أو الجديد)
      fields.push("name = @name");
      params.name = input.name?.trim() || input.phone?.trim() || existing.phone || existing.name;
    }
    if (input.phone !== undefined) {
      fields.push("phone = @phone");
      params.phone = input.phone.trim() || null;
    }
    if (input.gender !== undefined) {
      fields.push("gender = @gender");
      params.gender = input.gender;
    }
    if (input.nationality !== undefined) {
      fields.push("nationality = @nationality");
      params.nationality = input.nationality;
    }
    if (input.notes !== undefined) {
      fields.push("notes = @notes");
      params.notes = input.notes;
    }

    return this.transaction(() => {
      this.db
        .prepare(`UPDATE customers SET ${fields.join(", ")} WHERE id = @id`)
        .run(params);
      const updated = this.findRow(input.id)!;
      this.enqueue("customer", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return this.toDTO(updated, this.absenceAlertDays());
    });
  }

  softDelete(id: number, actorId: number | null): boolean {
    const existing = this.findRow(id);
    if (!existing) throw new Error("العميل غير موجود");
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE customers SET is_deleted = 1, deleted_by = @actor, deleted_at = @now, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, actor: actorId, now: this.now() });
      this.enqueue("customer", "DELETED", existing.local_id, {
        local_id: existing.local_id,
      });
      return true;
    });
  }

  // تُستدعى من orders.create بعد كل بيعة لعميل مسجّل
  updateStats(customerId: number, orderTotal: number, when: string): void {
    const row = this.findRow(customerId);
    if (!row) return;

    const totalVisits = row.total_visits + 1;
    const totalSpent = row.total_spent + orderTotal;
    const avgSpent = totalVisits > 0 ? totalSpent / totalVisits : 0;
    const firstVisit = row.first_visit_at ?? when;

    // المنتج المفضل = الأكثر تكراراً في طلبات هذا العميل
    const fav = this.db
      .prepare(
        `SELECT oi.product_id AS pid, oi.product_name AS pname, SUM(oi.quantity) AS cnt
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.customer_id = ? AND o.is_deleted = 0 AND o.status = 'paid'
         GROUP BY oi.product_id
         ORDER BY cnt DESC
         LIMIT 1`
      )
      .get(customerId) as { pid: number | null; pname: string } | undefined;

    const classification: Classification = classify(
      totalVisits,
      0,
      this.absenceAlertDays()
    );

    this.db
      .prepare(
        `UPDATE customers
         SET total_visits = @visits,
             total_spent = @spent,
             avg_spent = @avg,
             last_visit_at = @when,
             first_visit_at = @first,
             favorite_product_id = @fav_id,
             favorite_product_name = @fav_name,
             classification = @class,
             updated_at = @when,
             sync_status = 'pending'
         WHERE id = @id`
      )
      .run({
        id: customerId,
        visits: totalVisits,
        spent: totalSpent,
        avg: avgSpent,
        when,
        first: firstVisit,
        fav_id: fav?.pid ?? null,
        fav_name: fav?.pname ?? null,
        class: classification,
      });

    const updated = this.findRow(customerId)!;
    this.enqueue("customer", "UPDATED", updated.local_id, this.toSyncPayload(updated));
  }

  getOrders(query: CustomerOrdersQuery): CustomerOrdersPage {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 15);

    // المجانية مستبعدة من سجل المشتريات (ليها قسم لوحدها)
    const params: unknown[] = [query.customerId];
    let where = "customer_id = ? AND is_deleted = 0 AND is_free = 0";
    if (query.dateFrom) {
      where += " AND created_at >= ?";
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      where += " AND created_at <= ?";
      params.push(query.dateTo);
    }

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS c FROM orders WHERE ${where}`)
      .get(...params) as { c: number };

    const periodRow = this.db
      .prepare(
        `SELECT COUNT(*) AS visits, COALESCE(SUM(total), 0) AS spent
         FROM orders WHERE ${where} AND status = 'paid'`
      )
      .get(...params) as { visits: number; spent: number };

    const rows = this.db
      .prepare(
        `SELECT id, receipt_number, created_at, total, payment_method, status
         FROM orders WHERE ${where}
         ORDER BY id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, (page - 1) * pageSize) as {
      id: number;
      receipt_number: number;
      created_at: string;
      total: number;
      payment_method: string;
      status: string;
    }[];

    const itemStmt = this.db.prepare(
      "SELECT product_name, quantity, sale_type FROM order_items WHERE order_id = ?"
    );

    const result: CustomerOrderRow[] = rows.map((o) => {
      const items = itemStmt.all(o.id) as {
        product_name: string;
        quantity: number;
        sale_type: string;
      }[];
      const summary = items
        .map((it) =>
          it.sale_type === "weight"
            ? `${it.product_name} ${Number(it.quantity.toFixed(3))} كجم`
            : `${it.product_name} × ${it.quantity}`
        )
        .join("، ");
      return {
        id: o.id,
        receipt_label: "#" + String(o.receipt_number).padStart(4, "0"),
        created_at: o.created_at,
        total: o.total,
        payment_method: o.payment_method,
        status: o.status,
        items_summary: summary,
      };
    });

    return {
      rows: result,
      total: totalRow.c,
      page,
      page_size: pageSize,
      period_visits: periodRow.visits,
      period_spent: periodRow.spent,
    };
  }

  // الأصناف اللي خدها العميل مجاناً (للبروفايل — نعرف مين خد إيه قبل كده)
  getFreeOrders(customerId: number): CustomerFreeOrder[] {
    const orders = this.db
      .prepare(
        `SELECT id, receipt_number, created_at, cashier_name, total
         FROM orders
         WHERE customer_id = ? AND is_deleted = 0 AND is_free = 1 AND status = 'paid'
         ORDER BY id DESC`
      )
      .all(customerId) as {
      id: number;
      receipt_number: number;
      created_at: string;
      cashier_name: string;
      total: number;
    }[];

    const itemStmt = this.db.prepare(
      "SELECT product_name, quantity, total_price, sale_type FROM order_items WHERE order_id = ?"
    );

    return orders.map((o) => {
      const items = itemStmt.all(o.id) as {
        product_name: string;
        quantity: number;
        total_price: number;
        sale_type: string;
      }[];
      return {
        id: o.id,
        receipt_label: "#" + String(o.receipt_number).padStart(4, "0"),
        created_at: o.created_at,
        cashier_name: o.cashier_name,
        total: o.total,
        items: items.map((it) => ({
          product_name: it.product_name,
          quantity: it.quantity,
          sale_type: it.sale_type === "weight" ? "weight" : "piece",
          value: it.total_price,
        })),
      };
    });
  }

  private toSyncPayload(row: CustomerRow) {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      phone: row.phone,
      gender: row.gender,
      nationality: row.nationality,
      notes: row.notes,
      classification: row.classification,
      total_visits: row.total_visits,
      total_spent: row.total_spent,
      avg_spent: row.avg_spent,
      first_visit_at: row.first_visit_at,
      last_visit_at: row.last_visit_at,
      favorite_product_id: row.favorite_product_id,
      favorite_product_name: row.favorite_product_name,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const customersRepository = new CustomersRepository();
