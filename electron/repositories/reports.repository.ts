import { BaseRepository } from "./base.repository";
import { businessDateKey, shiftDateKey } from "../../shared/business-day";
import { formatReceiptNumber } from "../../shared/orders";
import { REPORT_WINDOW_DAYS } from "../../shared/reports";
import type {
  SalesDayReport,
  SalesSummaryRow,
  SalesOrderRow,
  SalesOrderItemRow,
  InventoryStatusRow,
  InventoryReportStatus,
  InventoryMovementRow,
  DashboardSummary,
  DashboardAlert,
  DashboardRecentOrder,
} from "../../shared/reports";
import type { OrderRow, OrderItemRow } from "../../types/database.types";
// فئة البند = فئة المنتج. نسخة الكافيه مالهاش بند «وقت لعب» (مفيش غرف) فمفيش فئة مشتقّة.
const CATEGORY_SQL = "c.name";

export class ReportsRepository extends BaseRepository {
  private businessDayStart(): number {
    const row = this.db
      .prepare("SELECT business_day_start FROM settings WHERE id = 1")
      .get() as { business_day_start: number } | undefined;
    return row?.business_day_start ?? 0;
  }

  private todayKey(): string {
    return businessDateKey(new Date(), this.businessDayStart());
  }

  // أقدم يوم مسموح عرضه (آخر 30 يوم)
  private floorKey(): string {
    return shiftDateKey(this.todayKey(), -(REPORT_WINDOW_DAYS - 1));
  }

  private parseModifiers(raw: string): { option_name: string }[] {
    try {
      const arr = JSON.parse(raw) as { option_name?: string }[];
      return Array.isArray(arr)
        ? arr.map((m) => ({ option_name: m.option_name ?? "" }))
        : [];
    } catch {
      return [];
    }
  }

  private loadItems(orderId: number): SalesOrderItemRow[] {
    const rows = this.db
      .prepare(
        `SELECT oi.*, ${CATEGORY_SQL} AS category_name
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC`
      )
      .all(orderId) as (OrderItemRow & { category_name: string | null })[];
    return rows.map((r) => ({
      product_name: r.product_name,
      category_name: r.category_name,
      quantity: r.quantity,
      unit_price: r.unit_price,
      total_price: r.total_price,
      sale_type: r.sale_type === "weight" ? "weight" : "piece",
      selected_modifiers: this.parseModifiers(r.selected_modifiers),
    }));
  }

  private mapOrder(o: OrderRow): SalesOrderRow {
    const items = this.loadItems(o.id);
    return {
      id: o.id,
      receipt_number: o.receipt_number,
      receipt_label: formatReceiptNumber(o.receipt_number),
      time: o.created_at,
      customer_name: o.is_guest ? "زائر" : o.customer_name ?? "زائر",
      items_count: items.reduce(
        (s, it) => s + (it.sale_type === "weight" ? 1 : it.quantity),
        0
      ),
      subtotal: o.subtotal,
      discount_amount: o.discount_amount,
      tax_amount: o.tax_amount,
      tax_rate: o.tax_rate,
      total: o.total,
      amount_paid: o.amount_paid,
      change_amount: o.change_amount,
      payment_method: o.payment_method,
      cashier_id: o.cashier_id,
      cashier_name: o.cashier_name,
      status: o.status === "cancelled" ? "cancelled" : "paid",
      is_free: o.is_free === 1,
      free_recipient_type:
        o.free_recipient_type === "staff" || o.free_recipient_type === "customer"
          ? o.free_recipient_type
          : null,
      free_recipient_name: o.free_recipient_name,
      source: o.source ?? "pos",
      order_type: o.order_type === "delivery" ? "delivery" : "counter",
      delivery_fee: o.delivery_fee ?? 0,
      delivery_person_id: o.delivery_person_id ?? null,
      delivery_person_name: o.delivery_person_name ?? null,
      items,
    };
  }

  // ===== تقرير المبيعات — يوم تجاري محدد =====
  getSalesByDay(businessDate: string): SalesDayReport {
    const orders = this.db
      .prepare(
        "SELECT * FROM orders WHERE business_date = ? AND is_deleted = 0 ORDER BY created_at DESC"
      )
      .all(businessDate) as OrderRow[];

    // المجانية مستبعدة من كل حسابات الفلوس (بتظهر للمراجعة بس)
    const paid = orders.filter((o) => o.status === "paid" && o.is_free !== 1);

    const byCategory = this.db
      .prepare(
        `SELECT COALESCE(${CATEGORY_SQL}, 'بدون فئة') AS category,
                COUNT(oi.id) AS count,
                COALESCE(SUM(oi.total_price), 0) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE o.business_date = ? AND o.is_deleted = 0 AND o.status = 'paid' AND o.is_free = 0
         GROUP BY category
         ORDER BY revenue DESC`
      )
      .all(businessDate) as { category: string; count: number; revenue: number }[];

    const byPaymentMethod = this.db
      .prepare(
        `SELECT payment_method AS method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
         FROM orders
         WHERE business_date = ? AND is_deleted = 0 AND status = 'paid' AND is_free = 0
         GROUP BY payment_method
         ORDER BY revenue DESC`
      )
      .all(businessDate) as { method: string; count: number; revenue: number }[];

    // مصاريف نفس اليوم التجاري (مع مين سجّلها — للفلترة بالوردية)
    const expenses = this.db
      .prepare(
        `SELECT drawer_amount, created_by, created_by_name, category, description
         FROM expenses WHERE expense_date = ? AND is_deleted = 0`
      )
      .all(businessDate) as {
      drawer_amount: number;
      created_by: number | null;
      created_by_name: string;
      category: string;
      description: string;
    }[];

    // قائمة الكاشيرية اللي ليهم نشاط النهارده (بيع أو مصروف)
    const cashierMap = new Map<number, string>();
    for (const o of orders) cashierMap.set(o.cashier_id, o.cashier_name);
    for (const e of expenses) {
      if (e.created_by != null) cashierMap.set(e.created_by, e.created_by_name);
    }
    const cashiers = Array.from(cashierMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      date: businessDate,
      totalOrders: paid.length,
      totalRevenue: paid.reduce((s, o) => s + o.total, 0),
      totalDiscount: paid.reduce((s, o) => s + o.discount_amount, 0),
      totalTax: paid.reduce((s, o) => s + o.tax_amount, 0),
      byCategory,
      byPaymentMethod,
      orders: orders.map((o) => this.mapOrder(o)),
      expenses,
      cashiers,
    };
  }

  // ===== ملخص آخر 30 يوم =====
  getSalesSummary(): SalesSummaryRow[] {
    const floor = this.floorKey();
    const today = this.todayKey();

    const daily = this.db
      .prepare(
        `SELECT business_date AS date,
                COUNT(*) AS total_orders,
                COALESCE(SUM(total), 0) AS total_revenue
         FROM orders
         WHERE business_date >= ? AND business_date <= ?
           AND is_deleted = 0 AND status = 'paid' AND is_free = 0
         GROUP BY business_date`
      )
      .all(floor, today) as {
      date: string;
      total_orders: number;
      total_revenue: number;
    }[];

    const topCat = this.db
      .prepare(
        `SELECT o.business_date AS date, COALESCE(${CATEGORY_SQL}, 'بدون فئة') AS category,
                SUM(oi.total_price) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE o.business_date >= ? AND o.business_date <= ?
           AND o.is_deleted = 0 AND o.status = 'paid' AND o.is_free = 0
         GROUP BY o.business_date, category`
      )
      .all(floor, today) as { date: string; category: string; revenue: number }[];

    const topByDate = new Map<string, { category: string; revenue: number }>();
    for (const r of topCat) {
      const cur = topByDate.get(r.date);
      if (!cur || r.revenue > cur.revenue) {
        topByDate.set(r.date, { category: r.category, revenue: r.revenue });
      }
    }

    return daily
      .map((d) => ({
        date: d.date,
        total_orders: d.total_orders,
        total_revenue: d.total_revenue,
        top_category: topByDate.get(d.date)?.category ?? null,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  // ===== تقرير المخزون =====
  private statusOf(current: number, threshold: number): InventoryReportStatus {
    if (current <= 0) return "out_of_stock";
    if (current <= threshold) return "low";
    return "sufficient";
  }

  getInventoryStatus(): InventoryStatusRow[] {
    const items = this.db
      .prepare(
        `SELECT i.*, s.name AS supplier_name
         FROM inventory_items i
         LEFT JOIN suppliers s ON s.id = i.supplier_id
         WHERE i.is_deleted = 0
         ORDER BY i.name ASC`
      )
      .all() as (InventoryItemJoin)[];

    const lastRestockStmt = this.db.prepare(
      `SELECT created_at, quantity FROM inventory_transactions
       WHERE item_id = ? AND type = 'restock'
       ORDER BY created_at DESC, id DESC LIMIT 1`
    );
    const consumedStmt = this.db.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'deduction' THEN quantity ELSE 0 END), 0) AS deducted,
         COALESCE(SUM(CASE WHEN type = 'waste' THEN quantity ELSE 0 END), 0) AS wasted
       FROM inventory_transactions
       WHERE item_id = ? AND created_at >= datetime('now', '-30 days')`
    );

    return items.map((it) => {
      const last = lastRestockStmt.get(it.id) as
        | { created_at: string; quantity: number }
        | undefined;
      const consumed = consumedStmt.get(it.id) as {
        deducted: number;
        wasted: number;
      };
      const expectedMin =
        it.current_quantity * (1 - (it.waste_percentage || 0) / 100);
      return {
        id: it.id,
        name: it.name,
        unit: it.unit,
        current_quantity: it.current_quantity,
        alert_threshold: it.alert_threshold,
        waste_percentage: it.waste_percentage,
        expected_min: Number(expectedMin.toFixed(3)),
        status: this.statusOf(it.current_quantity, it.alert_threshold),
        cost_per_unit: it.cost_per_unit,
        total_value: Number(
          (it.current_quantity * it.cost_per_unit).toFixed(2)
        ),
        supplier_name: it.supplier_name,
        last_restock_date: last?.created_at ?? null,
        last_restock_qty: last?.quantity ?? null,
        total_deducted_30d: Number(consumed.deducted.toFixed(3)),
        total_wasted_30d: Number(consumed.wasted.toFixed(3)),
      };
    });
  }

  getInventoryMovements(itemId: number): InventoryMovementRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, created_at, type, quantity, quantity_after, reason
         FROM inventory_transactions
         WHERE item_id = ? AND created_at >= datetime('now', '-30 days')
         ORDER BY created_at DESC, id DESC`
      )
      .all(itemId) as {
      id: number;
      created_at: string;
      type: string;
      quantity: number;
      quantity_after: number;
      reason: string | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      type: r.type as InventoryMovementRow["type"],
      quantity: r.quantity,
      quantity_after: r.quantity_after,
      reason: r.reason,
    }));
  }

  // ===== ملخص لوحة التحكم =====
  getTodaySummary(): DashboardSummary {
    const today = this.todayKey();

    const salesRow = this.db
      .prepare(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales
         FROM orders WHERE business_date = ? AND is_deleted = 0 AND status = 'paid' AND is_free = 0`
      )
      .get(today) as { orders: number; sales: number };

    const expensesRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(drawer_amount), 0) AS total
         FROM expenses WHERE expense_date = ? AND is_deleted = 0`
      )
      .get(today) as { total: number };

    const invRow = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN current_quantity <= 0 THEN 1 ELSE 0 END), 0) AS out_count,
           COALESCE(SUM(CASE WHEN current_quantity > 0 AND current_quantity <= alert_threshold THEN 1 ELSE 0 END), 0) AS low_count
         FROM inventory_items WHERE is_deleted = 0`
      )
      .get() as { out_count: number; low_count: number };

    // عملاء جدد النهارده (حسب اليوم التجاري)
    const startHour = this.businessDayStart();
    const recentCustomers = this.db
      .prepare(
        `SELECT first_visit_at FROM customers
         WHERE is_deleted = 0 AND first_visit_at >= datetime('now', '-2 days')`
      )
      .all() as { first_visit_at: string | null }[];
    const newCustomers = recentCustomers.filter(
      (c) =>
        c.first_visit_at &&
        businessDateKey(new Date(c.first_visit_at), startHour) === today
    ).length;

    // تنبيهات المخزون (بدون تنبيه غياب الموظفين — حسب طلب سابق)
    const alerts: DashboardAlert[] = [];
    const alertItems = this.db
      .prepare(
        `SELECT name, unit, current_quantity, alert_threshold
         FROM inventory_items
         WHERE is_deleted = 0 AND current_quantity <= alert_threshold
         ORDER BY current_quantity ASC`
      )
      .all() as {
      name: string;
      unit: string;
      current_quantity: number;
      alert_threshold: number;
    }[];
    for (const it of alertItems) {
      if (it.current_quantity <= 0) {
        alerts.push({ kind: "out_of_stock", message: `${it.name}: نفد من المخزون` });
      } else {
        alerts.push({
          kind: "low_stock",
          message: `${it.name}: منخفض (${Number(it.current_quantity.toFixed(3))} ${it.unit})`,
        });
      }
    }

    const recent = this.db
      .prepare(
        `SELECT id, receipt_number, customer_name, is_guest, total, created_at, status
         FROM orders WHERE business_date = ? AND is_deleted = 0
         ORDER BY created_at DESC LIMIT 5`
      )
      .all(today) as {
      id: number;
      receipt_number: number;
      customer_name: string | null;
      is_guest: number;
      total: number;
      created_at: string;
      status: string;
    }[];
    const recentOrders: DashboardRecentOrder[] = recent.map((o) => ({
      id: o.id,
      receipt_number: o.receipt_number,
      receipt_label: formatReceiptNumber(o.receipt_number),
      customer_name: o.is_guest ? "زائر" : o.customer_name ?? "زائر",
      total: o.total,
      time: o.created_at,
      status: o.status === "cancelled" ? "cancelled" : "paid",
    }));

    const todaySales = salesRow.sales;
    const todayExpenses = expensesRow.total;
    return {
      todaySales,
      todayOrders: salesRow.orders,
      avgOrderValue: salesRow.orders ? todaySales / salesRow.orders : 0,
      newCustomers,
      lowStockCount: invRow.low_count,
      outOfStockCount: invRow.out_count,
      todayExpenses,
      todayNet: todaySales - todayExpenses,
      alerts,
      recentOrders,
    };
  }
}

interface InventoryItemJoin {
  id: number;
  name: string;
  unit: string;
  current_quantity: number;
  alert_threshold: number;
  waste_percentage: number;
  cost_per_unit: number;
  supplier_name: string | null;
}

export const reportsRepository = new ReportsRepository();
