import path from "node:path";
import fs from "node:fs";
import { BaseRepository } from "./base.repository";
import { getAssetsDir } from "../app-paths";
import { assertNonNegative, assertPercent, isValidNumber } from "../../shared/validation";
import {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_NATIONALITIES,
  type SettingsDTO,
  type UpdateSettingsInput,
  type PaymentMethod,
  type DeliveryZone,
} from "../../shared/settings";
import type { SettingsRow } from "../../types/database.types";

const LOGO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export class SettingsRepository extends BaseRepository {
  private getRow(): SettingsRow {
    let row = this.db
      .prepare("SELECT * FROM settings WHERE id = 1")
      .get() as SettingsRow | undefined;

    // ضمان وجود الصف (في حال قاعدة قديمة)
    if (!row) {
      this.db
        .prepare(
          `INSERT INTO settings (id, local_id, payment_methods, nationalities, updated_at, sync_status)
           VALUES (1, @local_id, @pm, @nat, @now, 'pending')`
        )
        .run({
          local_id: this.newLocalId(),
          pm: JSON.stringify(DEFAULT_PAYMENT_METHODS),
          nat: JSON.stringify(DEFAULT_NATIONALITIES),
          now: this.now(),
        });
      row = this.db
        .prepare("SELECT * FROM settings WHERE id = 1")
        .get() as SettingsRow;
    }
    return row;
  }

  private parsePaymentMethods(raw: string | null): PaymentMethod[] {
    if (!raw) return [...DEFAULT_PAYMENT_METHODS];
    try {
      const parsed = JSON.parse(raw) as PaymentMethod[];
      return Array.isArray(parsed) && parsed.length
        ? parsed
        : [...DEFAULT_PAYMENT_METHODS];
    } catch {
      return [...DEFAULT_PAYMENT_METHODS];
    }
  }

  private parseNationalities(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) && parsed.length
        ? parsed
        : [...DEFAULT_NATIONALITIES];
    } catch {
      return [...DEFAULT_NATIONALITIES];
    }
  }

  private parseDeliveryZones(raw: string | null): DeliveryZone[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as DeliveryZone[];
      return Array.isArray(parsed)
        ? parsed.filter((z) => z && typeof z.name === "string")
        : [];
    } catch {
      return [];
    }
  }

  // سعر منطقة توصيل بالـ id (لقطة السعر وقت البيع) — للعرض/الفاتورة فقط
  getDeliveryZone(id: string | null | undefined): DeliveryZone | null {
    if (!id) return null;
    return this.parseDeliveryZones(this.getRow().delivery_zones).find((z) => z.id === id) ?? null;
  }

  // يقرأ ملف الشعار ويحوّله data URL للعرض في الواجهة (أوفلاين)
  private readLogoDataUrl(logoPath: string | null): string | null {
    if (!logoPath) return null;
    try {
      const abs = path.isAbsolute(logoPath)
        ? logoPath
        : path.join(getAssetsDir(), logoPath);
      if (!fs.existsSync(abs)) return null;
      const ext = path.extname(abs).toLowerCase();
      const mime = LOGO_MIME[ext] ?? "image/png";
      const base64 = fs.readFileSync(abs).toString("base64");
      return `data:${mime};base64,${base64}`;
    } catch {
      return null;
    }
  }

  private toDTO(row: SettingsRow): SettingsDTO {
    return {
      shopName: row.shop_name,
      shopLogo: this.readLogoDataUrl(row.shop_logo_path),
      country: row.country,
      currency: row.currency,
      currencySymbol: row.currency_symbol,
      taxRate: row.tax_rate,
      businessDayStart: row.business_day_start,
      nationalities: this.parseNationalities(row.nationalities),
      paymentMethods: this.parsePaymentMethods(row.payment_methods),
      deliveryZones: this.parseDeliveryZones(row.delivery_zones),
      lowStockThreshold: row.low_stock_threshold,
      absenceAlertDays: row.absence_alert_days,
      receiptHeader: row.receipt_header ?? "",
      receiptFooter: row.receipt_footer ?? "",
      printerName: row.printer_name,
      kitchenPrinterName: row.kitchen_printer_name ?? null,
      shopCode: row.shop_code,
      // آخر ٤ خانات بس — المفتاح الكامل عمره ما بيخرج من الـmain process
      secretKeyTail: row.secret_key ? row.secret_key.slice(-4) : null,
      syncServerUrl: row.sync_server_url,
      syncEnabled: (row.sync_enabled ?? 1) === 1,
      autoHideOutOfStock: (row.auto_hide_out_of_stock ?? 1) === 1,
      autoClockoutHours: row.auto_clockout_hours ?? 0,
      attendanceWarnHours: row.attendance_warn_hours ?? 0,
      bookingAlertMinutes: row.booking_alert_minutes ?? 60,
      updatedAt: row.updated_at,
    };
  }

  get(): SettingsDTO {
    return this.toDTO(this.getRow());
  }

  /**
   * التنبيه قبل ميعاد الحجز — **بيتكتب من رد السحب بس** (صاحب المحل بيحدده من لوحة الويب).
   * مش في `update()` عشان مايتغيّرش بالغلط من شاشة الإعدادات ويختلف عن اللي الزبون شافه.
   */
  setBookingAlertMinutes(minutes: number): void {
    const m = Math.round(minutes);
    if (!Number.isFinite(m) || m < 0 || m > 24 * 60) return;
    this.db.prepare("UPDATE settings SET booking_alert_minutes = ? WHERE id = 1").run(m);
  }

  getEnabledPaymentMethods(): PaymentMethod[] {
    return this.parsePaymentMethods(this.getRow().payment_methods).filter(
      (m) => m.enabled
    );
  }

  // خريطة من حقول الواجهة (camelCase) لأعمدة الجدول.
  //
  // ⚠️ `shop_code` و`secret_key` **مش هنا عن قصد** — الخريطة دي هي كل اللي
  // `settings:update` بيقدر يكتبه، فوجودهم هنا كان معناه إن أي نداء تحديث
  // إعدادات يكتب فوق هوية المزامنة. `setActivation()` هي **الكاتب الوحيد**
  // للعمودين دلوقتي. متضفهمش هنا تاني.
  private static readonly COLUMN_MAP: Record<string, string> = {
    shopName: "shop_name",
    country: "country",
    currency: "currency",
    currencySymbol: "currency_symbol",
    taxRate: "tax_rate",
    businessDayStart: "business_day_start",
    lowStockThreshold: "low_stock_threshold",
    absenceAlertDays: "absence_alert_days",
    autoClockoutHours: "auto_clockout_hours",
    attendanceWarnHours: "attendance_warn_hours",
    receiptHeader: "receipt_header",
    receiptFooter: "receipt_footer",
    printerName: "printer_name",
    kitchenPrinterName: "kitchen_printer_name",
    syncServerUrl: "sync_server_url",
  };

  update(input: UpdateSettingsInput, actorId: number | null): SettingsDTO {
    // حراسة السوالب في الإعدادات الرقمية (ضريبة سالبة بتقلّل كل فاتورة)
    if (input.taxRate !== undefined) assertPercent(input.taxRate, "نسبة الضريبة");
    if (input.lowStockThreshold !== undefined)
      assertNonNegative(input.lowStockThreshold, "حد المخزون المنخفض");
    if (input.absenceAlertDays !== undefined)
      assertNonNegative(input.absenceAlertDays, "أيام تنبيه الغياب");
    if (input.autoClockoutHours !== undefined)
      assertNonNegative(input.autoClockoutHours, "ساعات الانصراف التلقائي");
    if (input.attendanceWarnHours !== undefined)
      assertNonNegative(input.attendanceWarnHours, "ساعات التحذير");
    if (input.businessDayStart !== undefined) {
      const h = input.businessDayStart;
      if (!isValidNumber(h) || h < 0 || h > 23) {
        throw new Error("بداية اليوم لازم بين 0 و23");
      }
    }

    const fields: string[] = [];
    const params: Record<string, unknown> = {};

    for (const [key, column] of Object.entries(SettingsRepository.COLUMN_MAP)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) {
        fields.push(`${column} = @${key}`);
        params[key] = value;
      }
    }

    // الحقول JSON
    if (input.nationalities !== undefined) {
      const list = input.nationalities.length
        ? input.nationalities
        : [...DEFAULT_NATIONALITIES];
      fields.push("nationalities = @nationalities");
      params.nationalities = JSON.stringify(list);
    }
    if (input.paymentMethods !== undefined) {
      // الكاش مفعّل دائماً
      const methods = input.paymentMethods.map((m) =>
        m.key === "cash" ? { ...m, enabled: true } : m
      );
      fields.push("payment_methods = @payment_methods");
      params.payment_methods = JSON.stringify(methods);
    }
    if (input.deliveryZones !== undefined) {
      // تنظيف + التأكد إن الأسعار مش بالسالب (سعر عرض بس، لكن يفضل سليم)
      const zones = input.deliveryZones
        .filter((z) => z && typeof z.name === "string" && z.name.trim())
        .map((z) => ({
          id: z.id || `z-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: z.name.trim(),
          price: Number.isFinite(z.price) && z.price >= 0 ? z.price : 0,
        }));
      fields.push("delivery_zones = @delivery_zones");
      params.delivery_zones = JSON.stringify(zones);
    }
    if (input.autoHideOutOfStock !== undefined) {
      fields.push("auto_hide_out_of_stock = @auto_hide");
      params.auto_hide = input.autoHideOutOfStock ? 1 : 0;
    }
    if (input.syncEnabled !== undefined) {
      fields.push("sync_enabled = @sync_enabled");
      params.sync_enabled = input.syncEnabled ? 1 : 0;
    }

    if (fields.length === 0) return this.get();

    fields.push("updated_at = @now", "updated_by = @actor", "sync_status = 'pending'");
    params.now = this.now();
    params.actor = actorId;

    return this.transaction(() => {
      this.db
        .prepare(`UPDATE settings SET ${fields.join(", ")} WHERE id = 1`)
        .run(params);
      const row = this.getRow();
      this.enqueue("settings", "UPDATED", row.local_id ?? "settings-1", {
        ...this.toSyncPayload(row),
      });
      return this.toDTO(row);
    });
  }

  // حفظ الشعار من data URL إلى ملف محلي
  saveLogo(dataUrl: string, actorId: number | null): SettingsDTO {
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
    if (!match) throw new Error("صيغة الصورة غير صحيحة");

    const mime = match[1];
    const ext =
      Object.entries(LOGO_MIME).find(([, v]) => v === mime)?.[0] ?? ".png";
    const buffer = Buffer.from(match[2], "base64");

    // حد أقصى 2MB
    if (buffer.byteLength > 2 * 1024 * 1024) {
      throw new Error("حجم الصورة أكبر من 2 ميجا");
    }

    const fileName = `logo${ext}`;
    const abs = path.join(getAssetsDir(), fileName);

    // امسح أي شعار قديم بامتداد مختلف
    this.removeLogoFiles();
    fs.writeFileSync(abs, buffer);

    this.db
      .prepare(
        `UPDATE settings SET shop_logo_path = @p, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = 1`
      )
      .run({ p: fileName, now: this.now(), actor: actorId });

    const row = this.getRow();
    this.enqueue("settings", "UPDATED", row.local_id ?? "settings-1", this.toSyncPayload(row));
    return this.get();
  }

  removeLogo(actorId: number | null): SettingsDTO {
    this.removeLogoFiles();
    this.db
      .prepare(
        `UPDATE settings SET shop_logo_path = NULL, updated_at = @now, updated_by = @actor, sync_status = 'pending' WHERE id = 1`
      )
      .run({ now: this.now(), actor: actorId });
    const row = this.getRow();
    this.enqueue("settings", "UPDATED", row.local_id ?? "settings-1", this.toSyncPayload(row));
    return this.get();
  }

  private removeLogoFiles(): void {
    const dir = getAssetsDir();
    for (const ext of Object.keys(LOGO_MIME)) {
      const f = path.join(dir, `logo${ext}`);
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          /* تجاهل */
        }
      }
    }
  }

  getSyncServerUrl(): string {
    return this.getRow().sync_server_url;
  }

  // حالة التفعيل: مفعّل لو فيه كود محل + مفتاح سري (اتخزّنوا وقت التفعيل)
  getActivationState(): { activated: boolean; serverUrl: string } {
    const row = this.getRow();
    return {
      activated: !!(row.shop_code && row.secret_key),
      serverUrl: row.sync_server_url,
    };
  }

  // تخزين هوية المزامنة بعد التفعيل (من غير enqueue — السر مايتزامنش)
  setActivation(input: {
    shopCode: string;
    secretKey: string;
    serverUrl: string;
  }): void {
    this.getRow(); // ضمان وجود الصف
    this.db
      .prepare(
        `UPDATE settings SET shop_code = @code, secret_key = @secret,
         sync_server_url = @url, updated_at = @now WHERE id = 1`
      )
      .run({
        code: input.shopCode,
        secret: input.secretKey,
        url: input.serverUrl,
        now: this.now(),
      });
  }

  private toSyncPayload(row: SettingsRow) {
    return {
      local_id: row.local_id,
      shop_name: row.shop_name,
      country: row.country,
      currency: row.currency,
      currency_symbol: row.currency_symbol,
      tax_rate: row.tax_rate,
      business_day_start: row.business_day_start,
      nationalities: this.parseNationalities(row.nationalities),
      payment_methods: this.parsePaymentMethods(row.payment_methods),
      delivery_zones: this.parseDeliveryZones(row.delivery_zones),
      low_stock_threshold: row.low_stock_threshold,
      absence_alert_days: row.absence_alert_days,
      receipt_header: row.receipt_header,
      receipt_footer: row.receipt_footer,
      auto_hide_out_of_stock: row.auto_hide_out_of_stock === 1,
      shop_logo_path: row.shop_logo_path,
      sync_server_url: row.sync_server_url,
      updated_at: row.updated_at,
    };
  }
}

export const settingsRepository = new SettingsRepository();
