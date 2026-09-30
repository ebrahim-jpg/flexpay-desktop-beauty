// اختبار end-to-end للجرد على قاعدة فعلية — مع منطق نسبة التهدير.
// تشغيل: node scripts/run-electron.js scripts/test-stocktake.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase } = require(path.join(base, "database", "connection.js"));
const { stocktakeRepository } = require(path.join(base, "repositories", "stocktake.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-stk-"));
try {
  initDatabase(dir);
  const db = getDatabase();

  const u = db
    .prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u1','مدير','m','manager',1)")
    .run();
  const actor = Number(u.lastInsertRowid);

  const mk = (lid, name, cat, qty, cost, waste = 0) =>
    Number(
      db
        .prepare(
          "INSERT INTO inventory_items (local_id,name,unit,alert_threshold,current_quantity,cost_per_unit,waste_percentage,category) VALUES (?,?,?,?,?,?,?,?)"
        )
        .run(lid, name, "كيلو", 2, qty, cost, waste, cat).lastInsertRowid
    );
  const pepsi = mk("i1", "بيبسي", "مشروبات", 10, 5); // waste 0
  const seven = mk("i2", "سفن", "مشروبات", 4, 5); // waste 0
  const flour = mk("i3", "دقيق", "مخبوزات", 8, 3); // برّه النطاق
  const coffeeOk = mk("i4", "بن مظبوط", "مشروبات", 50, 4, 2); // band [49,50]
  const coffeeShort = mk("i5", "بن ناقص", "مشروبات", 50, 4, 2); // band [49,50]

  // نطاق مشروبات → 4 مواد (pepsi, seven, coffeeOk, coffeeShort)
  const rows = stocktakeRepository.getCountRows({ type: "categories", categories: ["مشروبات"] });
  ok(rows.length === 4, `نطاق مشروبات = 4 (${rows.length})`);
  const coffeeRow = rows.find((r) => r.inventory_item_id === coffeeOk);
  ok(Math.abs(coffeeRow.expected_min - 49) < 0.001, `البن: المسموح حتى ${coffeeRow.expected_min} (49)`);
  ok(coffeeRow.waste_percentage === 2, "البن: نسبة تهدير 2%");

  // تنفيذ:
  //  بيبسي 10→5 (عجز 5×5=25) | سفن 4→6 (زيادة 2×5=10)
  //  بن مظبوط 50→49 (جوه التهدير = تمام، variance 0) لكن المخزون يتظبط لـ49
  //  بن ناقص 50→45 (تحت 49 → عجز 4×4=16، مش 5)
  const stk = stocktakeRepository.commitStocktake(
    {
      reference: "جرد التهدير",
      scope: { type: "categories", categories: ["مشروبات"] },
      items: [
        { inventory_item_id: pepsi, counted_qty: 5 },
        { inventory_item_id: seven, counted_qty: 6 },
        { inventory_item_id: coffeeOk, counted_qty: 49 },
        { inventory_item_id: coffeeShort, counted_qty: 45 },
      ],
    },
    actor
  );

  // مجاميع: عجز = 25 + 16 = 41، زيادة = 10، صافي = -31
  ok(Math.abs(stk.shortage_value - 41) < 0.001, `العجز = ${stk.shortage_value} (41)`);
  ok(Math.abs(stk.surplus_value - 10) < 0.001, `الزيادة = ${stk.surplus_value} (10)`);
  ok(Math.abs(stk.variance_value - -31) < 0.001, `الصافي = ${stk.variance_value} (-31)`);

  const item = (id) => stk.items.find((i) => i.inventory_item_id === id);

  // البن المظبوط: جوه التهدير → variance 0 (تمام)، لكن المخزون اتظبط لـ49
  const co = item(coffeeOk);
  ok(co.variance_qty === 0, `بن مظبوط: variance 0 (تمام جوه التهدير) — كان ${co.variance_qty}`);
  ok(Math.abs(co.expected_min - 49) < 0.001, "بن مظبوط: expected_min = 49 محفوظ");
  ok(co.variance_value === 0, "بن مظبوط: مفيش قيمة عجز/زيادة");

  // البن الناقص: تحت 49 → عجز يتقاس من 49 (= -4 مش -5)
  const cs = item(coffeeShort);
  ok(cs.variance_qty === -4, `بن ناقص: عجز -4 (من حد التهدير مش -5) — كان ${cs.variance_qty}`);
  ok(Math.abs(cs.variance_value - -16) < 0.001, `بن ناقص: قيمة العجز -16 (${cs.variance_value})`);

  // الكميات اتظبطت للفعلي (حتى المظبوط)
  const q = (id) => db.prepare("SELECT current_quantity AS q, waste_percentage AS w FROM inventory_items WHERE id=?").get(id);
  ok(q(coffeeOk).q === 49, `بن مظبوط: المخزون اتظبط لـ49 (${q(coffeeOk).q})`);
  ok(q(coffeeOk).w === 2, "بن مظبوط: نسبة التهدير فضلت 2% بعد الضبط");
  ok(q(coffeeShort).q === 45, `بن ناقص: المخزون اتظبط لـ45 (${q(coffeeShort).q})`);

  // حركة تسوية للبن المظبوط (50→49) موجودة بفرق فعلي -1 رغم إن الجرد تمام
  const coTx = db
    .prepare("SELECT quantity FROM inventory_transactions WHERE type='stocktake' AND item_id=?")
    .get(coffeeOk);
  ok(coTx && coTx.quantity === -1, `حركة البن المظبوط = ${coTx?.quantity} (-1 فعلي رغم إنه تمام)`);

  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ الجرد + منطق التهدير سليم end-to-end");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}
