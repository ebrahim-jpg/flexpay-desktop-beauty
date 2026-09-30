import path from "node:path";
import fs from "node:fs";
import { getAssetsDir } from "../app-paths";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const MAX_BYTES = 3 * 1024 * 1024; // 3MB

function extForMime(mime: string): string {
  return Object.entries(IMAGE_MIME).find(([, v]) => v === mime)?.[0] ?? ".png";
}

// يحفظ صورة من data URL داخل مجلد فرعي بأصول التطبيق، ويرجّع المسار النسبي.
export function saveImage(
  dataUrl: string,
  subdir: string,
  baseName: string
): string {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("صيغة الصورة غير صحيحة");

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("حجم الصورة أكبر من 3 ميجا");
  }

  const dir = path.join(getAssetsDir(), subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileName = `${baseName}${extForMime(match[1])}`;
  const abs = path.join(dir, fileName);

  // امسح أي امتداد قديم لنفس الاسم
  removeImage(path.join(subdir, fileName));
  for (const ext of Object.keys(IMAGE_MIME)) {
    const old = path.join(dir, `${baseName}${ext}`);
    if (fs.existsSync(old)) {
      try {
        fs.unlinkSync(old);
      } catch {
        /* تجاهل */
      }
    }
  }

  fs.writeFileSync(abs, buffer);
  return path.join(subdir, fileName);
}

// يقرأ صورة (مسار نسبي لأصول التطبيق) ويرجّعها data URL — أوفلاين بالكامل.
export function readImageDataUrl(relPath: string | null): string | null {
  if (!relPath) return null;
  try {
    const abs = path.isAbsolute(relPath)
      ? relPath
      : path.join(getAssetsDir(), relPath);
    if (!fs.existsSync(abs)) return null;
    const ext = path.extname(abs).toLowerCase();
    const mime = IMAGE_MIME[ext] ?? "image/png";
    const base64 = fs.readFileSync(abs).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

export function removeImage(relPath: string | null): void {
  if (!relPath) return;
  try {
    const abs = path.isAbsolute(relPath)
      ? relPath
      : path.join(getAssetsDir(), relPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* تجاهل */
  }
}
