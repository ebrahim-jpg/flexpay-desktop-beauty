// اختبار تذكرة المطبخ — **بلا أسعار**.
//   • الأصناف والكميات وملاحظة كل صنف بتظهر، والأسعار والإجمالي **لأ**.
//   • المكان (طاولة/تيك أواي/توصيل) بيظهر كبير — الشيف بيقراه من بعيد.
//   • تذكرة من غير أصناف مابتطبعش أصلاً.
// الاختبار بيقرا **نفس الدالة** اللي الطباعة بتستخدمها (buildKitchenTicketHtml) — من غير
// نافذة ولا طابعة. تشغيل: npm run build:electron && node scripts/run-electron.js scripts/test-kitchen-ticket.js
const path = require("node:path");

process.on("uncaughtException", (e) => {
  console.log(`✗ FAIL استثناء: ${e && e.message ? e.message : e}`);
  process.exit(1);
});

const base = path.resolve(__dirname, "..", "dist-electron", "electron");
const { buildKitchenTicketHtml, printKitchenTicket } = require(path.join(base, "lib", "printer.js"));

function ok(c, m) {
  console.log(`${c ? "✓" : "✗ FAIL"} ${m}`);
  if (!c) process.exitCode = 1;
}

async function main() {
  ok(typeof buildKitchenTicketHtml === "function", "buildKitchenTicketHtml موجودة");

  // ① تذكرة فاضية مابتطبعش (مفيش ورق بيتحرق على أوردر فاضي)
  const empty = await printKitchenTicket({ place: "طاولة 1", items: [] }, null, "مطعمي");
  ok(empty === false, "تذكرة بلا أصناف مابتطبعش");

  // ② المحتوى
  const html = buildKitchenTicketHtml(
    {
      place: "طاولة 5",
      reference: "حساب #0012",
      items: [
        { quantity: 2, name: "فراخ مشوية", notes: "بلا بصل" },
        { quantity: 1, name: "أرز بسمتي", notes: null },
        { quantity: 1, name: "بيتزا", size: "لارج", options: ["جبنة إضافي", "زيتون"] },
      ],
      note: "الزبون مستعجل",
      staffName: "محمود (نادل)",
    },
    "مطعمي"
  );

  ok(html.includes("طاولة 5"), "المكان ظاهر (طاولة 5)");
  ok(html.includes("فراخ مشوية") && html.includes("أرز بسمتي"), "الأصناف ظاهرة");
  ok(html.includes("2×") && html.includes("1×"), "الكميات ظاهرة");
  ok(html.includes("بلا بصل"), "ملاحظة الصنف ظاهرة (دي اللي بتفرق في المطبخ)");
  ok(html.includes("الزبون مستعجل"), "ملاحظة الأوردر ظاهرة");
  ok(html.includes("محمود (نادل)"), "مين طلب التجهيز ظاهر");
  ok(html.includes("حساب #0012"), "رقم الحساب ظاهر (ربط الورقة بالشاشة)");
  // ⚠️ الحجم والإضافات: ورقة بتقول «بيتزا» بس مالهاش قيمة — الشيف مش عارف يعمل أنهي حجم
  ok(html.includes("بيتزا") && html.includes("لارج"), "**الحجم ظاهر جنب اسم الصنف**");
  ok(html.includes("جبنة إضافي") && html.includes("زيتون"), "**الإضافات المختارة ظاهرة**");
  ok(!/جبنة إضافي[^<]*\+?\s*\d/.test(html), "والإضافات بلا أسعار");
  ok(html.includes("مطعمي"), "اسم المحل ظاهر");
  // ⚠️ الأهم: مفيش فلوس خالص — دي ورقة شغل مش فاتورة
  ok(!/ج\.م|السعر|الإجمالي|المطلوب|price|total/i.test(html), "**مفيش أي أسعار ولا إجمالي في التذكرة**");

  // ③ التيك أواي والتوصيل بنفس القالب
  const takeaway = buildKitchenTicketHtml(
    { place: "تيك أواي", reference: "#0052", items: [{ quantity: 3, name: "شاورما", size: null, options: [] }] },
    "مطعمي"
  );
  ok(
    takeaway.includes('<span class="name">شاورما</span>'),
    "صنف بلا حجم اسمه نضيف بلا شرطة فاضية"
  );
  ok(takeaway.includes("تيك أواي") && takeaway.includes("شاورما"), "تذكرة التيك أواي شغّالة");
  ok(!/ج\.م/.test(takeaway), "وكمان بلا أسعار");

  console.log(process.exitCode ? "\n❌ فيه فحوص فشلت" : "\n✅ تذكرة المطبخ سليمة");
  process.exit(process.exitCode ? 1 : 0);
}

void main();
