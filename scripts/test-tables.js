// اختبار الطاولات (نسخة «كافيه» بس) — **من وصلة الواجهة** (gamingRepository → ordersRepository.create).
//
//   • كل مكان طاولة (kind=table) سعرها صفر، ومافيش أي غرف ولا تسعير وقت.
//   • الحساب = فاتورة source='table_session' **من غير بند وقت** + session_id على الفاتورة.
//   • نقل الحساب لطاولة فاضية · دمج طاولتين (البنود بتتجمع والتانية merged) · تقسيم الفاتورة
//     (فاتورة لكل جزء، مجموعهم = الكل، والمخزون بيتخصم مرة واحدة بس).
//   • مفيش غرف: فتح حساب على صف غرفة قديم مرفوض برسالة واضحة.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-tables.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { gamingRepository } = require(path.join(base, "repositories", "gaming.repository.js"));
const { ordersRepository } = require(path.join(base, "repositories", "orders.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}
function rejects(fn, m, contains) {
  try {
    fn();
    ok(false, `${m} — عدّى وهو المفروض يترفض`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ok(!contains || msg.includes(contains), `${m}${contains ? ` («${msg}»)` : ""}`);
  }
}
const near = (a, b) => Math.abs(a - b) < 0.001;
const cash = (extra) => ({ payment_method: "cash", amount_paid: 1000, discount_type: "none", discount_value: 0, ...extra });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-tables-"));
try {
  initDatabase(dir);
  const db = getDatabase();
  const actorId = Number(
    db.prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u1','مدير','m','manager',1)").run()
      .lastInsertRowid
  );
  const actor = { id: actorId, name: "مدير" };

  const invId = Number(
    db.prepare(
      "INSERT INTO inventory_items (local_id, name, unit, current_quantity, alert_threshold, cost_per_unit, status, sync_status) VALUES ('inv-c','بن','جرام',100,1,1,'sufficient','pending')"
    ).run().lastInsertRowid
  );
  const cat = Number(db.prepare("INSERT INTO categories (local_id, name, icon, sort_order, sync_status) VALUES ('cat','مشروبات','cup',1,'pending')").run().lastInsertRowid);
  const coffee = Number(db.prepare("INSERT INTO products (local_id, name, price, category_id, sync_status) VALUES ('p-c','قهوة',20,?,'pending')").run(cat).lastInsertRowid);
  db.prepare(
    "INSERT INTO product_recipes (local_id, product_id, inventory_item_id, inventory_item_name, unit, standard_qty, sync_status) VALUES ('rec',?,?,'بن','جرام',10,'pending')"
  ).run(coffee, invId);
  const cake = Number(db.prepare("INSERT INTO products (local_id, name, price, category_id, sync_status) VALUES ('p-k','كيكة',35,?,'pending')").run(cat).lastInsertRowid);
  const stock = () => db.prepare("SELECT current_quantity FROM inventory_items WHERE id = ?").get(invId).current_quantity;
  const queue = (type) => db.prepare("SELECT event_type, payload FROM sync_queue WHERE entity_type = ? ORDER BY id").all(type);

  // ===== ① الطاولات =====
  console.log("\n— الطاولات —");
  // ⚠️ بيانات متلعوب فيها (سعر وجهاز ونوع غرفة) — المفروض تتجاهل كلها
  const t1 = gamingRepository.saveRoom({ name: "طاولة 1", area: "داخلي", kind: "room", rate_single: 50, device_label: "PS5" }, actorId).room;
  const t2 = gamingRepository.saveRoom({ name: "طاولة 2", area: "خارجي" }, actorId).room;
  const t3 = gamingRepository.saveRoom({ name: "طاولة 3", area: "خارجي" }, actorId).room;
  ok(t1.kind === "table" && t1.area === "داخلي", "طاولة اتعملت بنوعها ومنطقتها");
  const t1Row = db.prepare("SELECT kind, rate_single, rate_multi, device_label FROM gaming_rooms WHERE id = ?").get(t1.id);
  ok(t1Row.kind === "table" && t1Row.rate_single === 0 && t1Row.rate_multi === 0 && t1Row.device_label === null, "حتى لو اتبعت نوع غرفة وسعر وجهاز: بتتحفظ طاولة سعرها صفر");
  ok(gamingRepository.listRooms(false).length === 3 && gamingRepository.listRooms(false).every((r) => r.kind === "table"), "القايمة فيها الـ3 طاولات بس");
  const roomPayload = JSON.parse(queue("gaming_room").find((q) => JSON.parse(q.payload).local_id === t1.local_id).payload);
  ok(roomPayload.kind === "table" && roomPayload.area === "داخلي", "المزامنة: gaming_room بيبعت kind وarea");

  // ===== ② فتح حساب + طلبات + حساب =====
  console.log("\n— حساب طاولة كامل —");
  let tab = gamingRepository.openSession({ room_id: t1.id }, actor);
  ok(tab.kind === "table" && tab.status === "open", "الحساب اتفتح من نوع table");
  ok(!("segments" in tab) && !("planned_minutes" in tab), "مفيش فترات وقت ولا مدة محددة أصلاً");
  ok(tab.session_label.startsWith("حساب #"), `اللافتة «حساب #…» (${tab.session_label})`);
  rejects(() => gamingRepository.openSession({ room_id: t1.id }, actor), "حساب تاني على نفس الطاولة مرفوض", "شغّال");
  ok(typeof gamingRepository.switchMode === "undefined" && typeof gamingRepository.extendSession === "undefined", "مفيش وضع ولا تمديد أصلاً");

  tab = gamingRepository.addItem({ session_id: tab.id, product_id: coffee, quantity: 2 }, actor);
  tab = gamingRepository.addItem({ session_id: tab.id, product_id: cake, quantity: 1 }, actor);
  const q = gamingRepository.quote(tab.id);
  ok(near(q.total, 75) && !("time_price" in q), `العرض = الطلبات 75 من غير أي سعر وقت (الفعلي ${q.total})`);
  // سفر زمني: القعدة بقالها 40 دقيقة
  db.prepare("UPDATE gaming_sessions SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 40 * 60_000).toISOString(), tab.id);
  const stock0 = stock();
  const res = gamingRepository.checkout({ session_id: tab.id, ...cash() }, actor);
  ok(res.order.source === "table_session", `الفاتورة source=table_session (الفعلي ${res.order.source})`);
  ok(near(res.order.total, 75), "إجمالي الفاتورة = الطلبات بالظبط");
  ok(res.order.items.every((i) => i.product_id != null), "مفيش بند بلا منتج (مفيش «وقت لعب»)");
  ok(res.session.status === "closed" && res.session.order_id === res.order.id, "الحساب اتقفل ومربوط بالفاتورة");
  ok(!("time_amount" in res.session), "مفيش تمن وقت في الحساب أصلاً");
  ok(res.session.actual_minutes >= 39.9, `مدة القعدة الفعلية اتسجّلت (${res.session.actual_minutes})`);
  ok(stock0 - stock() === 20, "المخزون اتخصم للطلبات (2 قهوة × 10 جرام)");
  const orderRow = db.prepare("SELECT session_id FROM orders WHERE id = ?").get(res.order.id);
  ok(orderRow.session_id === tab.id, "orders.session_id = الحساب");
  const orderPayload = JSON.parse(queue("order").pop().payload);
  ok(orderPayload.session_id === tab.id && orderPayload.source === "table_session", "المزامنة: الفاتورة بتبعت session_id وsource");
  const sPayload = JSON.parse(queue("gaming_session").pop().payload);
  ok(sPayload.kind === "table" && sPayload.status === "closed", "المزامنة: الحساب بيبعت kind");
  ok(sPayload.time_amount === 0 && sPayload.billed_minutes === 0 && Array.isArray(sPayload.segments) && sPayload.segments.length === 0, "المزامنة: نفس شكل الجلسة القديم (وقت صفر · فترات فاضية) — عقد الويب زي ما هو");
  ok(ordersRepository.getById(res.order.id).source === "table_session", "toDTO بيعدّي table_session (مش بيحوّلها pos)");
  rejects(() => gamingRepository.checkout({ session_id: gamingRepository.openSession({ room_id: t2.id }, actor).id, ...cash() }, actor), "حساب فاضي مايتقفلش بفاتورة", "الإلغاء");

  // ===== ③ النقل =====
  console.log("\n— نقل الحساب —");
  const open2 = db.prepare("SELECT id FROM gaming_sessions WHERE room_id = ? AND status='open'").get(t2.id).id;
  let a = gamingRepository.openSession({ room_id: t1.id }, actor);
  a = gamingRepository.addItem({ session_id: a.id, product_id: coffee, quantity: 1 }, actor);
  rejects(() => gamingRepository.transferSession(a.id, t2.id), "النقل لطاولة عليها حساب مرفوض", "طاولة 2");
  rejects(() => gamingRepository.transferSession(a.id, t1.id), "النقل لنفس الطاولة مرفوض");
  a = gamingRepository.transferSession(a.id, t3.id);
  ok(a.room_id === t3.id && a.room_name === "طاولة 3" && a.items.length === 1, "الحساب اتنقل لطاولة 3 بطلباته");
  ok(!db.prepare("SELECT 1 FROM gaming_sessions WHERE room_id = ? AND status='open'").get(t1.id), "طاولة 1 بقت فاضية");
  ok(JSON.parse(queue("gaming_session").pop().payload).room_id === t3.id, "المزامنة: النقل اتبعت UPDATED");

  // ===== ④ الدمج =====
  console.log("\n— دمج طاولتين —");
  let b = gamingRepository.addItem({ session_id: open2, product_id: coffee, quantity: 2 }, actor);
  b = gamingRepository.addItem({ session_id: open2, product_id: cake, quantity: 1 }, actor);
  rejects(() => gamingRepository.mergeSessions(a.id, a.id), "دمج الحساب في نفسه مرفوض");
  const merged = gamingRepository.mergeSessions(b.id, a.id);
  const coffeeLine = merged.items.find((i) => i.product_id === coffee);
  ok(coffeeLine && coffeeLine.quantity === 3, `القهوة اتجمعت في بند واحد (3) — الفعلي ${coffeeLine && coffeeLine.quantity}`);
  ok(merged.items.length === 2, "الحساب فيه قهوة وكيكة");
  const bRow = db.prepare("SELECT status, merged_into_id, ended_at FROM gaming_sessions WHERE id = ?").get(b.id);
  ok(bRow.status === "merged" && bRow.merged_into_id === a.id && !!bRow.ended_at, "الحساب التاني بقى merged ومربوط بالأول");
  ok(db.prepare("SELECT COUNT(*) c FROM gaming_session_items WHERE session_id = ?").get(b.id).c === 0, "مفيش بنود فاضلة على الحساب اللي اتدمج");
  ok(!db.prepare("SELECT 1 FROM gaming_sessions WHERE room_id = ? AND status='open'").get(t2.id), "طاولة 2 بقت فاضية");
  rejects(() => gamingRepository.mergeSessions(b.id, a.id), "دمج حساب اتدمج قبل كده مرفوض");
  const mergedPayload = queue("gaming_session").map((x) => JSON.parse(x.payload)).filter((p) => p.local_id === b.local_id).pop();
  ok(mergedPayload.status === "merged" && mergedPayload.merged_into_id === a.id, "المزامنة: الدمج بيبعت merged_into_id");

  // ===== ⑤ تقسيم الفاتورة =====
  console.log("\n— تقسيم الفاتورة —");
  const ordersBefore = db.prepare("SELECT COUNT(*) c FROM orders").get().c;
  const stockBefore = stock();
  const coffeeItem = merged.items.find((i) => i.product_id === coffee);
  const cakeItem = merged.items.find((i) => i.product_id === cake);
  rejects(
    () => gamingRepository.splitCheckout({ session_id: a.id, ...cash(), lines: [{ item_id: coffeeItem.id, quantity: 4 }] }, actor),
    "تقسيم بكمية أكبر من اللي على الحساب مرفوض"
  );
  rejects(() => gamingRepository.splitCheckout({ session_id: a.id, ...cash(), lines: [] }, actor), "تقسيم من غير بنود مرفوض");
  // عرض الجزء من السيرفر بنفس تسعير الفاتورة (الواجهة مابتحسبش لوحدها)
  const sq = gamingRepository.quoteSplit(a.id, [{ item_id: coffeeItem.id, quantity: 2 }], "fixed", 5);
  ok(near(sq.subtotal, 40) && near(sq.discount_amount, 5) && near(sq.total, 35), `عرض الجزء: 40 − خصم 5 = 35 (الفعلي ${sq.total})`);
  rejects(() => gamingRepository.quoteSplit(a.id, [{ item_id: coffeeItem.id, quantity: 9 }]), "عرض جزء بكمية أكبر من الحساب مرفوض");
  const part1 = gamingRepository.splitCheckout({ session_id: a.id, ...cash(), lines: [{ item_id: coffeeItem.id, quantity: 2 }] }, actor);
  ok(part1.order.source === "table_session" && near(part1.order.total, 40), `الجزء الأول: 2 قهوة = 40 (الفعلي ${part1.order.total})`);
  ok(part1.session.status === "open", "الحساب لسه مفتوح بالباقي");
  const left = part1.session.items;
  ok(left.find((i) => i.product_id === coffee)?.quantity === 1 && left.find((i) => i.product_id === cake)?.quantity === 1, "الباقي: قهوة 1 + كيكة 1");
  const part2 = gamingRepository.splitCheckout(
    { session_id: a.id, ...cash(), lines: left.map((i) => ({ item_id: i.id, quantity: i.quantity })) },
    actor
  );
  ok(near(part2.order.total, 55), `الجزء التاني: قهوة + كيكة = 55 (الفعلي ${part2.order.total})`);
  ok(part2.session.status === "closed" && part2.session.order_id === part2.order.id, "آخر جزء قفل الحساب");
  ok(db.prepare("SELECT COUNT(*) c FROM orders").get().c - ordersBefore === 2, "فاتورتين بالظبط");
  const sumSplit = db.prepare("SELECT SUM(total) s, COUNT(DISTINCT session_id) n FROM orders WHERE session_id = ?").get(a.id);
  ok(near(sumSplit.s, 95) && sumSplit.n === 1, "الفاتورتين مربوطين بنفس الحساب ومجموعهم = الكل (95)");
  ok(stockBefore - stock() === 30, "المخزون اتخصم مرة واحدة (3 قهوة × 10) — مش مرتين");

  // ===== ⑥ مفيش غرف =====
  console.log("\n— مفيش غرف —");
  // صف غرفة قديم (مثلاً داتا اتنقلت بالغلط) — مايتفتحش عليه حساب ومابيظهرش في القايمة
  db.prepare("INSERT INTO gaming_rooms (local_id,kind,name,rate_single,rate_multi,created_at) VALUES ('old-room','room','غرفة قديمة',40,60,?)").run(new Date().toISOString());
  const oldRoom = db.prepare("SELECT id FROM gaming_rooms WHERE local_id='old-room'").get().id;
  rejects(() => gamingRepository.openSession({ room_id: oldRoom }, actor), "فتح حساب على غرفة مرفوض", "للكافيه");
  rejects(() => gamingRepository.transferSession(a.id, oldRoom), "النقل لغرفة مرفوض");
  ok(!gamingRepository.listRooms(true).some((r) => r.id === oldRoom), "الغرفة القديمة مش ظاهرة في قايمة الطاولات");
  const board = gamingRepository.getBoard();
  ok(board.tables.length === 3 && board.sessions.every((s) => s.kind === "table"), "لوحة الطاولات فيها الطاولات بس");
  ok(tab.session_label.startsWith("حساب #"), "اللافتة «حساب #» مش «جلسة #»");
  closeDatabase();
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ويندوز */
  }
}

console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ الطاولات سليمة end-to-end");
process.exit(process.exitCode ?? 0);
