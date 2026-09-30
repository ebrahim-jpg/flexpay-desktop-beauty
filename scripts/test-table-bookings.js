// اختبار حجز الطاولات (نسخة «كافيه» بس) — من المستودع والـIPC.
//
//   • طلب حجز الطاولة بيوصل **من غير طاولة** (ميعاد + عدد أفراد) — الموظف بيحدد الطاولة وقت التأكيد.
//   • التأكيد من غير طاولة مرفوض · بطاولة مش موجودة مرفوض · بطاولة عليها حجز متأكّد متداخل مرفوض.
//   • قرار التأكيد بيرفع الطاولة المختارة للويب (room_desktop_id + room_name) عشان يتعرض هناك.
//   • التحويل لحساب بيفتح حساب طاولة حقيقي على الطاولة المحددة.
//   • أي حجز بيوصل بيتسجّل طاولة (حتى لو جه بشكل حجز غرفة قديم) — النسخة دي مالهاش غرف.
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-table-bookings.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const electron = require("electron");

const handlers = new Map();
if (electron && electron.ipcMain) electron.ipcMain.handle = (channel, fn) => handlers.set(channel, fn);

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { roomBookingsRepository } = require(path.join(base, "repositories", "room-bookings.repository.js"));
const { gamingRepository } = require(path.join(base, "repositories", "gaming.repository.js"));

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
    ok(!contains || msg.includes(contains), `${m} («${msg}»)`);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-table-bookings-"));
(async () => {
  try {
    initDatabase(dir);
    const db = getDatabase();
    const actorId = Number(
      db.prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u1','مدير','m','manager',1)").run()
        .lastInsertRowid
    );
    const actor = { id: actorId, name: "مدير" };
    // ⚠️ الجلسة في التجميل مابتتفتحش بلا حلاق — والتحويل من الحجز بيفتح جلسة
    const stylistId = Number(
      db.prepare("INSERT INTO users (local_id, name, username, role, is_active) VALUES ('u2','سماح','s','stylist',1)").run()
        .lastInsertRowid
    );
    const t1 = gamingRepository.saveRoom({ name: "طاولة 1", area: "داخلي" }, actorId).room;
    const t2 = gamingRepository.saveRoom({ name: "طاولة 2" }, actorId).room;

    const at = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const pull = (local_id, extra) => ({
      local_id,
      room_desktop_id: null,
      room_name: "",
      mode: "single",
      starts_at: at,
      duration_minutes: 120,
      customer: { name: "سارة", phone: "01000000001", notes: null },
      price_estimate: 0,
      created_at: new Date().toISOString(),
      kind: "table",
      party_size: 4,
      ...extra,
    });

    // ===== ① السحب =====
    console.log("\n— طلب حجز طاولة —");
    const n = roomBookingsRepository.upsertPulled([
      pull("tb1"),
      pull("tb2", { party_size: 2 }),
      // شكل حجز غرفة قديم (من غير kind) — لازم يتسجّل طاولة من غير ما يتربط بأي مكان
      { ...pull("rb1"), kind: undefined, party_size: undefined, room_desktop_id: t1.id, room_name: "غرفة 1", price_estimate: 120 },
    ]);
    ok(n === 3, `اتسحبوا 3 (الفعلي ${n})`);
    const id = (lid) => db.prepare("SELECT id FROM room_bookings WHERE local_id = ?").get(lid).id;
    const b1 = roomBookingsRepository.getById(id("tb1"));
    ok(b1.kind === "table" && b1.party_size === 4, "الحجز نوعه طاولة ومعاه عدد الأفراد");
    ok(b1.room_id === null, "مفيش طاولة لسه (الموظف بيحددها)");
    const rb = roomBookingsRepository.getById(id("rb1"));
    ok(rb.kind === "table" && rb.room_id === null && rb.room_name === "طاولة", "حجز بشكل غرفة بيتسجّل طاولة من غير مكان (الموظف يحدده)");

    // ===== ② التأكيد =====
    console.log("\n— التأكيد بطاولة —");
    rejects(() => roomBookingsRepository.confirm(b1.id, actor, null), "تأكيد حجز طاولة من غير طاولة مرفوض", "اختار الطاولة");
    rejects(() => roomBookingsRepository.confirm(b1.id, actor, null, 99999), "تأكيد على طاولة مش موجودة مرفوض", "طاولة");
    const c1 = roomBookingsRepository.confirm(b1.id, actor, "عربون 50", t1.id);
    ok(c1.status === "confirmed" && c1.room_id === t1.id && c1.room_name === "طاولة 1", "اتأكّد على طاولة 1");
    rejects(
      () => roomBookingsRepository.confirm(id("tb2"), actor, null, t1.id),
      "حجز تاني في نفس الوقت على نفس الطاولة مرفوض",
      "طاولة 1"
    );
    const failed = roomBookingsRepository.getById(id("tb2"));
    ok(failed.status === "new" && failed.room_id === null, "التأكيد اللي اترفض مايسيبش طاولة متعيّنة (الترانزاكشن رجعت)");
    const c2 = roomBookingsRepository.confirm(id("tb2"), actor, null, t2.id);
    ok(c2.room_id === t2.id, "الحجز التاني اتأكّد على طاولة 2");
    rejects(() => roomBookingsRepository.confirm(rb.id, actor, null), "الحجز اللي جه بشكل غرفة محتاج طاولة برضه", "اختار الطاولة");

    // ===== ③ الرفع للويب =====
    console.log("\n— القرار للويب —");
    const decisions = roomBookingsRepository.pendingDecisions();
    const d1 = decisions.find((d) => d.local_id === "tb1");
    ok(d1 && d1.room_desktop_id === t1.id && d1.room_name === "طاولة 1", "قرار حجز الطاولة بيرفع الطاولة المختارة");
    ok(!decisions.some((d) => d.local_id === "rb1"), "الحجز اللي لسه مااتأكدش مالوش قرار يترفع");

    // ===== ④ شاشة الطاولات + التحويل =====
    console.log("\n— التحويل لحساب —");
    ok(roomBookingsRepository.activeForBoard().some((b) => b.local_id === "tb1" && b.room_id === t1.id), "الحجز ظاهر لشاشة الطاولات بطاولته");
    const { registerRoomBookingsIpc } = require(path.join(base, "ipc", "room-bookings.ipc.js"));
    const { setCurrentActor } = require(path.join(base, "ipc", "session.js"));
    if (electron && electron.ipcMain) {
      registerRoomBookingsIpc();
      setCurrentActor(actorId);
      const noStaff = await handlers.get("bookings:convert")({}, { id: b1.id, staff_id: 0 });
      ok(!noStaff.ok, `التحويل بلا حلاق مرفوض (${noStaff.ok ? "**عدّى**" : noStaff.error})`);
      const conv = await handlers.get("bookings:convert")({}, { id: b1.id, staff_id: stylistId });
      ok(conv.ok && conv.data.session.kind === "table" && conv.data.session.room_id === t1.id, `التحويل فتح حساب كرسي 1 (${conv.ok ? "" : conv.error})`);
      ok(conv.ok && conv.data.session.staff_id === stylistId, "والجلسة اتفتحت باسم الحلاق (العمولة هتمشي صح)");
      ok(conv.ok && !("planned_minutes" in conv.data.session), "حساب الكرسي من الحجز مالوش مدة");
      const confirmIpc = await handlers.get("bookings:confirm")({}, { id: id("tb2"), note: null });
      ok(!confirmIpc.ok || confirmIpc.data.status === "confirmed", "قناة التأكيد لسه شغّالة");
    } else {
      ok(false, "الاختبار لازم يشتغل بإلكترون حقيقي (run-electron)");
    }
    closeDatabase();
  } catch (e) {
    ok(false, `استثناء: ${e instanceof Error ? e.stack : e}`);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ويندوز */
    }
    console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ حجز الطاولات سليم");
    process.exit(process.exitCode ?? 0);
  }
})();
