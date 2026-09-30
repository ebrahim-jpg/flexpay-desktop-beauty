// اختبار إلغاء طلبات المتجر — **الإلغاء لازم يوصل للويب**.
//
// الباج اللي السكربت ده بيحرسه:
//   ① `cancel()` كانت بتغيّر الحالة محلياً بس من غير ما تعلّم حاجة للرفع، و
//      `pendingCompletions()` بتشترط desktop_order_id → الإلغاء عمره ما وصل للويب.
//   ② الأخطر: الكاشير يضرب طلب متجر وبعدين يلغي الفاتورة → الزبون يفضل شايف
//      «اتسلّم 🎉» للأبد لأن إلغاء الفاتورة مكانش بيلمس الطلب الأونلاين.
//
// تشغيل: node scripts/run-electron.js scripts/test-online-order-cancel.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron");
const { initDatabase, getDatabase } = require(path.join(base, "electron", "database", "connection.js"));
const { onlineOrdersRepository } = require(path.join(base, "electron", "repositories", "online-orders.repository.js"));
const { ordersRepository } = require(path.join(base, "electron", "repositories", "orders.repository.js"));
const { productsRepository } = require(path.join(base, "electron", "repositories", "products.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-oo-cancel-"));
try {
  initDatabase(dir);
  const db = getDatabase();

  const actor = Number(
    db
      .prepare(
        "INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u1','مدير','m','manager',1)"
      )
      .run().lastInsertRowid
  );

  // التجزئة: المنتج نفسه وحدة البيع (مفيش مقاسات)
  const product = productsRepository.create(
    { name: "مياه معدنية", category_id: null, price: 100 },
    actor
  );
  const prod = product.id;

  // بنود الفاتورة — نفس شكل اللي الواجهة بتبعته
  const orderItems = () => [
    { product_id: prod, quantity: 1, modifier_option_ids: [] },
  ];
  // create بترجّع { order, change } — مش الـDTO مباشرةً
  const mkOrder = (onlineLocalId) =>
    ordersRepository.create(
      {
        items: orderItems(),
        is_guest: true,
        order_type: "counter",
        discount_type: "none",
        discount_value: 0,
        payment_method: "cash",
        amount_paid: 100,
        ...(onlineLocalId ? { online_order_local_id: onlineLocalId } : {}),
      },
      actor,
      "مدير"
    ).order;

  const pull = (localId) => [
    {
      local_id: localId,
      customer: { name: "زبون", phone: "01000000000", address: null, notes: null },
      items: [
        {
          product_desktop_id: prod,
          name: "مياه معدنية",
          price: 100,
          quantity: 1,
          sale_type: "piece",
          notes: null,
          variant_desktop_id: null,
          variant_color: null,
          variant_size: null,
        },
      ],
      subtotal: 100,
      created_at: new Date().toISOString(),
    },
  ];

  // ===== ① رفض الطلب من شاشة طلبات المتجر =====
  onlineOrdersRepository.upsertPulled(pull("oo-1"));
  ok(onlineOrdersRepository.getByLocalId("oo-1").status === "new", "الطلب المسحوب حالته new");
  ok(onlineOrdersRepository.pendingCancellations().length === 0, "مفيش إلغاءات معلّقة في البداية");

  onlineOrdersRepository.cancel("oo-1", "الزبون لغى");
  const o1 = onlineOrdersRepository.getByLocalId("oo-1");
  ok(o1.status === "cancelled", "بعد الرفض الحالة cancelled");
  ok(o1.cancel_reason === "الزبون لغى", "السبب اتحفظ");

  let pend = onlineOrdersRepository.pendingCancellations();
  ok(pend.length === 1 && pend[0].local_id === "oo-1", "الإلغاء ظهر في قايمة الرفع (ده جوهر الإصلاح)");
  ok(pend[0].reason === "الزبون لغى", "السبب بيترفع مع الإلغاء");

  onlineOrdersRepository.markCancelSynced(["oo-1"]);
  ok(onlineOrdersRepository.pendingCancellations().length === 0, "بعد الرفع مايرجعش تاني (idempotent)");

  // رفض بلا سبب — السبب اختياري
  onlineOrdersRepository.upsertPulled(pull("oo-2"));
  onlineOrdersRepository.cancel("oo-2", null);
  pend = onlineOrdersRepository.pendingCancellations();
  ok(pend.length === 1 && pend[0].reason === null, "الرفض بلا سبب شغّال والسبب null");
  onlineOrdersRepository.markCancelSynced(["oo-2"]);

  // ===== ② الطلب اتضرب ثم اتلغت فاتورته =====
  onlineOrdersRepository.upsertPulled(pull("oo-3"));
  const order = mkOrder("oo-3");
  const o3 = onlineOrdersRepository.getByLocalId("oo-3");
  ok(o3.status === "done", "بعد الضرب الطلب done");
  ok(o3.desktop_order_id === order.id, "الطلب اتربط بالبيعة");
  ok(
    onlineOrdersRepository.pendingCompletions().some((c) => c.local_id === "oo-3"),
    "الضرب اتعلّم للرفع"
  );
  ok(onlineOrdersRepository.pendingCancellations().length === 0, "طلب مضروب مش ملغي — مفيش رفع كاذب");
  onlineOrdersRepository.markCompletionSynced(["oo-3"]);

  // إلغاء الفاتورة → لازم يلغي الطلب الأونلاين ويعلّمه للرفع
  ordersRepository.cancel(order.id, "غلطة", actor);
  const o3b = onlineOrdersRepository.getByLocalId("oo-3");
  ok(o3b.status === "cancelled", "إلغاء الفاتورة لغى الطلب الأونلاين (الباج الحي)");
  ok(
    onlineOrdersRepository.pendingCancellations().some((c) => c.local_id === "oo-3"),
    "الإلغاء اتعلّم للرفع فالزبون هيشوف «ملغي» بدل «اتسلّم»"
  );

  // ===== ③ إعادة الضرب بعد الإلغاء (مخرج الطريق المسدود) =====
  onlineOrdersRepository.markCancelSynced(["oo-3"]);
  const order2 = mkOrder("oo-3");
  const o3c = onlineOrdersRepository.getByLocalId("oo-3");
  ok(o3c.status === "done", "إعادة الضرب رجّعت الطلب done");
  ok(o3c.desktop_order_id === order2.id, "اتربط بالبيعة الجديدة");
  ok(
    onlineOrdersRepository.pendingCompletions().some((c) => c.local_id === "oo-3"),
    "الاكتمال الجديد اتعلّم للرفع (الزبون يرجع يشوف «اتسلّم»)"
  );

  // ===== ④ فاتورة عادية (مش من المتجر) مالهاش أي أثر =====
  const plain = mkOrder(null);
  const before = onlineOrdersRepository.pendingCancellations().length;
  ordersRepository.cancel(plain.id, "مرتجع", actor);
  ok(
    onlineOrdersRepository.pendingCancellations().length === before,
    "إلغاء فاتورة عادية مالوش أي أثر على طلبات المتجر"
  );

  console.log("\nONLINE_ORDER_CANCEL_TEST_OK");
} catch (e) {
  // من غير الـcatch ده الاستثناء بيهرب من الـfinally وElectron بيفضل معلّق بلا أي
  // مخرجات — الخطأ لازم يبان.
  console.error("✗ FAIL — استثناء:", e && e.stack ? e.stack : e);
  process.exitCode = 1;
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
// إلكترون مابيخرجش لوحده لما السكربت يخلص — نخرج صراحةً بكود النتيجة.
process.exit(process.exitCode ?? 0);
