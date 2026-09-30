import { net } from "electron";

// طلب تفعيل الديسكتوب — يبعت الكود للسيرفر ويستلم هوية المزامنة (الكود + مفتاح جديد).

export interface ActivateResult {
  shopCode: string;
  secretKey: string;
  shopName: string;
}

export async function activateRequest(
  serverUrl: string,
  code: string
): Promise<ActivateResult> {
  const url = serverUrl.replace(/\/+$/, "") + "/api/activate";
  return new Promise<ActivateResult>((resolve, reject) => {
    const request = net.request({ method: "POST", url });
    request.setHeader("Content-Type", "application/json");

    const timeout = setTimeout(() => {
      request.abort();
      reject(new Error("انتهت مهلة الاتصال بالسيرفر"));
    }, 15000);

    let body = "";
    request.on("response", (response) => {
      clearTimeout(timeout);
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => {
        let json: { success?: boolean; error?: string; data?: ActivateResult } = {};
        try {
          json = JSON.parse(body || "{}");
        } catch {
          reject(new Error("رد غير صالح من السيرفر"));
          return;
        }
        const ok =
          response.statusCode >= 200 && response.statusCode < 300 && json.success && json.data;
        if (ok && json.data) {
          resolve({
            shopCode: json.data.shopCode,
            secretKey: json.data.secretKey,
            shopName: json.data.shopName,
          });
        } else {
          reject(new Error(json.error ?? `فشل التفعيل (HTTP ${response.statusCode})`));
        }
      });
    });

    request.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(err.message || "تعذّر الاتصال بالسيرفر"));
    });

    request.write(JSON.stringify({ code }));
    request.end();
  });
}
