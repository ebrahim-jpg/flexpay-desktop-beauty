import type { ActivateResult } from "./activation-client";

// نواة إعادة التفعيل — **ذرّية**: الهوية القديمة مابتتلمسش غير لما السيرفر
// يرجّع هوية صحيحة لنفس المحل.
//
// ⚠️ ليه مش «زرار مسح» بعدين شاشة تفعيل: زرار المسح بيبقى هو نفسه زرار التخريب
// الجديد — أول ما يتداس المحل بيتقفل ورا شاشة التفعيل ومايقدرش يبيع لحد ما
// يوصله كود. هنا مفيش أي لحظة يبقى فيها المحل بلا هوية: لو الكود غلط أو النت
// فاصل، `apply` **مابتتنداش أصلاً**.
//
// الاعتماديات محقونة عشان الحارس يجرّب المنطق من غير شبكة ولا electron.

export interface ReactivateDeps {
  getStoredShopCode: () => string | null;
  getServerUrl: () => string;
  request: (serverUrl: string, code: string) => Promise<ActivateResult>;
  apply: (creds: { shopCode: string; secretKey: string; serverUrl: string }) => void;
}

export async function reactivate(
  rawCode: string,
  deps: ReactivateDeps
): Promise<{ shopName: string }> {
  const code = (rawCode ?? "").trim();
  if (!code) throw new Error("اكتب كود التفعيل");

  const serverUrl = (deps.getServerUrl() ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(serverUrl)) {
    throw new Error("رابط السيرفر غير صحيح — صلّحه الأول");
  }

  // ① السيرفر الأول — أي فشل هنا بيرمي والهوية القديمة زي ما هي
  const creds = await deps.request(serverUrl, code);

  // ② حارس تطابق المحل.
  // ⚠️ من غيره، كود مولّد بالغلط لمحل تاني بيربط بيانات المحل ده بحساب محل
  // تاني — تلوّث بيانات مالوش رجعة على الطرفين. الرفض هنا أرخص بكتير.
  const stored = deps.getStoredShopCode();
  if (stored && creds.shopCode !== stored) {
    throw new Error(
      `الكود ده بتاع محل تاني (${creds.shopCode}) — محلك ${stored}. اطلب كود لمحلك.`
    );
  }

  // ③ التبديل — آخر خطوة، وبعد ما كل حاجة اتأكدت
  deps.apply({ shopCode: creds.shopCode, secretKey: creds.secretKey, serverUrl });
  return { shopName: creds.shopName };
}
