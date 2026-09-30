// Smoke test: يتأكد إن better-sqlite3 يحمّل تحت Electron + الـ migration/seed يشتغلوا.
// يشتغل بدون نافذة ثم يخرج.
const { app } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const {
  initDatabase,
  getDatabase,
  closeDatabase,
} = require("../dist-electron/electron/database/connection");

app.whenReady().then(() => {
  try {
    const tmp = path.join(os.tmpdir(), "flexpay-smoke-" + Date.now());
    fs.mkdirSync(tmp, { recursive: true });
    initDatabase(tmp);
    const db = getDatabase();

    const userVersion = db.pragma("user_version", { simple: true });
    const users = db.prepare("SELECT id, username, role FROM users").all();
    const sq = db.prepare("SELECT COUNT(*) AS c FROM sync_queue").get();
    const settings = db
      .prepare(
        "SELECT shop_name, currency_symbol, business_day_start, payment_methods FROM settings WHERE id = 1"
      )
      .get();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);

    console.log("SMOKE_USER_VERSION=" + userVersion);
    console.log("SMOKE_TABLES=" + JSON.stringify(tables));
    console.log("SMOKE_USERS=" + JSON.stringify(users));
    console.log("SMOKE_SYNCQUEUE=" + JSON.stringify(sq));
    console.log("SMOKE_SETTINGS=" + JSON.stringify(settings));

    // PRD-03: اختبار المنتجات والباركود
    const catInfo = db
      .prepare(
        "INSERT INTO categories (local_id, name, icon, sort_order, sync_status) VALUES ('cat-1','مشروبات','☕',1,'pending')"
      )
      .run();
    const prodInfo = db
      .prepare(
        "INSERT INTO products (local_id, name, category_id, price, barcode, sync_status) VALUES ('prod-1','قهوة',?,25,'6221031','pending')"
      )
      .run(catInfo.lastInsertRowid);
    const prod = db
      .prepare("SELECT id, name, price, barcode, is_available FROM products WHERE id=?")
      .get(prodInfo.lastInsertRowid);
    console.log("SMOKE_PRODUCT=" + JSON.stringify(prod));
    // اختبار قيد الباركود الفريد الجزئي (يسمح بإعادة الاستخدام بعد الحذف الناعم)
    let barcodeUniqueEnforced = false;
    try {
      db.prepare(
        "INSERT INTO products (local_id, name, price, barcode, sync_status) VALUES ('prod-2','تاني',10,'6221031','pending')"
      ).run();
    } catch {
      barcodeUniqueEnforced = true;
    }
    console.log("SMOKE_BARCODE_UNIQUE=" + barcodeUniqueEnforced);

    // PRD-04: مخزون + وصفة + خصم تلقائي + إخفاء تلقائي
    const sup = db
      .prepare(
        "INSERT INTO suppliers (local_id, name, sync_status) VALUES ('sup-1','مورد',?)"
      )
      .run("pending");
    const inv = db
      .prepare(
        "INSERT INTO inventory_items (local_id, name, unit, current_quantity, alert_threshold, cost_per_unit, supplier_id, status, sync_status) VALUES ('inv-1','بن','كيلو',2,1,50,?,'sufficient','pending')"
      )
      .run(sup.lastInsertRowid);
    // اربط المنتج (prod-1) بالمادة: 0.8 كيلو لكل وحدة
    db.prepare(
      "INSERT INTO product_recipes (local_id, product_id, inventory_item_id, inventory_item_name, unit, standard_qty, sync_status) VALUES ('rec-1',?,?,'بن','كيلو',0.8,'pending')"
    ).run(prodInfo.lastInsertRowid, inv.lastInsertRowid);

    // حمّل الـ repo واعمل خصم لطلب فيه 3 وحدات (3×0.8=2.4 → يتعدى المتاح 2 → نفد)
    const invRepo = require("../dist-electron/electron/repositories/inventory.repository.js").inventoryRepository;
    invRepo.deductForOrder(99, [{ product_id: prodInfo.lastInsertRowid, quantity: 3 }], 1);
    const afterDeduct = db
      .prepare("SELECT current_quantity, status FROM inventory_items WHERE id=?")
      .get(inv.lastInsertRowid);
    const prodAvail = db
      .prepare("SELECT is_available FROM products WHERE id=?")
      .get(prodInfo.lastInsertRowid);
    const txCount = db
      .prepare("SELECT COUNT(*) AS c FROM inventory_transactions WHERE item_id=?")
      .get(inv.lastInsertRowid);
    console.log("SMOKE_INV_AFTER_DEDUCT=" + JSON.stringify(afterDeduct));
    console.log("SMOKE_PRODUCT_AVAIL_AFTER=" + JSON.stringify(prodAvail));
    console.log("SMOKE_INV_TX_COUNT=" + JSON.stringify(txCount));
    // رجّع كمية (restock) → المنتج يرجع متاح
    invRepo.restock(inv.lastInsertRowid, 5, "توريد", 1);
    const prodAvail2 = db
      .prepare("SELECT is_available FROM products WHERE id=?")
      .get(prodInfo.lastInsertRowid);
    console.log("SMOKE_PRODUCT_AVAIL_RESTOCK=" + JSON.stringify(prodAvail2));

    // PRD-05: إنشاء طلب كامل عبر الـ repo
    const ordersRepo = require("../dist-electron/electron/repositories/orders.repository.js").ordersRepository;
    const custRepo = require("../dist-electron/electron/repositories/customers.repository.js").customersRepository;
    // ⚠️ كان "0100" — اتكسر في الأساس نفسه بعد ما تحقق الـ11 رقم اتضاف لـcustomersRepository
    const cust = custRepo.create({ name: "أحمد", phone: "01000000000" }, 1);
    const orderRes = ordersRepo.create(
      {
        items: [{ product_id: prodInfo.lastInsertRowid, quantity: 2, modifier_option_ids: [] }],
        customer_id: cust.id,
        is_guest: false,
        order_type: "counter",
        discount_type: "percentage",
        discount_value: 10,
        payment_method: "cash",
        amount_paid: 100,
        notes: "تست",
      },
      1,
      "المالك"
    );
    console.log(
      "SMOKE_ORDER=" +
        JSON.stringify({
          receipt: orderRes.order.receipt_label,
          subtotal: orderRes.order.subtotal,
          discount: orderRes.order.discount_amount,
          total: orderRes.order.total,
          change: orderRes.change,
          items: orderRes.order.items.length,
          cashier: orderRes.order.cashier_name,
        })
    );
    // العميل اتحدّث
    const custAfter = custRepo.getById(cust.id);
    console.log("SMOKE_CUSTOMER_AFTER=" + JSON.stringify(custAfter));
    // المخزون اتخصم تاني بسبب الطلب
    const invAfterOrder = db
      .prepare("SELECT current_quantity FROM inventory_items WHERE id=?")
      .get(inv.lastInsertRowid);
    console.log("SMOKE_INV_AFTER_ORDER=" + JSON.stringify(invAfterOrder));
    // طلب تاني → رقم فاتورة 2
    const order2 = ordersRepo.create(
      {
        items: [{ product_id: prodInfo.lastInsertRowid, quantity: 1, modifier_option_ids: [] }],
        is_guest: true,
        order_type: "takeaway",
        discount_type: "none",
        discount_value: 0,
        payment_method: "cash",
        amount_paid: 50,
      },
      1,
      "المالك"
    );
    console.log("SMOKE_ORDER2_RECEIPT=" + JSON.stringify(order2.order.receipt_label));
    // رفض الدفع الناقص
    let underpaidRejected = false;
    try {
      ordersRepo.create(
        {
          items: [{ product_id: prodInfo.lastInsertRowid, quantity: 1, modifier_option_ids: [] }],
          is_guest: true,
          order_type: "counter",
          discount_type: "none",
          discount_value: 0,
          payment_method: "cash",
          amount_paid: 1,
        },
        1,
        "المالك"
      );
    } catch {
      underpaidRejected = true;
    }
    console.log("SMOKE_UNDERPAID_REJECTED=" + underpaidRejected);

    // التوصيل كزائر لازم يترفض
    let deliveryGuestRejected = false;
    try {
      ordersRepo.create(
        {
          items: [{ product_id: prodInfo.lastInsertRowid, quantity: 1, modifier_option_ids: [] }],
          is_guest: true,
          order_type: "delivery",
          discount_type: "none",
          discount_value: 0,
          payment_method: "cash",
          amount_paid: 100,
        },
        1,
        "المالك"
      );
    } catch (e) {
      deliveryGuestRejected = e.message;
    }
    console.log("SMOKE_DELIVERY_GUEST_REJECTED=" + JSON.stringify(deliveryGuestRejected));
    // التوصيل بعميل ينجح
    const delivery = ordersRepo.create(
      {
        items: [{ product_id: prodInfo.lastInsertRowid, quantity: 1, modifier_option_ids: [] }],
        customer_id: cust.id,
        is_guest: false,
        order_type: "delivery",
        discount_type: "none",
        discount_value: 0,
        payment_method: "cash",
        amount_paid: 100,
      },
      1,
      "المالك"
    );
    console.log("SMOKE_DELIVERY_OK=" + JSON.stringify(delivery.order.order_type));

    // PRD-06: بروفايل العميل بعد الطلبات
    const custProfile = custRepo.getById(cust.id);
    console.log(
      "SMOKE_CUST_PROFILE=" +
        JSON.stringify({
          visits: custProfile.total_visits,
          spent: custProfile.total_spent,
          avg: custProfile.avg_spent,
          fav: custProfile.favorite_product_name,
          classification: custProfile.classification,
          days_since: custProfile.days_since_last,
        })
    );
    const custOrders = custRepo.getOrders({ customerId: cust.id, page: 1, pageSize: 15 });
    console.log(
      "SMOKE_CUST_ORDERS=" +
        JSON.stringify({
          total: custOrders.total,
          period_visits: custOrders.period_visits,
          period_spent: custOrders.period_spent,
          first_summary: custOrders.rows[0]?.items_summary,
        })
    );

    // PRD-07: الحضور
    const attRepo = require("../dist-electron/electron/repositories/attendance.repository.js").attendanceRepository;
    attRepo.clockIn(1, "تست", 1);
    const statusAfterIn = attRepo.getCurrentStatus().find((s) => s.user_id === 1);
    console.log("SMOKE_ATT_PRESENT=" + JSON.stringify(statusAfterIn.present));
    let doubleInRejected = false;
    try { attRepo.clockIn(1, null, 1); } catch { doubleInRejected = true; }
    console.log("SMOKE_ATT_DOUBLE_IN_REJECTED=" + doubleInRejected);
    attRepo.clockOut(1, null, 1);
    const rows30 = attRepo.getLast30Days({});
    console.log("SMOKE_ATT_ROWS=" + JSON.stringify({ count: rows30.length, dur: rows30[0]?.duration_minutes !== null, has_ids: rows30[0]?.clock_in_id != null }));
    // تعديل وقت الحضور ثم حذف السجل
    const row0 = rows30[0];
    attRepo.updateLog(row0.clock_in_id, "2026-06-05T07:30:00.000Z", 1);
    const afterEdit = attRepo.getLast30Days({}).find((r) => r.clock_in_id === row0.clock_in_id || r.user_id === row0.user_id);
    console.log("SMOKE_ATT_EDITED=" + JSON.stringify(afterEdit ? afterEdit.clock_in : null));
    attRepo.deleteLog(row0.clock_in_id, 1);
    if (row0.clock_out_id) attRepo.deleteLog(row0.clock_out_id, 1);
    const afterDelete = attRepo.getLast30Days({});
    console.log("SMOKE_ATT_AFTER_DELETE=" + JSON.stringify(afterDelete.length));

    // PRD-extra: منتج موزون (بالكيلو) + طلب بكمية عشرية
    const prodRepo = require("../dist-electron/electron/repositories/products.repository.js").productsRepository;
    const weightProd = prodRepo.create(
      { name: "جبنة", category_id: catInfo.lastInsertRowid, price: 100, sale_type: "weight" },
      1
    );
    console.log("SMOKE_WEIGHT_PRODUCT=" + JSON.stringify({ sale_type: weightProd.sale_type }));
    const wOrder = ordersRepo.create(
      {
        items: [{ product_id: weightProd.id, quantity: 0.5, modifier_option_ids: [] }],
        is_guest: true,
        order_type: "counter",
        discount_type: "none",
        discount_value: 0,
        payment_method: "cash",
        amount_paid: 100,
      },
      1,
      "المالك"
    );
    console.log(
      "SMOKE_WEIGHT_ORDER=" +
        JSON.stringify({
          qty: wOrder.order.items[0].quantity,
          unit_price: wOrder.order.items[0].unit_price,
          total: wOrder.order.items[0].total_price,
          sale_type: wOrder.order.items[0].sale_type,
        })
    );

    // PRD-07: المصاريف اليدوية
    const expRepo = require("../dist-electron/electron/repositories/expenses.repository.js").expensesRepository;
    const exp = expRepo.create({ category: "cleaning", amount: 500, description: "تنظيف" }, 1, "المالك");
    console.log("SMOKE_EXPENSE=" + JSON.stringify({ cat: exp.category, drawer: exp.drawer_amount, auto: exp.is_auto }));

    // PRD-07: Restock يسجّل مصروف بضاعة تلقائي (invRepo معرّف فوق)
    // ⚠️ فلوس خارجة من الدرج **لازم** معاها صاحب الدرج (وردية مين) — الحارس ده اتضاف
    // مع نموذج الفلوس X/P/D والسكربت ده فضل بالتوقيع القديم من نسخة الأساس.
    invRepo.restock(inv.lastInsertRowid, 10, "توريد", 1, 50, 300, "cash", undefined, null, 1);
    const todayExpenses = expRepo.getToday();
    const autoExp = todayExpenses.find((e) => e.is_auto);
    console.log("SMOKE_RESTOCK_EXPENSE=" + JSON.stringify(autoExp ? { cat: autoExp.category, amount: autoExp.amount, drawer: autoExp.drawer_amount, auto: autoExp.is_auto } : null));
    const summary = expRepo.getDailySummary(autoExp.expense_date);
    console.log("SMOKE_EXP_SUMMARY=" + JSON.stringify({ total: summary.total_drawer, cats: summary.by_category.length }));
    // حذف المصروف التلقائي مرفوض
    let autoDeleteRejected = false;
    try { expRepo.softDelete(autoExp.id, 1); } catch { autoDeleteRejected = true; }
    console.log("SMOKE_AUTO_DELETE_REJECTED=" + autoDeleteRejected);

    closeDatabase();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("SMOKE_OK");
    app.exit(0);
  } catch (e) {
    console.error("SMOKE_FAIL", e);
    app.exit(1);
  }
});
