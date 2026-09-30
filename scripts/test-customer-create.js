// اختبار: رقم العميل لازم 11 رقم، والاسم اختياري (يتعبّى بالرقم لو فاضي).
// تشغيل: node scripts/run-electron.js scripts/test-customer-create.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase } = require(path.join(base, "database", "connection.js"));
const { customersRepository } = require(path.join(base, "repositories", "customers.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-cust-"));
try {
  initDatabase(dir);

  // 1) رقم 11 من غير اسم → الاسم = الرقم
  const c1 = customersRepository.create({ name: "", phone: "01012345678" }, 1);
  ok(c1.phone === "01012345678", "اتسجّل برقم 11");
  ok(c1.name === "01012345678", `الاسم فاضي → اتعبّى بالرقم (${c1.name})`);

  // 2) رقم 11 مع اسم → الاسم محفوظ
  const c2 = customersRepository.create({ name: "أحمد", phone: "01112345678", gender: "male" }, 1);
  ok(c2.name === "أحمد" && c2.gender === "male", "الاسم والجنس محفوظين");

  // 3) رقم مش 11 → مرفوض
  let rejShort = false;
  try { customersRepository.create({ name: "x", phone: "0101234" }, 1); } catch { rejShort = true; }
  ok(rejShort, "رقم أقل من 11 → مرفوض");

  let rejLong = false;
  try { customersRepository.create({ name: "x", phone: "010123456789" }, 1); } catch { rejLong = true; }
  ok(rejLong, "رقم أكتر من 11 → مرفوض");

  let rejAlpha = false;
  try { customersRepository.create({ name: "x", phone: "0101234567a" }, 1); } catch { rejAlpha = true; }
  ok(rejAlpha, "رقم فيه حروف → مرفوض");

  // 4) رقم مكرّر → مرفوض
  let rejDup = false;
  try { customersRepository.create({ name: "y", phone: "01012345678" }, 1); } catch { rejDup = true; }
  ok(rejDup, "رقم مكرّر → مرفوض");

  console.log(process.exitCode ? "\n❌ فيه فشل" : "\n✅ فالديشن رقم العميل + الاسم الاختياري شغّال");
  process.exit(process.exitCode ?? 0);
} catch (err) {
  console.error("✗ EXCEPTION:", err.message, err.stack);
  process.exit(1);
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
