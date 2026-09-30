// منطق الباركود — يدعم الباركود العادي والباركود المدمج (وزن/سعر).
//
// الباركود المدمج (EAN-13 يبدأ بـ 20–29) شائع في الموازين:
//   [PP][IIIII][MMMMM][C]
//   PP    : البادئة (20–29) — تحدد إن كان وزن أو سعر
//   IIIII : كود الصنف (5 أرقام)
//   MMMMM : القياس (وزن بالجرام أو سعر بالقروش)
//   C     : خانة التحقق (check digit)
//
// الاتفاق الشائع (قابل للتخصيص لاحقاً من الإعدادات):
//   20–23 → القياس وزن بالجرام  (MMMMM / 1000 = كيلو)
//   24–29 → القياس سعر بالقروش  (MMMMM / 100  = بالعملة)

export type BarcodeKind = "normal" | "embedded_weight" | "embedded_price";

export interface ParsedBarcode {
  raw: string;
  kind: BarcodeKind;
  // الكود المستخدم للبحث عن المنتج:
  //  - normal   → الباركود كامل
  //  - embedded → البادئة + كود الصنف (7 أرقام)
  lookupCode: string;
  itemCode: string | null; // كود الصنف (5 أرقام) للمدمج فقط
  weight: number | null; // كيلوجرام
  price: number | null; // بالعملة
  isValidEan13: boolean;
}

const WEIGHT_PREFIXES = new Set(["20", "21", "22", "23"]);
const PRICE_PREFIXES = new Set(["24", "25", "26", "27", "28", "29"]);

// حساب خانة التحقق لـ EAN-13 من أول 12 رقم
export function computeEan13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = first12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return computeEan13CheckDigit(code.slice(0, 12)) === code.charCodeAt(12) - 48;
}

// ينظّف ناتج السكانر (يشيل أي حروف مش أرقام للباركود الرقمي)
export function sanitizeScan(raw: string): string {
  return raw.trim();
}

export function parseBarcode(raw: string): ParsedBarcode {
  const code = sanitizeScan(raw);
  const digitsOnly = /^\d+$/.test(code);
  const validEan13 = isValidEan13(code);

  // مدمج: 13 رقم تبدأ بـ 20–29
  if (digitsOnly && code.length === 13) {
    const prefix = code.slice(0, 2);
    const isWeight = WEIGHT_PREFIXES.has(prefix);
    const isPrice = PRICE_PREFIXES.has(prefix);

    if (isWeight || isPrice) {
      const itemCode = code.slice(2, 7);
      const measure = parseInt(code.slice(7, 12), 10) || 0;
      const lookupCode = code.slice(0, 7); // البادئة + الصنف

      if (isWeight) {
        return {
          raw: code,
          kind: "embedded_weight",
          lookupCode,
          itemCode,
          weight: measure / 1000,
          price: null,
          isValidEan13: validEan13,
        };
      }
      return {
        raw: code,
        kind: "embedded_price",
        lookupCode,
        itemCode,
        weight: null,
        price: measure / 100,
        isValidEan13: validEan13,
      };
    }
  }

  // عادي
  return {
    raw: code,
    kind: "normal",
    lookupCode: code,
    itemCode: null,
    weight: null,
    price: null,
    isValidEan13: validEan13,
  };
}

// الكود اللي يُخزَّن في المنتج: للمدمج نخزّن lookupCode (بادئة+صنف) عشان
// المسح في الكاشير يطابقه ويستخرج الوزن/السعر من باقي الباركود.
export function barcodeForStorage(raw: string): string {
  return parseBarcode(raw).lookupCode;
}
