// حراسة القيم الرقمية — الدرع ضد السوالب والقيم غير الصحيحة (NaN / Infinity).
// ⚠️ بتتنادى في طبقة الـ repository (الـ Main) لأنها الحد الأمني الحقيقي اللي مايتحايلش
//    عليه من الواجهة. أي مبلغ/كمية/سعر بيتسجّل لازم يعدّي من هنا.

export function isValidNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

// لازم رقم أكبر من صفر (الكميات، مبالغ الدفع، أي قيمة لازم تكون موجبة)
export function assertPositive(value: unknown, label: string): number {
  if (!isValidNumber(value) || value <= 0) {
    throw new Error(`${label} لازم يكون رقم أكبر من صفر`);
  }
  return value;
}

// لازم رقم صفر أو أكبر (الخصم، التكلفة، الحدود، نسبة التهدير، فلوس الدرج، السعر)
export function assertNonNegative(value: unknown, label: string): number {
  if (!isValidNumber(value) || value < 0) {
    throw new Error(`${label} مينفعش يكون بالسالب`);
  }
  return value;
}

// نسبة مئوية بين 0 و100 (نسبة التهدير مثلاً)
export function assertPercent(value: unknown, label: string): number {
  if (!isValidNumber(value) || value < 0 || value > 100) {
    throw new Error(`${label} لازم يكون بين 0 و100`);
  }
  return value;
}
