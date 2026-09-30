// اختبار صلاحيات الفلوس والأدوار — **من الـIPC نفسه** (مش من الواجهة ومش من المستودع).
//
// ليه من الـIPC: إخفاء كارت في الواجهة مش حماية — أي حد يقدر ينده القناة. الاختبار بيسجّل
// الـhandlers الحقيقية (registerAllIpc) على ipcMain متشال منه التسجيل، ويندهها بفاعل محدد.
//
//   • موظف الصالة: بيشغّل الجلسة ويحاسب ويبيع سريع عادي، **ومايقدرش يشوف فلوس اليوم**
//     (ملخص الرئيسية صفر · فواتير اليوم/التقارير مرفوضة · ملخص الطاولات بلا إيراد).
//   • المدير: بيشوف كل الأرقام.
//   • منتج بالوزن بيتسجّل بالقطعة · دور ديليفري/بائع مرفوض من الـmain · مفيش «بائعين حاضرين».
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-gaming-permissions.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const electron = require("electron");

// ⚠️ لازم قبل أي require لملفات الـIPC — عشان التسجيل يتحفظ هنا بدل ipcMain الحقيقي
const handlers = new Map();
electron.ipcMain.handle = (channel, fn) => handlers.set(channel, fn);

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { registerAllIpc } = require(path.join(base, "ipc", "index.js"));
const { setCurrentActor } = require(path.join(base, "ipc", "session.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}
async function call(channel, input) {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`قناة مش متسجّلة: ${channel}`);
  return fn({}, input);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-gaming-perm-"));

(async () => {
  try {
    initDatabase(dir);
    registerAllIpc();
    const db = getDatabase();

    const insertUser = db.prepare(
      "INSERT INTO users (local_id, name, username, role, is_active, permissions) VALUES (?, ?, ?, ?, 1, ?)"
    );
    const managerId = Number(insertUser.run("u-m", "المدير", "mgr", "manager", "{}").lastInsertRowid);
    const staffId = Number(
      insertUser.run("u-c", "موظف الصالة", "hall", "cashier", JSON.stringify({ canGiveDiscount: false })).lastInsertRowid
    );

    // مشروب + طاولة (المدير)
    const productId = Number(
      db.prepare("INSERT INTO products (local_id, name, price, sync_status) VALUES ('p1','بيبسي',15,'pending')").run()
        .lastInsertRowid
    );
    setCurrentActor(managerId);
    const room = await call("gaming:rooms:save", { name: "طاولة البار" });
    ok(room.ok && room.data.kind === "table", "المدير عمل طاولة");

    // «بائع» حاضر — لو البيع لسه بيسجّل البائعين هيظهر في order_sellers
    const sellerId = Number(insertUser.run("u-s", "بائع قديم", "sel", "seller", "{}").lastInsertRowid);
    db.prepare(
      "INSERT INTO attendance_logs (local_id, user_id, user_name, type, business_date) VALUES ('a1', ?, 'بائع قديم', 'clock_in', '2026-01-01')"
    ).run(sellerId);

    // ===== ① موظف الصالة بيشتغل عادي =====
    console.log("\n— موظف الصالة بيشغّل الطاولات ويبيع —");
    setCurrentActor(staffId);
    const opened = await call("gaming:session:open", { room_id: room.data.id });
    ok(opened.ok, `موظف الصالة فتح جلسة (${opened.ok ? "" : opened.error})`);
    await call("gaming:session:addItem", { session_id: opened.data.id, product_id: productId, quantity: 1 });
    const checkout = await call("gaming:session:checkout", {
      session_id: opened.data.id,
      payment_method: "cash",
      amount_paid: 1000,
      discount_type: "none",
      discount_value: 0,
    });
    ok(checkout.ok && checkout.data.order.total > 0, `موظف الصالة حاسب الجلسة (${checkout.ok ? checkout.data.order.total : checkout.error})`);
    const quick = await call("orders:create", {
      items: [{ product_id: productId, quantity: 2, modifier_option_ids: [] }],
      is_guest: true,
      order_type: "counter",
      discount_type: "none",
      discount_value: 0,
      payment_method: "cash",
      amount_paid: 100,
      source: "pos",
    });
    ok(quick.ok, `موظف الصالة عمل بيع سريع (${quick.ok ? "" : quick.error})`);
    const byId = await call("orders:getById", quick.ok ? quick.data.order.id : 0);
    ok(byId.ok && byId.data, "موظف الصالة يقدر يفتح فاتورة بعينها (سجل مشتريات العميل)");

    // ===== ② موظف الصالة مايشوفش فلوس اليوم =====
    console.log("\n— موظف الصالة مايشوفش فلوس اليوم —");
    const staffSummary = await call("dashboard:getTodaySummary");
    ok(staffSummary.ok, "ملخص الرئيسية شغّال لموظف الصالة (كروت المخزون والتنبيهات)");
    const s = staffSummary.data ?? {};
    ok(
      s.todaySales === 0 && s.todayOrders === 0 && s.avgOrderValue === 0 && s.todayNet === 0,
      `مبيعات/عدد/متوسط/صافي اليوم = صفر لموظف الصالة (${s.todaySales}/${s.todayOrders}/${s.avgOrderValue}/${s.todayNet})`
    );
    ok(Array.isArray(s.recentOrders) && s.recentOrders.length === 0, "آخر الفواتير فاضية لموظف الصالة");
    const todayKey = db.prepare("SELECT business_date FROM orders ORDER BY id DESC LIMIT 1").get().business_date;
    for (const [ch, input] of [
      ["orders:getByDate", { businessDate: todayKey }],
      ["orders:getRecent", { limit: 10 }],
      ["reports:getSalesByDay", todayKey],
      ["reports:getSalesSummary", undefined],
      ["reports:getInventoryStatus", undefined],
    ]) {
      const r = await call(ch, input);
      ok(!r.ok, `${ch} مرفوض لموظف الصالة${r.ok ? " — **رجع بيانات**" : ""}`);
    }
    const roomsSummary = await call("gaming:summary:today");
    ok(roomsSummary.ok && roomsSummary.data.closed_count === 1, "ملخص الطاولات (عدد) شغّال لموظف الصالة");
    ok(roomsSummary.ok && !("time_revenue" in roomsSummary.data), "ملخص الطاولات مافيهوش أي إيراد");

    // ===== ③ المدير بيشوف كله =====
    console.log("\n— المدير بيشوف الأرقام —");
    setCurrentActor(managerId);
    const mgrSummary = await call("dashboard:getTodaySummary");
    ok(mgrSummary.ok && mgrSummary.data.todaySales > 0 && mgrSummary.data.todayOrders === 2, `المدير شايف مبيعات اليوم (${mgrSummary.ok ? mgrSummary.data.todaySales : mgrSummary.error})`);
    const mgrOrders = await call("orders:getByDate", { businessDate: todayKey });
    ok(mgrOrders.ok && mgrOrders.data.length === 2, "المدير شايف فواتير اليوم");
    const mgrReport = await call("reports:getSalesByDay", todayKey);
    ok(mgrReport.ok && mgrReport.data.totalOrders === 2, "المدير شايف تقرير المبيعات");

    // ===== ④ البائعين · الأدوار · الوزن =====
    console.log("\n— الأدوار والمنتجات —");
    const sellersCount = db.prepare("SELECT COUNT(*) c FROM order_sellers").get().c;
    ok(sellersCount === 0, `البيع مابيسجّلش «بائعين حاضرين» (${sellersCount})`);
    for (const role of ["delivery", "seller"]) {
      const r = await call("users:create", {
        name: `جديد ${role}`,
        username: `new-${role}`,
        role,
        attendanceCode: role === "delivery" ? "11111" : "22222",
      });
      ok(!r.ok, `إضافة مستخدم بدور ${role} مرفوضة من الـmain${r.ok ? " — **اتضاف**" : ""}`);
    }
    const hall = await call("users:create", { name: "موظف جديد", username: "hall2", role: "cashier", pin: "1234", attendanceCode: "33333" });
    ok(hall.ok, `إضافة موظف صالة شغّالة (${hall.ok ? "" : hall.error})`);
    const weighed = await call("products:create", {
      name: "لب",
      category_id: null,
      price: 40,
      description: null,
      barcode: null,
      is_active: true,
      is_available: true,
      sale_type: "weight",
      modifiers: [],
    });
    ok(weighed.ok && weighed.data.sale_type === "piece", `منتج مبعوت «بالوزن» اتسجّل بالقطعة (${weighed.ok ? weighed.data.sale_type : weighed.error})`);
    const upd = await call("products:update", { id: weighed.ok ? weighed.data.id : 0, sale_type: "weight" });
    ok(upd.ok && upd.data.sale_type === "piece", "تعديل منتج لـ«بالوزن» بيفضل بالقطعة");

    // ===== ⑤ الطاولات («بلايستيشن + كافيه») من الـIPC =====
    console.log("\n— الطاولات: موظف الصالة بيشغّلها ومايلغيش —");
    setCurrentActor(staffId);
    const staffTable = await call("gaming:rooms:save", { name: "طاولة ممنوعة" });
    ok(!staffTable.ok, "موظف الصالة مايقدرش يضيف طاولة");
    setCurrentActor(managerId);
    const tables = [];
    for (const n of [1, 2, 3]) {
      const t = await call("gaming:rooms:save", { name: `طاولة ${n}`, area: "داخلي" });
      tables.push(t.data);
    }
    ok(tables.every((t) => t && t.kind === "table"), "المدير ضاف 3 طاولات");
    const tList = await call("gaming:rooms:list", {});
    ok(tList.ok && tList.data.length === 4 && tList.data.every((r) => r.kind === "table"), "كل الأماكن طاولات (نسخة «كافيه» مالهاش غرف)");
    ok(!handlers.has("gaming:session:extend") && !handlers.has("gaming:session:switchMode"), "مفيش قنوات مدة/وضع غرف متسجّلة أصلاً");

    setCurrentActor(staffId);
    const tab1 = await call("gaming:session:open", { room_id: tables[0].id });
    const tab2 = await call("gaming:session:open", { room_id: tables[1].id });
    ok(tab1.ok && tab2.ok, `موظف الصالة فتح حسابين طاولات (${tab1.ok ? "" : tab1.error})`);
    await call("gaming:session:addItem", { session_id: tab1.data.id, product_id: productId, quantity: 2 });
    await call("gaming:session:addItem", { session_id: tab2.data.id, product_id: productId, quantity: 1 });
    const moved = await call("gaming:session:transfer", { session_id: tab1.data.id, to_room_id: tables[2].id });
    ok(moved.ok && moved.data.room_id === tables[2].id, `موظف الصالة نقل الحساب (${moved.ok ? "" : moved.error})`);
    const mergedR = await call("gaming:session:merge", { from_session_id: tab2.data.id, into_session_id: tab1.data.id });
    ok(mergedR.ok && mergedR.data.items[0].quantity === 3, `موظف الصالة دمج طاولتين (${mergedR.ok ? "" : mergedR.error})`);
    const cancelTab = await call("gaming:session:cancel", { session_id: tab1.data.id, reason: "تجربة" });
    ok(!cancelTab.ok, "موظف الصالة **مايقدرش** يلغي حساب طاولة (نفس صلاحية إلغاء الطلب)");
    const discounted = await call("gaming:session:splitCheckout", {
      session_id: tab1.data.id,
      payment_method: "cash",
      amount_paid: 100,
      discount_type: "fixed",
      discount_value: 5,
      lines: [{ item_id: mergedR.data.items[0].id, quantity: 1 }],
    });
    ok(!discounted.ok, "تقسيم بخصم مرفوض لموظف من غير صلاحية خصم");
    const part = await call("gaming:session:splitCheckout", {
      session_id: tab1.data.id,
      payment_method: "cash",
      amount_paid: 100,
      discount_type: "none",
      discount_value: 0,
      lines: [{ item_id: mergedR.data.items[0].id, quantity: 1 }],
    });
    ok(part.ok && part.data.order.source === "table_session" && part.data.session.status === "open", `موظف الصالة دفع جزء من الحساب (${part.ok ? "" : part.error})`);
    const tSummary = await call("gaming:summary:today");
    ok(tSummary.ok && tSummary.data.open_count === 1 && !("time_revenue" in tSummary.data), "ملخص الطاولات عدد بس (مفيش فلوس)");
    const audits = db.prepare("SELECT action, entity_type FROM audit_log ORDER BY id").all().map((a) => a.action);
    ok(audits.some((a) => a.includes("نقل") && a.includes("طاولة")), "النقل متسجّل في سجل التدقيق");
    ok(audits.some((a) => a.includes("دمج طاولة")), "الدمج متسجّل في سجل التدقيق");
    ok(audits.some((a) => a.startsWith("إضافة طاولة")), "إضافة الطاولة متسجّلة بلفظ «طاولة»");
    setCurrentActor(managerId);
    const mgrCancel = await call("gaming:session:cancel", { session_id: tab1.data.id, reason: "اتفتح غلط" });
    ok(mgrCancel.ok, `المدير يقدر يلغي حساب الطاولة (${mgrCancel.ok ? "" : mgrCancel.error})`);
    const cancelAudit = db.prepare("SELECT action FROM audit_log ORDER BY id DESC LIMIT 1").get().action;
    ok(cancelAudit.startsWith("إلغاء") && cancelAudit.includes("طاولة"), `إلغاء الطاولة متسجّل بلفظ «طاولة» (${cancelAudit})`);

    closeDatabase();
  } catch (e) {
    ok(false, `استثناء: ${e instanceof Error ? e.stack : e}`);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ويندوز */
    }
    console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ صلاحيات الفلوس والأدوار سليمة");
    process.exit(process.exitCode ?? 0);
  }
})();
