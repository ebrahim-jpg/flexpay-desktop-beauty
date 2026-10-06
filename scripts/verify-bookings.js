// حارس «الحجز الأونلاين متركّب صح» (فحص ثابت — بلا إلكترون).
// التشغيل: node scripts/verify-bookings.js
//
// بيمسك الفخاخ اللي بتعدّي بصمت:
//  ① `bookings:new` مش في whitelist الـpreload → البادج والإشعار مايشتغلوش **ومفيش أي خطأ**.
//  ② المستودع بيندَه `enqueue` → الحجز يتحط في طابور المزامنة الصادرة وهو أصلاً جايّ من الويب.
//  ③ محرك المزامنة بيعلّم القرار «اترفع» من غير ما السيرفر يأكّد (`bookingsSupported`) → القرار يضيع للأبد.
//  ④ الـIPC بلا فحص صلاحية أو تدقيق (زي online-orders القديم) بدل نمط gaming.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};
// ملف ناقص = نص فاضي: الفحوص بتبلّغ ✗ بدل ما الحارس يقع ويخفي باقي النتايج
const read = (rel) => {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return "";
  }
};
const exists = (rel) => fs.existsSync(path.join(root, rel));

function stripComments(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // ⚠️ بنقسم على `\r?\n`: في ملفات بنهايات ويندوز `.` مابيطابقش `\r` فالتعليق كان بيفضل
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|[^:"'`\w])\/\/.*$/, "$1"))
    .join("\n");
}
const code = (rel) => stripComments(read(rel));

// ===== ① النواة المشتركة =====
console.log("\n— النواة —");
ok(exists("shared/booking.ts"), "shared/booking.ts موجود");
const shared = code("shared/booking.ts");
ok(/export function bookingTimer\(/.test(shared), "فيه bookingTimer (مصدر الحقيقة لحالة الحجز)");
ok(/export function overlaps\(/.test(shared), "فيه overlaps (التعارض نصف المفتوح)");
for (const s of ["new", "confirmed", "rejected", "converted", "no_show", "cancelled"]) {
  ok(new RegExp(`${s}:\\s*"`).test(shared), `حالة «${s}» ليها اسم عربي`);
}

// ===== ② قاعدة البيانات =====
console.log("\n— الجدول —");
ok(exists("electron/database/migrations/031_room_bookings.ts"), "migration 031 موجودة");
const index = code("electron/database/migrations/index.ts");
ok(/migration_031/.test(index), "migration 031 **مسجّلة** في index (من غيرها الجدول مايتعملش)");
const mig = code("electron/database/migrations/031_room_bookings.ts");
ok(/CREATE TABLE IF NOT EXISTS room_bookings/.test(mig), "بتعمل جدول room_bookings");
ok(/local_id TEXT UNIQUE/.test(mig), "local_id فريد (idempotency السحب)");

// ===== ③ المستودع =====
console.log("\n— المستودع —");
const repo = code("electron/repositories/room-bookings.repository.ts");
ok(/ON CONFLICT\(local_id\) DO NOTHING/.test(repo), "السحب idempotent (ON CONFLICT DO NOTHING)");
ok(!/this\.enqueue\(/.test(repo), "مفيش enqueue — الحجز بيمشي على قناة السحب مش طابور المزامنة");
ok(/conflictsFor/.test(repo), "فيه فحص تعارض وقت القبول (الديسكتوب هو المرجع النهائي)");
ok(/status_synced = 0|status_synced: 0/.test(repo), "كل قرار بيتعلّم «لسه مارفعش»");

// ===== ④ الـIPC =====
console.log("\n— الصلاحيات والتدقيق —");
const ipc = code("electron/ipc/room-bookings.ipc.ts");
ok(/requirePos\(\)/.test(ipc), "القبول والتحويل بصلاحية تشغيل الطاولات");
ok(/canCancelOrder/.test(ipc), "الرفض/الإلغاء بصلاحية الإلغاء (قرار بيضيّع زبون)");
ok(/auditRepository\.log\(/.test(ipc), "كل قرار بيتسجّل في المراقبة الحساسة");
ok(/room_booking/.test(ipc), "نوع الكيان في التدقيق room_booking");
ok(code("electron/ipc/index.ts").includes("registerRoomBookingsIpc"), "الـIPC متسجّل في index");

// ===== ⑤ المزامنة =====
console.log("\n— المزامنة —");
const engine = code("electron/sync/sync-engine.ts");
ok(/bookingAck/.test(engine) && /bookingDecisions/.test(engine), "بيبعت تأكيد الاستلام والقرارات");
ok(/bookingsSupported/.test(engine), "مايعلّمش القرار «اترفع» غير لما السيرفر يأكّد إنه فاهم الحجز");
ok(/onNewBookings|bookings:new/.test(engine), "بينبّه الواجهة بالحجز الجديد");
const preload = code("electron/preload.ts");
ok(/"bookings:new"/.test(preload), "«bookings:new» في whitelist الـpreload (من غيرها الحدث بيتبلع بصمت)");
ok(/bookings/.test(code("electron/sync/http-client.ts")), "عميل الـHTTP بيعرف حقول الحجز");

// ===== ⑥ الواجهة =====
console.log("\n— الواجهة —");
const nav = code("components/shared/nav-items.ts");
ok(/\/bookings/.test(nav), "«طلبات الحجز» في التنقّل");
const firstHref = (nav.match(/href:\s*"([^"]+)"/) ?? [])[1];
ok(firstHref === "/tables", `«الكراسي» أول عنصر في التنقّل (الفعلي ${firstHref})`);
// ⚠️ الفحص ده **انقلب** في التجميل: المطعم كان عنده الاتنين (منيو بيستقبل طلبات
// + حجز)، إنما التجميل **خدمات بس** — اللي بيبيع بضاعة بياخد نسخة البيع
// بالتجزئة. فالحجز لوحده هو الصح هنا.
ok(!/\/store-orders/.test(nav), "و«طلبات المتجر» **مش** موجودة (خدمات بس)");
ok(exists("app/(main)/bookings/page.tsx"), "صفحة طلبات الحجز موجودة");
const page = code("app/(main)/bookings/page.tsx");
ok(/bookings:confirm/.test(page) && /bookings:reject/.test(page), "الصفحة فيها قبول ورفض");
ok(/bookings:convert/.test(page), "الصفحة فيها «حوّل لجلسة»");
ok(/bookings:noShow/.test(page), "الصفحة فيها «مجاش» (الحجز المتأخر بيفضل ظاهر لحد ما الموظف يقفله)");

const rooms = code("app/(main)/tables/page.tsx");
ok(/bookingTimer\(/.test(rooms), "شاشة الطاولات بتحسب تنبيه الحجز بنفس الدالة المشتركة");
ok(/انقلهم|كرسي تانية/.test(rooms), "فيه نص «جهّز كرسي تانية أو انقلهم» لما الكرسي عليها ناس");
const alarmCalls = (rooms.match(/useSessionAlarm\(/g) ?? []).length;
ok(alarmCalls === 1, `useSessionAlarm بتتنده مرة واحدة بس (الفعلي ${alarmCalls}) — نداءين = صوتين فوق بعض`);
ok(!/إقفال تلقائي|autoClose/.test(rooms), "مفيش قفل تلقائي لأي جلسة بسبب حجز (القرار للموظف)");

// الوقت بيتعرض بصيغة 9ص/1م من دالة واحدة — `Intl` المباشر بيطلع «٠٩:٠٠ م» بشكل مختلف عن الويب
const timeFiles = ["app/(main)/bookings/page.tsx", "app/(main)/tables/page.tsx", "components/shared/BookingDueWatcher.tsx"];
for (const f of timeFiles) {
  const src = code(f);
  ok(!/Intl\.DateTimeFormat\([^)]*hour/.test(src), `${f}: مفيش Intl مباشر لعرض الساعة`);
  ok(/bookingTimeLabel\(/.test(src), `${f}: الساعة من bookingTimeLabel`);
}

console.log(failed === 0 ? "\n✅ الحجز الأونلاين متركّب صح" : `\n❌ ${failed} فحص فشل`);
process.exit(failed === 0 ? 0 : 1);
