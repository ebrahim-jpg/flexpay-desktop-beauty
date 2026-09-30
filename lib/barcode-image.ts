import JsBarcode from "jsbarcode";

// يولّد باركود Code128 كـ PNG data URL (بيشتغل في الرندرر — canvas).
// الباركود بيرمّز الكود الرقمي (اللي السكانر بيقراه)، واسم الموظف بيتكتب فوقه للتمييز.
export function generateBarcodePng(code: string, name?: string): string {
  const bar = document.createElement("canvas");
  JsBarcode(bar, code, {
    format: "CODE128",
    displayValue: true,
    fontSize: 20,
    height: 90,
    width: 2.4,
    margin: 12,
    background: "#ffffff",
    lineColor: "#000000",
  });

  const label = name?.trim();
  if (!label) return bar.toDataURL("image/png");

  // نلفّ الباركود بكانفس فيها اسم الموظف فوق (Chromium بيرسم العربي صح على الكانفس)
  const titleH = 40;
  const out = document.createElement("canvas");
  out.width = bar.width;
  out.height = bar.height + titleH;
  const ctx = out.getContext("2d");
  if (!ctx) return bar.toDataURL("image/png");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = "#000000";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillText(label, out.width / 2, 28);
  ctx.drawImage(bar, 0, titleH);
  return out.toDataURL("image/png");
}

// ينزّل صورة PNG (data URL) باسم ملف محدّد.
export function downloadPng(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
