import { BaseRepository } from "./base.repository";
import { inventoryRepository } from "./inventory.repository";
import { sizesRepository } from "./sizes.repository";
import { customersRepository } from "./customers.repository";
import { onlineOrdersRepository } from "./online-orders.repository";
import { settingsRepository } from "./settings.repository";
import { assertPositive, assertNonNegative } from "../../shared/validation";
import {
  computeTotals,
  formatReceiptNumber,
  type CreateOrderInput,
  type CreateOrderResult,
  type OrderDTO,
  type OrderItemDTO,
  type OrderTotals,
  type SelectedModifier,
  type CalculateTotalsInput,
  type OrderType,
  type DiscountType,
  type OrderStatus,
} from "../../shared/orders";
import { modifierConsumptions, type ModifierGroup } from "../../shared/products";
import type {
  OrderRow,
  OrderItemRow,
  ProductRow,
} from "../../types/database.types";

interface BuiltLine {
  product_id: number;
  product_name: string;
  base_price: number;
  selected_modifiers: SelectedModifier[];
  unit_price: number;
  quantity: number;
  total_price: number;
  notes: string | null;
  sale_type: "piece" | "weight";
  // ===== لقطة الحجم =====
  variant_id: number | null;
  variant_size: string | null;
  /**
   * تكلفة **البند كله** للوحدة لحظة البيع: وصفة الحجم + المشترك + الإضافات اللي
   * بتخصم مواد. الويب بيقراها كتكلفة البند وبتستبدل تكلفة المنتج في الـCOGS
   * (`snapCost` في lib/reports/cogs.ts) — نفس اللي بتعمله الملابس والموبايل.
   */
  variant_cost_price: number | null;
  /** الخيارات المختارة — بتتمرر لخصم المخزون (الإضافة ممكن تخصم مادة) */
  option_ids: string[];
}

// أي بند في الفاتورة — منتج أو خدمة بلا منتج (وقت لعب)
interface OrderLine extends Omit<BuiltLine, "product_id"> {
  product_id: number | null;
}

// تاريخ اليوم التجاري YYYY-MM-DD حسب ساعة البداية
function toBusinessDate(date: Date, startHour: number): string {
  const x = new Date(date);
  if (x.getHours() < startHour) x.setDate(x.getDate() - 1);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export class OrdersRepository extends BaseRepository {
  private getSettings(): { tax_rate: number; business_day_start: number } {
    const row = this.db
      .prepare("SELECT tax_rate, business_day_start FROM settings WHERE id = 1")
      .get() as { tax_rate: number; business_day_start: number } | undefined;
    return {
      tax_rate: row?.tax_rate ?? 0,
      business_day_start: row?.business_day_start ?? 0,
    };
  }

  private parseModifiers(raw: string): ModifierGroup[] {
    try {
      const p = JSON.parse(raw) as ModifierGroup[];
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }

  // يبني بند الطلب من المنتج والخيارات المختارة — السعر يُحسب على السيرفر
  private buildLine(
    productId: number,
    quantity: number,
    optionIds: string[],
    notes: string | null,
    variantId?: number | null
  ): BuiltLine {
    const product = this.db
      .prepare("SELECT * FROM products WHERE id = ? AND is_deleted = 0")
      .get(productId) as ProductRow | undefined;
    if (!product) throw new Error("منتج غير موجود في الطلب");
    if (product.is_active !== 1) throw new Error(`المنتج غير مفعّل: ${product.name}`);
    if (product.is_available !== 1) throw new Error(`المنتج نفد: ${product.name}`);

    // ===== الحجم: بديل سعر، والسعر بيتقرا من القاعدة مش من العميل أبداً =====
    //
    // ⚠️ الحارس مبني على `has_sizes` (نية صريحة) **مش** على عدّ الأحجام الفعّالة.
    // نسخة الملابس اتلغبطت في ده: منتج كل مقاساته موقوفة كان العدّ بيطلع صفر
    // فالحارس يعدّي والبيعة تمرّ **بلا مقاس وبالسعر الأساسي بصمت**. هنا منتج
    // بالأحجام كل أحجامه موقوفة = **رفض بصوت عالي**، ومنتج بلا أحجام (كولا)
    // بيتباع عادي — وده الفرق عن الملابس اللي كل بيعة فيها لازم مقاس.
    const size = variantId ? sizesRepository.getById(variantId) : null;
    if (variantId && !size) throw new Error("الحجم غير موجود");
    if (size && size.product_id !== product.id) throw new Error("الحجم مش تابع للمنتج ده");
    if (size && !size.is_active) throw new Error(`الحجم موقوف: ${product.name} — ${size.size}`);
    if (product.has_sizes === 1 && !size) {
      if (sizesRepository.activeCount(product.id) === 0) {
        throw new Error(`كل أحجام ${product.name} موقوفة`);
      }
      throw new Error(`لازم تختار حجم لـ ${product.name}`);
    }

    const groups = this.parseModifiers(product.modifiers);
    const selected: SelectedModifier[] = [];
    for (const optionId of optionIds) {
      for (const g of groups) {
        const opt = g.options.find((o) => o.id === optionId);
        if (opt) {
          selected.push({
            group_id: g.id,
            group_name: g.name,
            option_id: opt.id,
            option_name: opt.name,
            price_adjustment: opt.price_adjustment,
          });
          break;
        }
      }
    }

    // تحقق المجموعات المطلوبة
    for (const g of groups) {
      if (g.is_required && !selected.some((s) => s.group_id === g.id)) {
        throw new Error(`اختر ${g.name} لـ ${product.name}`);
      }
    }

    // ⚠️ **لبّ الإصلاح:** الحجم **بيستبدل** سعر المنتج، والإضافات **بتتجمع فوقه**.
    // قبل كده كان `product.price + adjustments` بس — فبيتزا سعرها الأساسي سعر السمول
    // كانت بتاخد زيادة تانية لما الكاشير يختار «سمول».
    const basePrice = size ? size.price : product.price;
    const adjustments = selected.reduce((s, m) => s + m.price_adjustment, 0);
    const unit_price = basePrice + adjustments;

    // تكلفة الوحدة: وصفة الحجم (أو وصفة المنتج) + مواد الإضافات المختارة
    const recipeCost = size ? size.cost_price : sizesRepository.effectiveRecipeCost(product.id, null);
    const addonsCost = this.modifierConsumptionCost(groups, optionIds);

    // حراسة: الكمية لازم رقم موجب (يرفض السالب/الصفر/NaN قبل أي حساب)
    assertPositive(quantity, "الكمية");

    // الوزن: كمية عشرية (كيلو) | القطعة: كمية صحيحة
    const saleType = product.sale_type === "weight" ? "weight" : "piece";
    const qty =
      saleType === "weight"
        ? Math.max(0.001, quantity)
        : Math.max(1, Math.floor(quantity));

    return {
      product_id: product.id,
      product_name: product.name,
      base_price: basePrice,
      selected_modifiers: selected,
      unit_price,
      quantity: qty,
      total_price: unit_price * qty,
      notes: notes && notes.trim() ? notes.trim() : null,
      sale_type: saleType,
      variant_id: size?.id ?? null,
      variant_size: size?.size ?? null,
      variant_cost_price: recipeCost + addonsCost,
      option_ids: optionIds,
    };
  }

  /** تكلفة مواد الإضافات المختارة (جبنة إضافي = ٣٠ج جبنة) */
  private modifierConsumptionCost(groups: ModifierGroup[], optionIds: string[]): number {
    let cost = 0;
    for (const c of modifierConsumptions(groups, optionIds)) {
      const inv = this.db
        .prepare("SELECT cost_per_unit FROM inventory_items WHERE id = ? AND is_deleted = 0")
        .get(c.inventory_item_id) as { cost_per_unit: number } | undefined;
      cost += (inv?.cost_per_unit ?? 0) * c.qty;
    }
    return cost;
  }

  // حساب الإجماليات على السيرفر (للعرض الاختياري قبل الحفظ)
  calculateTotals(input: CalculateTotalsInput): OrderTotals {
    const lines = input.items.map((i) =>
      this.buildLine(i.product_id, i.quantity, i.modifier_option_ids, i.notes ?? null, i.variant_id)
    );
    const subtotal = lines.reduce((s, l) => s + l.total_price, 0);
    const { tax_rate } = this.getSettings();
    return computeTotals(subtotal, input.discount_type, input.discount_value, tax_rate);
  }

  // ===== أهم عملية: إنشاء طلب كامل في transaction واحدة =====
  create(
    input: CreateOrderInput,
    cashierId: number,
    cashierName: string
  ): CreateOrderResult {
    const serviceInputs = input.service_lines ?? [];
    if (!input.items.length && !serviceInputs.length) throw new Error("الطلب فاضي");
    for (const s of serviceInputs) {
      if (!s.name || !s.name.trim()) throw new Error("بند الخدمة لازم له اسم");
      assertNonNegative(s.price, "سعر بند الخدمة");
    }

    // حراسة السوالب: الخصم والمدفوع مينفعش يكونوا بالسالب (خصم سالب بيرفع الإجمالي)
    assertNonNegative(input.discount_value ?? 0, "قيمة الخصم");
    if (input.is_free !== true) {
      assertNonNegative(input.amount_paid ?? 0, "المبلغ المدفوع");
    }

    // التوصيل لازم عميل محدد (مينفعش زائر)
    if (input.order_type === "delivery" && (input.is_guest || !input.customer_id)) {
      throw new Error("التوصيل لازم تحدد عميل");
    }

    return this.transaction(() => {
      // ① بناء البنود وحساب الإجماليات (Server-Side)
      const lines = input.items.map((i) =>
        this.buildLine(i.product_id, i.quantity, i.modifier_option_ids, i.notes ?? null, i.variant_id)
      );
      // بنود الخدمة (وقت لعب) — بلا منتج، بتتحط الأول في الفاتورة
      const serviceLines: OrderLine[] = serviceInputs.map((s) => ({
        product_id: null,
        product_name: s.name.trim(),
        base_price: s.price,
        selected_modifiers: [],
        unit_price: s.price,
        quantity: 1,
        total_price: s.price,
        notes: null,
        sale_type: "piece",
        variant_id: null,
        variant_size: null,
        variant_cost_price: null,
        option_ids: [],
      }));
      // ⚠️ `allLines` للإجمالي والبنود والإسناد — و`lines` (منتجات بس) لخصم المخزون
      const allLines: OrderLine[] = [...serviceLines, ...lines];
      const subtotal = allLines.reduce((s, l) => s + l.total_price, 0);
      const { tax_rate, business_day_start } = this.getSettings();
      const totals = computeTotals(
        subtotal,
        input.discount_type,
        input.discount_value,
        tax_rate
      );
      // شبكة أمان: الإجمالي مايكونش سالب مهما كان مصدر السعر/الخصم (يمنع سرقة الباقي)
      assertNonNegative(totals.total, "إجمالي الفاتورة");

      // ② التحقق من المدفوع — الفاتورة المجانية متتدفعش (تتخصم من المخزون بس)
      const isFree = input.is_free === true;
      if (!isFree && input.amount_paid < totals.total - 0.001) {
        throw new Error("المبلغ المدفوع أقل من الإجمالي");
      }
      const amountPaid = isFree ? 0 : input.amount_paid;
      const change = isFree ? 0 : input.amount_paid - totals.total;

      // ③ رقم الفاتورة + اليوم التجاري
      const now = new Date();
      const businessDate = toBusinessDate(now, business_day_start);
      const seqRow = this.db
        .prepare("SELECT COUNT(*) AS c FROM orders WHERE business_date = ?")
        .get(businessDate) as { c: number };
      const receiptNumber = seqRow.c + 1;

      // ④ حفظ الطلب
      const localId = this.newLocalId();
      const nowISO = this.now();
      const customerName = input.is_guest
        ? null
        : customersRepository.getById(input.customer_id ?? -1)?.name ?? null;

      // ④b لقطة التوصيل (عرض/فاتورة فقط — ⚠️ مش داخلة في total ولا amount_paid ولا أي فلوس)
      const isDelivery = input.order_type === "delivery";
      const zone = isDelivery
        ? settingsRepository.getDeliveryZone(input.delivery_zone_id)
        : null;
      const deliveryFee = zone?.price ?? 0;
      const deliveryZoneName = zone?.name ?? null;
      const deliveryPersonId = isDelivery ? input.delivery_person_id ?? null : null;
      const deliveryPersonName = deliveryPersonId
        ? (this.db.prepare("SELECT name FROM users WHERE id = ?").get(deliveryPersonId) as { name: string } | undefined)?.name ?? null
        : null;
      // عنوان التوصيل: بيتكتب في الفاتورة وقت الدفع (لقطة تتطبع للدليفري)
      const deliveryAddress = isDelivery ? input.delivery_address?.trim() || null : null;

      const result = this.db
        .prepare(
          `INSERT INTO orders (
            local_id, receipt_number, customer_id, customer_name, is_guest, order_type, source, session_id,
            delivery_zone, delivery_fee, delivery_person_id, delivery_person_name, delivery_address,
            subtotal, discount_type, discount_value, discount_amount, tax_rate, tax_amount,
            total, payment_method, amount_paid, change_amount, status, is_free,
            free_recipient_type, free_recipient_id, free_recipient_name, notes,
            cashier_id, cashier_name, business_date, created_by, created_at, sync_status
          ) VALUES (
            @local_id, @receipt, @customer_id, @customer_name, @is_guest, @order_type, @source, @session_id,
            @delivery_zone, @delivery_fee, @delivery_person_id, @delivery_person_name, @delivery_address,
            @subtotal, @discount_type, @discount_value, @discount_amount, @tax_rate, @tax_amount,
            @total, @payment_method, @amount_paid, @change, 'paid', @is_free,
            @free_recipient_type, @free_recipient_id, @free_recipient_name, @notes,
            @cashier_id, @cashier_name, @business_date, @cashier_id, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          receipt: receiptNumber,
          customer_id: input.is_guest ? null : input.customer_id ?? null,
          customer_name: customerName,
          is_guest: input.is_guest ? 1 : 0,
          order_type: input.order_type,
          source: input.source ?? "pos",
          // الحساب (غرفة/طاولة) — «بلايستيشن + كافيه»: تقسيم الفاتورة بيطلّع أكتر من فاتورة للحساب
          session_id: input.session_id ?? null,
          delivery_zone: deliveryZoneName,
          delivery_fee: deliveryFee,
          delivery_person_id: deliveryPersonId,
          delivery_person_name: deliveryPersonName,
          delivery_address: deliveryAddress,
          subtotal: totals.subtotal,
          discount_type: totals.discount_type,
          discount_value: totals.discount_value,
          discount_amount: totals.discount_amount,
          tax_rate: totals.tax_rate,
          tax_amount: totals.tax_amount,
          total: totals.total,
          payment_method: input.payment_method,
          amount_paid: amountPaid,
          change,
          is_free: isFree ? 1 : 0,
          free_recipient_type: isFree ? input.free_recipient_type ?? null : null,
          free_recipient_id: isFree ? input.free_recipient_id ?? null : null,
          free_recipient_name: isFree ? input.free_recipient_name ?? null : null,
          notes: input.notes?.trim() || null,
          cashier_id: cashierId,
          cashier_name: cashierName,
          business_date: businessDate,
          now: nowISO,
        });

      const orderId = Number(result.lastInsertRowid);

      // ⑤ حفظ البنود
      const insertItem = this.db.prepare(
        `INSERT INTO order_items (
          local_id, order_id, product_id, product_name, base_price,
          selected_modifiers, unit_price, quantity, total_price, notes, sale_type,
          variant_id, variant_size, variant_cost_price, created_at, sync_status
        ) VALUES (
          @local_id, @order_id, @product_id, @product_name, @base_price,
          @selected_modifiers, @unit_price, @quantity, @total_price, @notes, @sale_type,
          @variant_id, @variant_size, @variant_cost_price, @now, 'pending'
        )`
      );
      for (const line of allLines) {
        insertItem.run({
          local_id: this.newLocalId(),
          order_id: orderId,
          product_id: line.product_id,
          product_name: line.product_name,
          base_price: line.base_price,
          selected_modifiers: JSON.stringify(line.selected_modifiers),
          unit_price: line.unit_price,
          quantity: line.quantity,
          total_price: line.total_price,
          notes: line.notes,
          sale_type: line.sale_type,
          variant_id: line.variant_id,
          variant_size: line.variant_size,
          variant_cost_price: line.variant_cost_price,
          now: nowISO,
        });
      }

      // ⚠️ نسخة البلايستيشن: مفيش «بائعين» → مابنسجّلش لقطة البائعين الحاضرين (order_sellers).
      // الجدول والقراءة (loadSellers) فاضلين عشان الفواتير القديمة وعقد المزامنة مايتكسروش.

      // ⑥ خصم المخزون تلقائياً
      inventoryRepository.deductForOrder(
        orderId,
        lines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          quantity: l.quantity,
          option_ids: l.option_ids,
        })),
        cashierId
      );

      // ⑦ تحديث إحصاءات العميل لو مش زائر (زيارات/إنفاق/مفضل/تصنيف)
      // المجانية مبتزوّدش الإنفاق ولا الزيارات (بتظهر في قسم المجاني لوحده)
      if (!isFree && !input.is_guest && input.customer_id) {
        customersRepository.updateStats(input.customer_id, totals.total, nowISO);
      }

      // ⑧ ربط طلب المتجر (لو السلة اتملّت منه) → done + هيتبلّغ الويب في السحب الجاي
      if (input.online_order_local_id) {
        onlineOrdersRepository.attachOrder(input.online_order_local_id, orderId);
      }

      // ⑨ + ⑩ المزامنة (الطلب الكامل) — الـ audit يُسجَّل في الـ IPC
      const order = this.getById(orderId)!;
      this.enqueue("order", "CREATED", localId, this.syncPayload(orderId));

      return { order, change };
    });
  }

  cancel(id: number, reason: string, actorId: number | null): OrderDTO {
    const existing = this.findRow(id);
    if (!existing) throw new Error("الطلب غير موجود");
    if (existing.status === "cancelled") throw new Error("الطلب ملغي بالفعل");

    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE orders SET status = 'cancelled', cancelled_by = @actor, cancel_reason = @reason,
           cancelled_at = @now, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, actor: actorId, reason, now: this.now() });

      // رجوع المخزون اللي اتخصم للطلب ده (يتزامن مع الويب زي ما اتخصم)
      inventoryRepository.restoreForOrder(id, actorId);

      // لو البيعة دي كانت طلب متجر: الطلب يتلغي كمان ويترفع للويب، وإلا الزبون

      // بيفضل شايف «اتسلّم 🎉» لفاتورة اتلغت. جوّه الترانزاكشن عشان الاتنين

      // يحصلوا مع بعض أو ولا واحد.

      onlineOrdersRepository.cancelByDesktopOrderId(id);


      const order = this.getById(id)!;
      this.enqueue("order", "UPDATED", order.local_id, this.syncPayload(id));
      return order;
    });
  }

  private findRow(id: number): OrderRow | null {
    const row = this.db
      .prepare("SELECT * FROM orders WHERE id = ? AND is_deleted = 0")
      .get(id) as OrderRow | undefined;
    return row ?? null;
  }

  private loadItems(orderId: number): OrderItemDTO[] {
    const rows = this.db
      .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC")
      .all(orderId) as OrderItemRow[];
    return rows.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.product_name,
      base_price: r.base_price,
      selected_modifiers: this.parseSelected(r.selected_modifiers),
      unit_price: r.unit_price,
      quantity: r.quantity,
      total_price: r.total_price,
      notes: r.notes,
      sale_type: r.sale_type === "weight" ? "weight" : "piece",
      variant_id: r.variant_id ?? null,
      variant_size: r.variant_size ?? null,
    }));
  }

  private loadSellers(
    orderId: number
  ): { id: number; name: string; attributed_amount: number | null }[] {
    const rows = this.db
      .prepare(
        "SELECT seller_id AS id, seller_name AS name, attributed_amount FROM order_sellers WHERE order_id = ? ORDER BY id ASC"
      )
      .all(orderId) as { id: number; name: string | null; attributed_amount: number | null }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? "—",
      attributed_amount: r.attributed_amount ?? null,
    }));
  }

  private parseSelected(raw: string): SelectedModifier[] {
    try {
      const p = JSON.parse(raw) as SelectedModifier[];
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }

  private toDTO(row: OrderRow): OrderDTO {
    return {
      id: row.id,
      local_id: row.local_id,
      receipt_number: row.receipt_number,
      receipt_label: formatReceiptNumber(row.receipt_number),
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      is_guest: row.is_guest === 1,
      order_type: row.order_type as OrderType,
      // ⚠️ كان بيحوّل أي مصدر غير المتجر لـ"pos" — فاتورة الجلسة كانت هتتبعت للويب
      // كبيعة كاشير عادية وتقرير الغرف والجلسات يلاقي صفر فواتير
      source:
        row.source === "online_store" || row.source === "table_session"
          ? row.source
          : "pos",
      delivery_zone: row.delivery_zone ?? null,
      delivery_fee: row.delivery_fee ?? 0,
      delivery_person_id: row.delivery_person_id ?? null,
      delivery_person_name: row.delivery_person_name ?? null,
      delivery_address: row.delivery_address ?? null,
      subtotal: row.subtotal,
      discount_type: row.discount_type as DiscountType,
      discount_value: row.discount_value,
      discount_amount: row.discount_amount,
      tax_rate: row.tax_rate,
      tax_amount: row.tax_amount,
      total: row.total,
      payment_method: row.payment_method,
      amount_paid: row.amount_paid,
      change_amount: row.change_amount,
      status: row.status as OrderStatus,
      is_free: row.is_free === 1,
      free_recipient_type:
        row.free_recipient_type === "staff" || row.free_recipient_type === "customer"
          ? row.free_recipient_type
          : null,
      free_recipient_id: row.free_recipient_id,
      free_recipient_name: row.free_recipient_name,
      notes: row.notes,
      cashier_id: row.cashier_id,
      cashier_name: row.cashier_name,
      business_date: row.business_date,
      created_at: row.created_at,
      items: this.loadItems(row.id),
      sellers: this.loadSellers(row.id),
    };
  }

  getById(id: number): OrderDTO | null {
    const row = this.findRow(id);
    return row ? this.toDTO(row) : null;
  }

  // payload المزامنة الكامل للطلب: DTO (وبه البنود) + حقول الإلغاء والمُنشئ
  private syncPayload(id: number): Record<string, unknown> | null {
    const row = this.findRow(id);
    if (!row) return null;
    return {
      ...this.toDTO(row),
      created_by: row.created_by,
      cancelled_by: row.cancelled_by,
      cancel_reason: row.cancel_reason,
      cancelled_at: row.cancelled_at,
      // الويب بيحوّله session_desktop_id (SYNC-CONTRACT §5.23)
      session_id: row.session_id ?? null,
    };
  }

  getRecent(limit = 10): OrderDTO[] {
    const rows = this.db
      .prepare("SELECT * FROM orders WHERE is_deleted = 0 ORDER BY id DESC LIMIT ?")
      .all(limit) as OrderRow[];
    return rows.map((r) => this.toDTO(r));
  }

  getByDate(businessDate: string): OrderDTO[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM orders WHERE business_date = ? AND is_deleted = 0 ORDER BY id DESC"
      )
      .all(businessDate) as OrderRow[];
    return rows.map((r) => this.toDTO(r));
  }
}

export const ordersRepository = new OrdersRepository();
