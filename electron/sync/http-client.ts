import { net } from "electron";
import type {
  BookingDecisionOut,
  PulledBooking,
} from "../repositories/room-bookings.repository";

// HTTPS client لإرسال دفعات المزامنة للسيرفر.
// جاهز بالكامل — بس مايتناديش إلا لما المحل يبقى مُعدّاً (كود + مفتاح) والويب موجود.

export interface SyncHttpConfig {
  serverUrl: string;
  shopCode: string;
  secretKey: string;
}

export interface SyncEventPayload {
  local_id: string;
  entity_type: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

export class SyncHttpClient {
  constructor(private readonly config: SyncHttpConfig) {}

  private url(path: string): string {
    return this.config.serverUrl.replace(/\/+$/, "") + path;
  }

  // إرسال دفعة أحداث — كل محل يتميّز بالكود والمفتاح في الـ headers
  async sendBatch(events: SyncEventPayload[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = net.request({
        method: "POST",
        url: this.url("/api/sync/events"),
      });
      request.setHeader("Content-Type", "application/json");
      request.setHeader("X-Shop-Code", this.config.shopCode);
      request.setHeader("X-Secret-Key", this.config.secretKey);

      const timeout = setTimeout(() => {
        request.abort();
        reject(new Error("انتهت مهلة الإرسال"));
      }, 15000);

      request.on("response", (response) => {
        clearTimeout(timeout);
        const ok =
          response.statusCode >= 200 && response.statusCode < 300;
        // استهلك جسم الرد لإنهاء الاتصال
        response.on("data", () => undefined);
        response.on("end", () => {
          if (ok) resolve();
          else {
            // السيرفر ردّ بخطأ (مش مشكلة اتصال) — نعلّمه عشان الـ engine ميعتبرش
            // نفسه offline. الاتصال شغّال، المشكلة في الداتا/السيرفر.
            const err = new Error(
              `السيرفر رفض الدفعة (HTTP ${response.statusCode})`
            ) as Error & { serverResponded?: boolean };
            err.serverResponded = true;
            reject(err);
          }
        });
      });

      request.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(err.message));
      });

      request.write(JSON.stringify({ events }));
      request.end();
    });
  }

  // سحب الحجوزات الجديدة + رفع قرارات الموظف (القناة ويب→ديسكتوب)
  //
  // ⚠️ الـendpoint اسمه `/api/sync/pull` وكان بيجيب **طلبات المتجر والحجز مع
  // بعض** في نفس الجسم والرد (SYNC-CONTRACT §45-76). نسخة التجميل مالهاش متجر
  // بضاعة، فمفاتيح الطلبات اتشالت من الطلب **والـendpoint زي ما هو** —
  // الاسم فاضل `pullOrders` لأنه اسم المسار على السيرفر مش اسم المحتوى.
  // والويب بيتجاهل المفاتيح الناقصة (كلها اختيارية عنده) فمفيش كسر توافق.
  async pullOrders(body: {
    bookingAck?: string[];
    bookingDecisions?: BookingDecisionOut[];
    // nextPollMs اختياري في الرد: السيرفر بيقول نسأل تاني إمتى (الحجز مقفول →
    // فاصل طويل). سيرفر قديم مش هيبعته والديسكتوب بيتراجع محلياً.
  }): Promise<{
    nextPollMs?: number;
    bookings: PulledBooking[];
    /**
     * ⚠️ السيرفر بيقول «أنا فاهم الحجز». من غيرها الديسكتوب **مايعلّمش** قراراته
     * إنها اترفعت — ويب قديم بيتجاهل القرار بصمت والقرار كان هيضيع للأبد.
     */
    bookingsSupported: boolean;
    bookingSettings?: { enabled?: boolean; alertBeforeMinutes?: number };
  }> {
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: "POST",
        url: this.url("/api/sync/pull"),
      });
      request.setHeader("Content-Type", "application/json");
      request.setHeader("X-Shop-Code", this.config.shopCode);
      request.setHeader("X-Secret-Key", this.config.secretKey);

      const timeout = setTimeout(() => {
        request.abort();
        reject(new Error("انتهت مهلة السحب"));
      }, 15000);

      let data = "";
      request.on("response", (response) => {
        clearTimeout(timeout);
        const ok = response.statusCode >= 200 && response.statusCode < 300;
        response.on("data", (chunk) => {
          data += chunk.toString();
        });
        response.on("end", () => {
          if (!ok) {
            reject(new Error(`السيرفر رفض السحب (HTTP ${response.statusCode})`));
            return;
          }
          try {
            const json = JSON.parse(data) as {
              nextPollMs?: number;
              bookings?: PulledBooking[];
              bookingsSupported?: boolean;
              bookingSettings?: { enabled?: boolean; alertBeforeMinutes?: number };
            };
            resolve({
              nextPollMs: json.nextPollMs,
              bookings: json.bookings ?? [],
              bookingsSupported: json.bookingsSupported === true,
              bookingSettings: json.bookingSettings,
            });
          } catch {
            reject(new Error("رد سحب غير صالح"));
          }
        });
      });
      request.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(err.message));
      });

      request.write(JSON.stringify(body));
      request.end();
    });
  }

  // فحص الاتصال بالسيرفر
  async ping(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (v: boolean) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      try {
        const request = net.request({ method: "GET", url: this.url("/api/health") });
        const timeout = setTimeout(() => {
          request.abort();
          finish(false);
        }, 8000);
        request.on("response", (response) => {
          clearTimeout(timeout);
          response.on("data", () => undefined);
          response.on("end", () => finish(response.statusCode < 500));
        });
        request.on("error", () => {
          clearTimeout(timeout);
          finish(false);
        });
        request.end();
      } catch {
        finish(false);
      }
    });
  }
}
