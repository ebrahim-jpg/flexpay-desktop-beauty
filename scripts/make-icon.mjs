// يحوّل app/logo.svg إلى assets/icon.ico (متعدد الأحجام) باستخدام sharp.
// تشغيل: node scripts/make-icon.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SVG = path.resolve("app/logo.svg");
const OUT = path.resolve("assets/icon.ico");
const sizes = [256, 128, 64, 48, 32, 16];

const svg = fs.readFileSync(SVG);

// نرندر بدقة عالية مرة، وبعدين نصغّر لكل حجم (أنضف من الرندر المتكرر)
const base = await sharp(svg, { density: 384 })
  .resize(1024, 1024, { fit: "cover" })
  .png()
  .toBuffer();

const pngs = [];
for (const s of sizes) {
  pngs.push({ size: s, buf: await sharp(base).resize(s, s).png().toBuffer() });
}

// تجميع ملف ICO (إدخالات PNG — مدعومة في ويندوز Vista فأعلى)
const count = pngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(count, 4);

const entries = Buffer.alloc(16 * count);
let offset = 6 + 16 * count;
const blobs = [];
pngs.forEach((p, i) => {
  const e = i * 16;
  entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 0); // width (0 = 256)
  entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1); // height
  entries.writeUInt8(0, e + 2); // palette
  entries.writeUInt8(0, e + 3); // reserved
  entries.writeUInt16LE(1, e + 4); // planes
  entries.writeUInt16LE(32, e + 6); // bpp
  entries.writeUInt32LE(p.buf.length, e + 8); // size
  entries.writeUInt32LE(offset, e + 12); // offset
  offset += p.buf.length;
  blobs.push(p.buf);
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, entries, ...blobs]));
console.log(`✓ wrote ${OUT} (${count} sizes, ${fs.statSync(OUT).size} bytes)`);
