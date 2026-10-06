// 🔴 **الحجز عاش بعد شيل طلبات المتجر.**
//
// الخطر: الحجز كان **راكب على نفس قناة سحب طلبات المتجر** — endpoint واحد
// (`/api/sync/pull`) وجسم ورد واحد (SYNC-CONTRACT §45-76)، والدالة اسمها كان
// `pullOnlineOrders` وهي اللي بتعمل كل شغل الحجز. فشيل الطلبات بالطريقة الساذجة
// (مسح الدالة أو مسح الريبو) كان **بيقتل الحجز معاه** — والصالون يفضل بلا مواعيد
// وهو المالك حاطط رابط الحجز في إعلان.
//
// الاختبار بيحاكي سيرفر HTTP حقيقي ويتأكد إن السحب:
//   ① لسه بيتنده على `/api/sync/pull`
//   ② بيرفع `bookingAck` و`bookingDecisions`
//   ③ بينزّل الحجوزات الجديدة ويعلّمها «وصلت»
//   ④ **مابيبعتش ولا يقرا أي حقل طلبات** (ack/completed/cancelled/orders)
//   ⑤ ومابيعلّمش القرار «اترفع» لو السيرفر مش فاهم الحجز
//
// تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-booking-survives.js
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const http = require("node:http");
const { app } = require("electron");

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { initDatabase, getDatabase, closeDatabase } = require(path.join(base, "database", "connection.js"));
const { roomBookingsRepository } = require(path.join(base, "repositories", "room-bookings.repository.js"));
const { initSyncEngine } = require(path.join(base, "sync", "sync-engine.js"));
const { settingsRepository } = require(path.join(base, "repositories", "settings.repository.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

process.on("uncaughtException", (e) => {
  console.log(`✗ FAIL استثناء: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.log(`✗ FAIL رفض غير متمسوك: ${e}`);
  process.exit(1);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flexpay-booking-pull-"));
const received = [];
let bookingsSupported = true;

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ url: req.url, body: body ? JSON.parse(body) : null });
    // ⚠️ المحرك بيعمل ping على /api/health الأول — من غيره `online = false`
    // ومابيسحبش خالص، والاختبار يبقى بيقيس سكوت مش سلوك.
    if (req.url !== "/api/sync/pull") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, results: [], ok: true }));
      return;
    }
    const at = new Date(Date.now() + 2 * 3_600_000).toISOString();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        bookings: [
          {
            local_id: "rb-1",
            kind: "table",
            room_desktop_id: null,
            room_name: "كرسي",
            party_size: 1,
            mode: "single",
            starts_at: at,
            duration_minutes: 30,
            price_estimate: 0,
            customer: { name: "منة", phone: "01000000000", notes: null },
          },
        ],
        bookingsSupported,
        bookingSettings: { alertBeforeMinutes: 45 },
        nextPollMs: 10_000,
      })
    );
  });
});

(async () => {
  try {
    // ⚠️ المحرك بيستخدم `net.request` بتاع إلكترون، وهي **مابتشتغلش قبل ما
    // الـapp تبقى ready** — وبتفشل **بصمت** (`ping` بيمسك الاستناء ويرجع false)،
    // فالمحرك يعتبر نفسه أوفلاين والاختبار يبقى بيقيس سكوت مش سلوك.
    await app.whenReady();
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    initDatabase(dir);
    const db = getDatabase();
    // ⚠️ الهوية (كود المحل والمفتاح) **مقفولة** في `settingsRepository.update` — بتيجي
    // من الويب بس (قفل الهوية). فالاختبار بيكتبها في القاعدة مباشرة.
    db.prepare(
      "UPDATE settings SET shop_code = 'FLEX-1', secret_key = 'sk_test', sync_server_url = ?, sync_enabled = 1 WHERE id = 1"
    ).run(`http://127.0.0.1:${port}`);

    const engine = initSyncEngine(db);
    ok(!!engine, "محرك المزامنة اشتغل");

    // ===== ① السحب بيجيب الحجز =====
    console.log("\n— السحب بيجيب الحجز —");
    await engine.syncNow();
    const pulls = received.filter((r) => r.url === "/api/sync/pull");
    ok(pulls.length >= 1, `السحب اتنده على /api/sync/pull (${pulls.length} مرة)`);
    const pending = roomBookingsRepository.listUpcoming();
    ok(pending.some((b) => b.local_id === "rb-1"), "والحجز اتسجّل محلياً");
    ok(settingsRepository.get().bookingAlertMinutes === 45, "وإعداد التنبيه من السيرفر اتحفظ (٤٥ دقيقة)");

    // ===== ② مفيش ولا حقل طلبات في الطلب =====
    // ⚠️ ده جوهر الاختبار: القناة اتنضّفت من الطلبات **من غير** ما تموت.
    console.log("\n— مفيش أي حقل طلبات —");
    const sent = pulls[pulls.length - 1].body ?? {};
    for (const dead of ["ack", "completed", "cancelled"]) {
      ok(!(dead in sent), `مابيبعتش \`${dead}\`${dead in sent ? " — لسه موجود!" : ""}`);
    }
    ok("bookingAck" in sent || "bookingDecisions" in sent, "**وبيبعت مفاتيح الحجز**");

    // ===== ③ تأكيد الاستلام بيترفع =====
    console.log("\n— تأكيد الاستلام والقرار بيترفعوا —");
    await engine.syncNow();
    const second = received.filter((r) => r.url === "/api/sync/pull").pop().body;
    ok(
      Array.isArray(second.bookingAck) && second.bookingAck.includes("rb-1"),
      `الحجز اترفع تأكيد استلامه (${JSON.stringify(second.bookingAck)})`
    );
    ok(roomBookingsRepository.pendingAckIds().length === 0, "ومااتبعتش تاني (idempotent)");

    // ===== ④ قرار الموظف بيترفع =====
    const id = roomBookingsRepository.getById(
      db.prepare("SELECT id FROM room_bookings WHERE local_id = 'rb-1'").get().id
    );
    roomBookingsRepository.reject(id.id, { id: 1, name: "مدير" }, "المحل مقفول");
    ok(roomBookingsRepository.pendingDecisions().length === 1, "الرفض بقى قرار مستني يترفع");
    ok(engine.hasPendingUplink() === true, "**والسحب بيحصل فوراً** مهما كان الفاصل");
    await engine.syncNow();
    ok(roomBookingsRepository.pendingDecisions().length === 0, "والقرار اترفع واتعلّم");

    // ===== ⑤ سيرفر قديم مش فاهم الحجز =====
    // ⚠️ لو علّمنا القرار «اترفع» وهو ضاع، الزبون يفضل مستني رد للأبد.
    console.log("\n— سيرفر مش فاهم الحجز —");
    bookingsSupported = false;
    roomBookingsRepository.reject(id.id, { id: 1, name: "مدير" }, "تجربة تانية");
    const before = roomBookingsRepository.pendingDecisions().length;
    await engine.syncNow();
    ok(
      roomBookingsRepository.pendingDecisions().length === before,
      "القرار **مااتعلّمش** إنه اترفع (bookingsSupported = false)"
    );

    closeDatabase();
    console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ الحجز عايش والقناة نضيفة من الطلبات");
  } catch (e) {
    ok(false, `استثناء: ${e instanceof Error ? e.stack : e}`);
  } finally {
    try {
      server.close();
    } catch {
      /* اتقفل خلاص */
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ويندوز بيقفل ملف الـWAL لحظة */
    }
  }
  process.exit(process.exitCode ?? 0);
})();
