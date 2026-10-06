// منطق الاستيراد — التخطيط (بلا كتابة) والتنفيذ.
//
// ⚠️ **مفيش SQL خاص بالملف ده.** كل الكتابة بتعدّي على `create()` و`update()`
// الموجودين في المستودعات، عشان تاخد مجانًا: تطبيع الباركود · فحص التعارض ·
// التحديث الجزئي · و**حدث المزامنة**. الكتابة المباشرة كانت هتتخطّى دول كلهم
// **بصمت** — والمنتجات تعيش على الديسكتوب وعمرها ما تظهر على الويب.
//
// وفيه محلات شغّالة على النسخة دي فعليًا، فالاستيراد **بيضيف ويحدّث بس** —
// عمره ما بيحذف ولا بيوقّف ولا بيمسح قيمة موجودة بخانة فاضية.

import { getDatabase } from "../../database/connection";
import { productsRepository } from "../../repositories/products.repository";
import { categoriesRepository } from "../../repositories/categories.repository";
import { customersRepository } from "../../repositories/customers.repository";
import {
  nameKey,
  saleTypeLabel,
  isValidPhone,
  normalizePhone,
  type ProductImportRow,
  type CustomerImportRow,
  type ProductPlan,
  type ProductPlanRow,
  type CustomerPlan,
  type CustomerPlanRow,
  type ImportResult,
} from "../../../shared/data-transfer";
import type { SaleType } from "../../../shared/products";

// الأنواع في الطبقة المشتركة — بتعدّي على الـIPC للواجهة وترجع
export type ProductRow = ProductImportRow;
export type CustomerRow = CustomerImportRow;

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * تخطيط استيراد المنتجات — **مابيكتبش أي حاجة**.
 *
 * مفتاح المطابقة: **الباركود، وإلا الاسم + الفئة**.
 * ⚠️ الفئة جزء من المفتاح عن قصد: نص المنتجات الحقيقية مالهاش باركود، ومطابقة
 * بالاسم لوحده كانت هتخلّي «كيلو» في الخضار تدوس على «كيلو» في الفاكهة.
 */
export function planProducts(rows: ProductRow[], unknownHeaders: string[]): ProductPlan {
  const cats = categoriesRepository.getAll();
  const catByName = new Map(cats.map((c) => [nameKey(c.name), c]));
  const products = productsRepository.getAll();

  // ⚠️ المطابقة بالاسم والفئة بس — **مفيش باركود في نسخة الخدمات** (الخدمة
  // مالهاش باركود). قبل كده كان الباركود هو المفتاح الأول للمطابقة.
  const byNameCat = new Map<string, (typeof products)[number]>();
  for (const p of products) {
    byNameCat.set(`${nameKey(p.name)}|${p.category_id ?? ""}`, p);
  }

  const newCategories: string[] = [];
  const seenNewCat = new Set<string>();
  const out: ProductPlanRow[] = [];
  const counts = { create: 0, update: 0, skip: 0, error: 0 };

  for (const r of rows) {
    const name = r.name.trim();
    if (!name) {
      out.push({ row: r.row, action: "error", name: "", message: "الاسم فاضي" });
      counts.error++;
      continue;
    }
    if (name.length < 2) {
      out.push({ row: r.row, action: "error", name, message: "الاسم قصير (حرفين على الأقل)" });
      counts.error++;
      continue;
    }
    if (r.price == null) {
      out.push({ row: r.row, action: "error", name, message: "السعر ناقص" });
      counts.error++;
      continue;
    }
    if (Number.isNaN(r.price) || r.price < 0) {
      out.push({ row: r.row, action: "error", name, message: "السعر مش رقم صحيح" });
      counts.error++;
      continue;
    }
    if (r.cost != null && (Number.isNaN(r.cost) || r.cost < 0)) {
      out.push({ row: r.row, action: "error", name, message: "التكلفة مش رقم صحيح" });
      counts.error++;
      continue;
    }

    const catName = r.category.trim();
    const cat = catName ? catByName.get(nameKey(catName)) : undefined;
    const catId = cat?.id ?? null;

    if (catName && !cat && !seenNewCat.has(nameKey(catName))) {
      seenNewCat.add(nameKey(catName));
      newCategories.push(catName);
    }

    const target = byNameCat.get(`${nameKey(name)}|${catId ?? ""}`);

    if (!target) {
      out.push({ row: r.row, action: "create", name });
      counts.create++;
      continue;
    }

    // إيه اللي هيتغيّر فعلاً؟ الفاضي مايتحسبش تغيير.
    const changes: Record<string, [string, string]> = {};
    if (Math.abs(target.price - r.price) > 0.0001) {
      changes["السعر"] = [fmt(target.price), fmt(r.price)];
    }
    if (r.cost != null && Math.abs(target.cost_price - r.cost) > 0.0001) {
      changes["التكلفة"] = [fmt(target.cost_price), fmt(r.cost)];
    }
    if (nameKey(target.name) !== nameKey(name)) {
      changes["الاسم"] = [target.name, name];
    }

    if (Object.keys(changes).length === 0) {
      out.push({ row: r.row, action: "skip", name, targetId: target.id, message: "مفيش تغيير" });
      counts.skip++;
    } else {
      out.push({ row: r.row, action: "update", name, targetId: target.id, changes });
      counts.update++;
    }
  }

  return { rows: out, newCategories, counts, unknownHeaders };
}

function parseSaleTypeSafe(raw: string): SaleType {
  const s = raw.toLowerCase();
  return ["كيلو", "وزن", "بالوزن", "بالكيلو", "kg", "weight", "kilo"].some((w) => s.includes(w))
    ? "weight"
    : "piece";
}

/**
 * تنفيذ استيراد المنتجات.
 *
 * ⚠️ **معاملة واحدة خارجية**: لو أي صف فشل، الاستيراد كله يرجع زي ما كان.
 * better-sqlite3 بيحوّل معاملات المستودعات المتداخلة لـSAVEPOINT فده آمن.
 *
 * ⚠️ **الترتيب مهم**: الفئات الأول عشان المنتجات تعرف أرقامها. حمولة المزامنة
 * بتحمل `category_id` **رقمي**، فلو المنتج اتعمل قبل فئته الـFK بتبوظ على الويب.
 */
export function applyProducts(rows: ProductRow[], actorId: number | null): ImportResult {
  const db = getDatabase();
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, backupPath: null };

  db.transaction(() => {
    // ① الفئات الناقصة
    const cats = categoriesRepository.getAll();
    const catByName = new Map(cats.map((c) => [nameKey(c.name), c.id]));
    for (const r of rows) {
      const n = r.category.trim();
      if (!n || catByName.has(nameKey(n))) continue;
      const made = categoriesRepository.create({ name: n }, actorId);
      catByName.set(nameKey(n), made.id);
    }

    // ② المنتجات — بنعيد التخطيط جوّه المعاملة عشان أرقام الفئات الجديدة تتحسب
    const plan = planProducts(rows, []);
    const byRow = new Map(plan.rows.map((p) => [p.row, p]));

    for (const r of rows) {
      const p = byRow.get(r.row);
      if (!p || p.action === "error") continue;
      if (p.action === "skip") {
        result.skipped++;
        continue;
      }

      const catId = r.category.trim() ? catByName.get(nameKey(r.category)) ?? null : null;

      if (p.action === "create") {
        const made = productsRepository.create(
          {
            name: r.name.trim(),
            category_id: catId,
            price: r.price!,
            // 🔴 **خدمة** — ده كان أخطر باب: الاستيراد ماكانش بيبعت `is_service`
            // خالص، فكل سطر من إكسل كان بيدخل **منتج بضاعة** في نسخة خدمات بس.
            // (والريبو بيثبّتها كمان — حزام وحمّالة.)
            is_service: true,
            // ومفيش باركود ولا بيع بالوزن: خدمة مالهاش باركود، والكيلو للخامات
            // في المخزون مش للبيع.
            sale_type: "piece",
          },
          actorId
        );
        // ⚠️ التكلفة مش في `create` ولا في `update` — ليها دالة مستقلة بترفض
        // المنتج اللي له وصفة (تكلفته محسوبة من المخزون)
        if (r.cost != null) {
          productsRepository.setCostPrice(made.id, r.cost, actorId);
        }
        result.created++;
      } else {
        // ⚠️ **الفاضي بيتبعت `undefined` مش قيمة فاضية** — `update()` جزئي
        // بالتصميم، فالعمود اللي مش في الملف مايتلمسش.
        productsRepository.update(
          {
            id: p.targetId!,
            name: r.name.trim(),
            price: r.price!,
            ...(catId != null ? { category_id: catId } : {}),
          },
          actorId
        );
        if (r.cost != null) {
          productsRepository.setCostPrice(p.targetId!, r.cost, actorId);
        }
        result.updated++;
      }
    }
  })();

  return result;
}

/**
 * تخطيط استيراد العملاء.
 *
 * ⚠️ **الموبايل الموجود = تخطّي كامل.** ماينفعش نحدّث بيانات عميل قايم من ملف
 * إكسل — العميل عنده تاريخ شراء وتصنيف وملاحظات، وملف فيه «اسم ورقم» بس ممكن
 * يدوس عليها.
 */
export function planCustomers(rows: CustomerRow[], unknownHeaders: string[] = []): CustomerPlan {
  const db = getDatabase();
  const existing = new Set(
    (db.prepare("SELECT phone FROM customers WHERE is_deleted = 0 AND phone IS NOT NULL").all() as {
      phone: string;
    }[]).map((r) => r.phone)
  );

  const out: CustomerPlanRow[] = [];
  const counts = { create: 0, update: 0, skip: 0, error: 0 };
  const seen = new Set<string>();

  for (const r of rows) {
    // ⚠️ التطبيع هنا كمان مش في القارئ بس — المخطّط مايفترضش إن اللي بينده
    // عليه طبّع. أرقام عربية جاية من أي مسار تانٍ كانت هتتحوّل «خطأ» بدل تخطّي.
    const phone = normalizePhone(r.phone);
    if (!phone) {
      out.push({ row: r.row, action: "error", name: r.name, phone: "", message: "الموبايل فاضي" });
      counts.error++;
      continue;
    }
    if (!isValidPhone(phone)) {
      out.push({
        row: r.row,
        action: "error",
        name: r.name,
        phone,
        message: "رقم الموبايل لازم يكون 11 رقم",
      });
      counts.error++;
      continue;
    }
    if (existing.has(phone) || seen.has(phone)) {
      out.push({
        row: r.row,
        action: "skip",
        name: r.name,
        phone,
        message: existing.has(phone) ? "موجود عندك — مش هيتلمس" : "مكرّر في الملف",
      });
      counts.skip++;
      continue;
    }
    seen.add(phone);
    out.push({ row: r.row, action: "create", name: r.name, phone });
    counts.create++;
  }

  return { rows: out, counts, unknownHeaders };
}

export function applyCustomers(rows: CustomerPlanRow[], actorId: number | null): ImportResult {
  const db = getDatabase();
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, backupPath: null };

  db.transaction(() => {
    for (const r of rows) {
      if (r.action !== "create") {
        if (r.action === "skip") result.skipped++;
        continue;
      }
      // ⚠️ حارس تاني فوق التخطيط: لو الرقم اتضاف بين التخطيط والتنفيذ، الفهرس
      // الفريد كان هيرمي المعاملة كلها. بنفحص هنا كمان.
      const dup = db
        .prepare("SELECT 1 FROM customers WHERE phone = ? AND is_deleted = 0")
        .get(r.phone);
      if (dup) {
        result.skipped++;
        continue;
      }
      // ⚠️ الجنس بيتبعت صراحةً من هنا مش من تعديل في `create` — الكاشير بيستخدم
      // نفس الدالة للإضافة السريعة، وتغيير افتراضيها لمس لمسار البيع على محلات
      // شغّالة. الافتراضي المطلوب للاستيراد: ذكر + أول جنسية في الإعدادات.
      customersRepository.create(
        { phone: r.phone, name: r.name || "", gender: "male" },
        actorId
      );
      result.created++;
    }
  })();

  return result;
}
