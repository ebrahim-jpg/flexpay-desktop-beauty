import type Database from "better-sqlite3";
import { Notification } from "electron";
import { getMainWindow } from "../main-window";
import { SyncHttpClient } from "./http-client";
import { roomBookingsRepository } from "../repositories/room-bookings.repository";
import { settingsRepository } from "../repositories/settings.repository";
import {
  getQueueStats,
  getPendingBatch,
  markSyncing,
  markSynced,
  markBatchFailed,
  releaseBatch,
  resetFailed,
  logSyncRun,
} from "./sync-queue";
import type { SyncStatusDTO, SyncEngineState } from "../../shared/sync";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;
const CONNECTION_INTERVAL_MS = 60_000;
// أي طلب مزامنة ناجح = إثبات إننا أونلاين، فالـping المستقل بيبقى هدر خالص.
const PING_SKIP_IF_SYNCED_WITHIN_MS = 60_000;
const SYNC_INTERVAL_MS = 10_000;
// ===== تكيّف فاصل السحب =====
// السحب كان بيتنفّذ كل 10 ثواني **للأبد** حتى لو المحل مالوش متجر إلكتروني أصلاً
// (8,640 طلب/يوم من محل قاعد مقفول) — وده كان أكبر بند في فاتورة CPU على السيرفر.
//
// ⚠️ ليه مش حارس «مفيش حاجة أبعتها»: السحب مش بس بيرفع — هو **كمان اللي بيستقبل
// الطلبات الجديدة**. فحارس زي ده كان هيمنع استقبال الطلبات نهائياً.
// الصح: الفاصل يتمدّد وقت الخمول **ويرجع فوراً مع أول نشاط**.
const IDLE_PULLS_BEFORE_BACKOFF = 6; // دقيقة خمول قبل ما نبطّئ
const IDLE_PULL_INTERVAL_MS = 60_000; // الطلبات لسه بتوصل خلال دقيقة كحد أقصى
const MAX_PULL_INTERVAL_MS = 900_000; // سقف أمان لأي تلميح من السيرفر (15 دقيقة)
// أقصى دفعات في التِك الواحدة (تفريغ سريع للطوابير الكبيرة) — 200×50 = 10 آلاف حدث/تِك
const DRAIN_MAX_BATCHES = 200;
// شفاء دوري: كل كام فحص اتصال (30ث × 10 = 5 دقايق) نرجّع الفاشلة pending تلقائياً
const HEAL_EVERY_CHECKS = 10;

interface SyncConfig {
  serverUrl: string;
  shopCode: string;
  secretKey: string;
}

// المحرك الرئيسي للـ Sync — يشتغل في Main Process فقط.
// مهم: المحرك جاهز بالكامل، لكنه يبقى خاملاً (disabled) لحد ما المحل يتسجّل
// بكود ومفتاح من الويب. يعني دلوقتي مفيش أي رفع فعلي — البيانات بس بتتجمّع في الطابور.
export class SyncEngine {
  private connTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private online = false;
  private syncing = false;
  private busy = false;
  private pulling = false;
  private healCounter = 0;
  private pullIntervalMs = SYNC_INTERVAL_MS; // بيتمدّد وقت الخمول
  private lastPullAt = 0;
  private emptyPulls = 0;
  private lastSuccessfulSyncAt = 0; // أي نداء ناجح للسيرفر (يغني عن الـping)

  constructor(private readonly db: Database.Database) {}

  start(): void {
    // لو فيه سجلات عالقة في 'syncing' من جلسة سابقة، رجّعها 'pending'
    this.db
      .prepare("UPDATE sync_queue SET status = 'pending' WHERE status = 'syncing'")
      .run();

    void this.checkConnection();
    this.connTimer = setInterval(
      () => void this.checkConnection(),
      CONNECTION_INTERVAL_MS
    );
    this.syncTimer = setInterval(() => void this.tickSync(), SYNC_INTERVAL_MS);
    this.notify();
  }

  stop(): void {
    if (this.connTimer) clearInterval(this.connTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.connTimer = null;
    this.syncTimer = null;
  }

  // يقرأ إعدادات المحل — لو مفيش كود/مفتاح/رابط صحيح → المحرك خامل.
  // ولو المالك وقّف المزامنة من الإعدادات → نفس المسار بالظبط (مفيش فرع جديد):
  // الطابور بيفضل بيتجمّع محلياً وبيتفرّغ من غير فقد أول ما يشغّلها تاني.
  private readConfig(): SyncConfig | null {
    const row = this.db
      .prepare(
        "SELECT shop_code, secret_key, sync_server_url, sync_enabled FROM settings WHERE id = 1"
      )
      .get() as
      | {
          shop_code: string | null;
          secret_key: string | null;
          sync_server_url: string | null;
          sync_enabled: number | null;
        }
      | undefined;
    if (!row || !row.shop_code || !row.secret_key) return null;
    // `?? 1` — قاعدة اتفتحت قبل ما الـmigration تجري تعتبر المزامنة شغّالة
    if ((row.sync_enabled ?? 1) !== 1) return null;
    const serverUrl = row.sync_server_url ?? "";
    if (!/^https?:\/\//.test(serverUrl)) return null;
    return { serverUrl, shopCode: row.shop_code, secretKey: row.secret_key };
  }

  private async checkConnection(): Promise<void> {
    const cfg = this.readConfig();
    if (!cfg) {
      this.online = false;
      this.notify();
      return;
    }
    // نجاح أي طلب مزامنة لسه قريب = إحنا أونلاين مؤكّد، فمفيش داعي لـping منفصل
    if (
      this.online &&
      Date.now() - this.lastSuccessfulSyncAt < PING_SKIP_IF_SYNCED_WITHIN_MS
    ) {
      return;
    }
    const was = this.online;
    try {
      this.online = await new SyncHttpClient(cfg).ping();
    } catch {
      this.online = false;
    }
    // شفاء ذاتي (1): أول ما الاتصال يرجع، رجّع أي فاشلة لـ pending عشان تتحاول تاني.
    // شفاء ذاتي (2): وكمان بشكل دوري كل ~5 دقايق حتى لو الاتصال ثابت — عشان لو
    // السيرفر كان بيرجّع خطأ مؤقت (نشر/ضغط) ورجع تاني، الفاشلة تتصلّح لوحدها.
    // النتيجة: المالك مايحتاجش يدوس زرار «إعادة الفاشلة» أبداً في أي سيناريو.
    this.healCounter = this.online ? this.healCounter + 1 : 0;
    const reconnected = !was && this.online;
    const periodicHeal = this.online && this.healCounter % HEAL_EVERY_CHECKS === 0;
    if (reconnected || periodicHeal) {
      try {
        resetFailed(this.db);
      } catch {
        /* تجاهل */
      }
    }
    this.notify();
  }

  private async tickSync(): Promise<void> {
    if (!this.online) return;
    const cfg = this.readConfig();
    if (!cfg) return;
    // الدفع (صادر) — متجوّز بـ busy لوحده
    if (!this.busy) await this.syncBatch(cfg);
    // السحب (وارد: **الحجوزات**) — بفاصل متكيّف مش كل تِك.
    // بس لو فيه قرار **جاهز يترفع** بنسحب فوراً مهما كان الفاصل، عشان الزبون
    // يعرف حجزه اتأكّد من غير تأخير.
    if (this.dueForPull() || this.hasPendingUplink()) {
      await this.pullBookings(cfg);
    }
  }

  private dueForPull(): boolean {
    return Date.now() - this.lastPullAt >= this.pullIntervalMs;
  }

  /** فيه تأكيد استلام أو قرار حجز مستني يرفع؟ */
  private hasPendingUplink(): boolean {
    // قرار الموظف على حجز (قبول/رفض/تحويل) لازم يوصل الويب في أقرب سحب
    return (
      roomBookingsRepository.pendingAckIds().length > 0 ||
      roomBookingsRepository.pendingDecisions().length > 0
    );
  }

  /** رجّع السحب لأسرع فاصل — بيتنده مع أي نشاط حقيقي (فتح شاشة الحجز مثلاً). */
  resumeFastPull(): void {
    this.emptyPulls = 0;
    this.pullIntervalMs = SYNC_INTERVAL_MS;
    this.lastPullAt = 0; // اسحب في أقرب تِك
  }

  // 🔴 سحب **الحجوزات** من الويب + رفع قرارات الموظف. الفشل مايأثرش على الدفع.
  //
  // ⚠️ القناة دي كانت اسمها `pullOnlineOrders` وكانت بتعمل الحاجتين مع بعض —
  // طلبات المتجر **والحجز** على نفس الـendpoint (`/api/sync/pull`) وبنفس الجسم
  // والرد (SYNC-CONTRACT §45-76). فشيل طلبات المتجر بالطريقة الساذجة (مسح
  // الدالة) كان **هيقتل الحجز معاه**. اللي حصل: السحب فضل، ونص الطلبات بس اتشال.
  private async pullBookings(cfg: SyncConfig): Promise<void> {
    if (this.pulling) return;
    this.pulling = true;
    try {
      const bookingAck = roomBookingsRepository.pendingAckIds();
      const bookingDecisions = roomBookingsRepository.pendingDecisions();
      const { nextPollMs, bookings, bookingsSupported, bookingSettings } =
        await new SyncHttpClient(cfg).pullOrders({
          bookingAck,
          bookingDecisions,
        });
      const newBookings = roomBookingsRepository.upsertPulled(bookings);
      // ⚠️ مانعلّمش أي حجز «اترفع» غير لما السيرفر يقول إنه فاهم الحجز أصلاً:
      // ويب قديم بيتجاهل المفاتيح بصمت، وكنا هنعتبر القرار وصل وهو ضاع للأبد.
      if (bookingsSupported) {
        if (bookingAck.length) roomBookingsRepository.markAcked(bookingAck);
        if (bookingDecisions.length) {
          roomBookingsRepository.markDecisionsSynced(bookingDecisions.map((d) => d.local_id));
        }
        const alert = bookingSettings?.alertBeforeMinutes;
        if (typeof alert === "number" && Number.isFinite(alert)) {
          settingsRepository.setBookingAlertMinutes(alert);
        }
      }
      if (newBookings > 0) this.onNewBookings(newBookings);
      this.lastSuccessfulSyncAt = Date.now();

      // ===== ضبط الفاصل الجاي =====
      const hadWork =
        bookings.length > 0 || bookingAck.length > 0 || bookingDecisions.length > 0;
      if (hadWork) {
        // نشاط حقيقي → فضل سريع
        this.emptyPulls = 0;
        this.pullIntervalMs = SYNC_INTERVAL_MS;
      } else if (typeof nextPollMs === "number" && Number.isFinite(nextPollMs)) {
        // السيرفر عارف أكتر مننا (مثلاً: المتجر مقفول → 10 دقايق). بسقف أمان.
        this.pullIntervalMs = Math.min(
          Math.max(nextPollMs, SYNC_INTERVAL_MS),
          MAX_PULL_INTERVAL_MS
        );
      } else {
        // سيرفر قديم مابعتش تلميح → تراجع محلي
        this.emptyPulls++;
        if (this.emptyPulls >= IDLE_PULLS_BEFORE_BACKOFF) {
          this.pullIntervalMs = IDLE_PULL_INTERVAL_MS;
        }
      }
    } catch {
      // السحب فشل (نت/سيرفر) — هيتعاد المرة الجاية، مفيش بيانات بتضيع
    } finally {
      // بيتسجّل حتى مع الفشل: من غيره سيرفر بيرجّع خطأ كان هيتضرب كل تِك
      this.lastPullAt = Date.now();
      this.pulling = false;
    }
  }

  // إشعار + حدث للواجهة لما يوصل حجز جديد (نفس نمط طلبات المتجر)
  private onNewBookings(count: number): void {
    const total = roomBookingsRepository.pendingCount();
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("bookings:new", { count, total });
    }
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: "📅 حجز غرفة جديد",
          body:
            count === 1
              ? "وصل طلب حجز محتاج ردّ"
              : `وصل ${count} طلبات حجز محتاجة ردّ`,
        }).show();
      }
    } catch {
      /* الإشعار مش متاح — نتجاهل */
    }
  }

  // تفريغ الطابور: بيبعت دفعات متتالية لحد ما يخلص أو يفشل — سريع للطوابير الكبيرة
  // (شهر أوفلاين بيتفرّغ في دقايق مش ساعة). بحد أقصى للأمان في التِك الواحدة.
  private async syncBatch(cfg: SyncConfig): Promise<void> {
    if (getPendingBatch(this.db, 1).length === 0) return; // مفيش حاجة تترفع
    this.busy = true;
    this.syncing = true;
    this.notify();
    try {
      for (let i = 0; i < DRAIN_MAX_BATCHES; i++) {
        const result = await this.pushOneBatch(cfg);
        if (result !== "sent" || !this.online) break; // خلص / فشل / اتقطع الاتصال
      }
    } finally {
      this.busy = false;
      this.syncing = false;
      this.notify();
    }
  }

  // دفعة واحدة: يرجّع "empty" (مفيش) | "sent" (اترفعت) | "fail" (فشلت)
  private async pushOneBatch(cfg: SyncConfig): Promise<"empty" | "sent" | "fail"> {
    const batch = getPendingBatch(this.db, BATCH_SIZE);
    if (batch.length === 0) return "empty";
    const ids = batch.map((b) => b.id);
    try {
      markSyncing(this.db, ids);
      const events = batch.map((b) => ({
        local_id: b.local_id,
        entity_type: b.entity_type,
        event_type: b.event_type,
        payload: safeParse(b.payload),
        created_at: b.created_at,
      }));
      await new SyncHttpClient(cfg).sendBatch(events);
      markSynced(this.db, ids);
      logSyncRun(this.db, "success", ids.length, null);
      return "sent";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ في المزامنة";
      logSyncRun(this.db, "error", ids.length, msg);
      const serverResponded =
        e instanceof Error && (e as Error & { serverResponded?: boolean }).serverResponded;
      if (serverResponded) {
        // السيرفر ردّ بخطأ (HTTP) → مشكلة في الداتا/العقد → نزوّد المحاولات (وبعد الحد = failed)
        markBatchFailed(this.db, ids, msg, MAX_ATTEMPTS);
      } else {
        // فشل شبكة/تايم آوت → مش غلطة الداتا → نرجّعها pending زي ما هي (من غير حرق محاولة)
        releaseBatch(this.db, ids);
        this.online = false;
      }
      return "fail";
    }
  }

  // مزامنة فورية يدوية (زر "مزامنة الآن")
  async syncNow(): Promise<SyncStatusDTO> {
    this.resumeFastPull(); // طلب صريح من المستخدم = نشاط
    await this.checkConnection();
    const cfg = this.readConfig();
    if (cfg && this.online && !this.busy) {
      await this.syncBatch(cfg);
      await this.pullBookings(cfg);
    }
    return this.buildStatus();
  }

  buildStatus(): SyncStatusDTO {
    const cfg = this.readConfig();
    const stats = getQueueStats(this.db);
    const lastRow = this.db
      .prepare(
        "SELECT timestamp FROM sync_log WHERE result = 'success' ORDER BY id DESC LIMIT 1"
      )
      .get() as { timestamp: string } | undefined;

    let state: SyncEngineState;
    let message: string;
    if (!cfg) {
      state = "disabled";
      message = "المزامنة مش مفعّلة — محتاج كود ومفتاح المحل من لوحة الويب";
    } else if (this.syncing) {
      state = "syncing";
      message = "بتزامن دلوقتي...";
    } else if (this.online) {
      state = "online";
      message = "متصل بالسيرفر";
    } else {
      state = "offline";
      message = "مفيش اتصال — البيانات محفوظة وهتترفع تلقائياً لما النت يرجع";
    }

    return {
      state,
      configured: !!cfg,
      pending: stats.pending,
      synced: stats.synced,
      failed: stats.failed,
      lastSyncAt: lastRow?.timestamp ?? null,
      message,
    };
  }

  private notify(): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("sync:status", this.buildStatus());
    }
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

// ===== Singleton =====
let engine: SyncEngine | null = null;

export function initSyncEngine(db: Database.Database): SyncEngine {
  engine = new SyncEngine(db);
  return engine;
}

export function getSyncEngine(): SyncEngine | null {
  return engine;
}
