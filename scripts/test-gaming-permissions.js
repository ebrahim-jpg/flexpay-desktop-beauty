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

    // الحلاق اللي الجلسة هتتفتح باسمه
    const stylistId = Number(insertUser.run("u-h", "سماح", "samah", "stylist", "{}").lastInsertRowid);

    // «بائع» حاضر من نسخة التجزئة — ⚠️ في التجميل الإسناد **صريح** مش بالحضور،
    // فالبائع الحاضر ده **مالوش** يظهر في order_sellers. الفحص تحت بيثبت ده.
    const sellerId = Number(insertUser.run("u-s", "بائع قديم", "sel", "seller", "{}").lastInsertRowid);
    db.prepare(
      "INSERT INTO attendance_logs (local_id, user_id, user_name, type, business_date) VALUES ('a1', ?, 'بائع قديم', 'clock_in', '2026-01-01')"
    ).run(sellerId);

    // ===== ① موظف الصالة بيشتغل عادي =====
    console.log("\n— موظف الصالة بيشغّل الطاولات ويبيع —");
    setCurrentActor(staffId);
    const opened = await call("gaming:session:open", { room_id: room.data.id, staff_id: stylistId });
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
    // ⚠️ الفرق الجوهري عن التجزئة: الإسناد هنا **صريح من الجلسة** مش «كل البائعين
    // الحاضرين». «بائع قديم» فوق حاضر وماعملش أي خدمة — لازم يطلع صفر، والحلاق
    // الحقيقي ياخد الفلوس كلها. لو الإسناد رجع للحضور، الفحص ده بيوقع.
    const sellers = db
      .prepare("SELECT seller_id, seller_name, attributed_amount FROM order_sellers")
      .all();
    ok(
      sellers.every((s) => s.seller_id !== sellerId),
      `«البائع الحاضر» مش في الإسناد (${sellers.map((s) => s.seller_name).join(" · ") || "مفيش"})`
    );
    ok(
      sellers.length > 0 && sellers.every((s) => s.seller_id === stylistId),
      `الإسناد للحلاق اللي فتح الجلسة بس (${sellers.length} صف)`
    );
    // ⚠️ كود حضور **مختلف لكل واحد**، وإلا الرفض يحصل بسبب تكرار الكود
    // فالفحص يبقى أخضر من غير ما الدور يكون مرفوض فعلاً.
    const BANNED = ["delivery", "seller", "waiter", "chef"];
    for (let bi = 0; bi < BANNED.length; bi++) {
      const role = BANNED[bi];
      const r = await call("users:create", {
        name: `جديد ${role}`,
        username: `new-${role}`,
        role,
        attendanceCode: `9000${bi}`,
      });
      ok(!r.ok, `إضافة مستخدم بدور ${role} مرفوضة من الـmain${r.ok ? " — **اتضاف**" : ""}`);
    }
    const hall = await call("users:create", { name: "موظف جديد", username: "hall2", role: "cashier", pin: "1234", attendanceCode: "33333" });
    ok(hall.ok, `إضافة موظف صالة شغّالة (${hall.ok ? "" : hall.error})`);
    const newStylist = await call("users:create", { name: "حلاق جديد", username: "st2", role: "stylist", pin: "4321", attendanceCode: "44444" });
    ok(newStylist.ok, `وإضافة حلاق شغّالة (${newStylist.ok ? "" : newStylist.error})`);
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
    const tab1 = await call("gaming:session:open", { room_id: tables[0].id, staff_id: stylistId });
    const tab2 = await call("gaming:session:open", { room_id: tables[1].id, staff_id: stylistId });
    ok(tab1.ok && tab2.ok, `موظف الصالة فتح حسابين طاولات (${tab1.ok ? "" : tab1.error})`);
    await call("gaming:session:addItem", { session_id: tab1.data.id, product_id: productId, quantity: 2 });
    await call("gaming:session:addItem", { session_id: tab2.data.id, product_id: productId, quantity: 1 });
    const moved = await call("gaming:session:transfer", { session_id: tab1.data.id, to_room_id: tables[2].id });
    ok(moved.ok && moved.data.room_id === tables[2].id, `موظف الصالة نقل الحساب (${moved.ok ? "" : moved.error})`);
    // ⚠️ الدمج والتقسيم **اتشالوا من نسخة التجميل**. الدمج كان بيمسح نصيب
    // حلاق (بندين متشابهين بحلاقين بيبقوا صف واحد باسم واحد). الفحص بقى على
    // إن القنوات **مش متسجّلة أصلاً** — مفيش باب خلفي من الـrenderer.
    for (const dead of ["gaming:session:merge", "gaming:session:splitCheckout", "gaming:session:quoteSplit"]) {
      ok(!handlers.has(dead), `قناة ${dead} **مش متسجّلة**${handlers.has(dead) ? " — رجعت!" : ""}`);
    }
    const cancelTab = await call("gaming:session:cancel", { session_id: tab1.data.id, reason: "تجربة" });
    ok(!cancelTab.ok, "موظف الصالة **مايقدرش** يلغي حساب طاولة (نفس صلاحية إلغاء الطلب)");
    const tSummary = await call("gaming:summary:today");
    ok(tSummary.ok && tSummary.data.open_count === 2 && !("time_revenue" in tSummary.data), `ملخص الكراسي عدد بس ومفيش فلوس (المفتوح ${tSummary.ok ? tSummary.data.open_count : "?"})`);
    const audits = db.prepare("SELECT action, entity_type FROM audit_log ORDER BY id").all().map((a) => a.action);
    ok(audits.some((a) => a.includes("نقل") && a.includes("طاولة")), "النقل متسجّل في سجل التدقيق");
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
