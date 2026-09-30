import { ipcMain } from "electron";
import { categoriesRepository } from "../repositories/categories.repository";
import { productsRepository } from "../repositories/products.repository";
import { sizesRepository } from "../repositories/sizes.repository";
import { auditRepository } from "../repositories/audit.repository";
import { usersRepository } from "../repositories/users.repository";
import { getCurrentActor } from "./session";
import type { IpcResult } from "../../types/ipc.types";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateProductInput,
  UpdateProductInput,
  SaveRecipeInput,
  GetRecipeInput,
} from "../../shared/products";
import type { SaveSizesInput } from "../../shared/sizes";

function handle<T>(fn: () => T): IpcResult<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "حصل خطأ غير متوقع";
    return { ok: false, error: message };
  }
}

function actorName(): string {
  const actor = getCurrentActor();
  if (actor == null) return "النظام";
  return usersRepository.getById(actor)?.name ?? "النظام";
}

// إجراءات المالك فقط — نتأكد في الـ Main مش الواجهة بس (حماية حقيقية)
function requireOwner(): number | null {
  const actor = getCurrentActor();
  const role = actor != null ? usersRepository.getById(actor)?.role : null;
  if (role !== "owner") {
    throw new Error("الإجراء ده للمالك بس");
  }
  return actor;
}

function audit(
  action: string,
  entityType: string,
  entityId: number,
  values?: { oldValue?: unknown; newValue?: unknown }
): void {
  auditRepository.log({
    userId: getCurrentActor() ?? 0,
    userName: actorName(),
    action,
    entityType,
    entityId,
    oldValue: values?.oldValue,
    newValue: values?.newValue,
  });
}

export function registerProductsIpc(): void {
  // ===== الفئات =====
  ipcMain.handle("categories:getAll", () =>
    handle(() => categoriesRepository.getAll())
  );

  ipcMain.handle("categories:create", (_e, input: CreateCategoryInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const created = categoriesRepository.create(input, actor);
      audit(`إضافة فئة: ${created.name}`, "category", created.id, {
        newValue: created,
      });
      return created;
    })
  );

  ipcMain.handle("categories:update", (_e, input: UpdateCategoryInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const before = categoriesRepository.getById(input.id);
      const updated = categoriesRepository.update(input, actor);
      audit(`تعديل فئة: ${updated.name}`, "category", updated.id, {
        oldValue: before,
        newValue: updated,
      });
      return updated;
    })
  );

  ipcMain.handle("categories:reorder", (_e, input: { ids: number[] }) =>
    handle(() => categoriesRepository.reorder(input.ids, getCurrentActor()))
  );

  ipcMain.handle("categories:delete", (_e, id: number) =>
    handle(() => {
      const actor = getCurrentActor();
      const before = categoriesRepository.getById(id);
      const ok = categoriesRepository.softDelete(id, actor);
      audit(`حذف فئة: ${before?.name ?? id}`, "category", id, {
        oldValue: before,
      });
      return ok;
    })
  );

  // ===== المنتجات =====
  ipcMain.handle("products:getAll", () =>
    handle(() => productsRepository.getAll())
  );

  ipcMain.handle("products:getByCategory", (_e, categoryId: number) =>
    handle(() => productsRepository.getByCategory(categoryId))
  );

  ipcMain.handle("products:getByBarcode", (_e, barcode: string) =>
    handle(() => productsRepository.getByBarcode(barcode))
  );

  ipcMain.handle("products:search", (_e, term: string) =>
    handle(() => productsRepository.search(term))
  );

  ipcMain.handle("products:getAvailable", () =>
    handle(() => productsRepository.getAvailable())
  );

  ipcMain.handle("products:create", (_e, input: CreateProductInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const created = productsRepository.create(input, actor);
      audit(`إضافة منتج: ${created.name}`, "product", created.id, {
        newValue: created,
      });
      return created;
    })
  );

  ipcMain.handle("products:update", (_e, input: UpdateProductInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const beforeProduct = productsRepository
        .getAll()
        .find((p) => p.id === input.id);
      const updated = productsRepository.update(input, actor);
      // تعديل السعر عملية حساسة (الدستور)
      const priceChanged =
        beforeProduct && input.price !== undefined && beforeProduct.price !== input.price;
      audit(
        priceChanged
          ? `تعديل سعر منتج: ${updated.name} (${beforeProduct?.price} ← ${updated.price})`
          : `تعديل منتج: ${updated.name}`,
        "product",
        updated.id,
        { oldValue: beforeProduct, newValue: updated }
      );
      return updated;
    })
  );

  ipcMain.handle(
    "products:toggleAvailability",
    (_e, input: { id: number; available: boolean }) =>
      handle(() => {
        const updated = productsRepository.toggleAvailability(
          input.id,
          input.available,
          getCurrentActor()
        );
        audit(
          `${input.available ? "تفعيل" : "تعطيل"} توفر منتج: ${updated.name}`,
          "product",
          updated.id
        );
        return updated;
      })
  );

  // شيل/رجّع من الكاشير (is_active) — للمالك فقط
  ipcMain.handle(
    "products:setActive",
    (_e, input: { id: number; active: boolean }) =>
      handle(() => {
        const actor = requireOwner();
        const updated = productsRepository.setActive(input.id, input.active, actor);
        audit(
          `${input.active ? "رجّع للكاشير" : "شال من الكاشير"}: ${updated.name}`,
          "product",
          updated.id
        );
        return updated;
      })
  );

  ipcMain.handle("products:delete", (_e, id: number) =>
    handle(() => {
      const actor = getCurrentActor();
      const before = productsRepository.getAll().find((p) => p.id === id);
      const ok = productsRepository.softDelete(id, actor);
      audit(`حذف منتج: ${before?.name ?? id}`, "product", id, {
        oldValue: before,
      });
      return ok;
    })
  );

  // ===== الوصفات =====
  // ⚠️ النطاق: `undefined` = كل الصفوف · `null` = المشترك بس · رقم = حجم معيّن
  ipcMain.handle("products:getRecipe", (_e, input: GetRecipeInput) =>
    handle(() =>
      typeof input === "number"
        ? productsRepository.getRecipe(input)
        : productsRepository.getRecipe(input.product_id, input.variant_id ?? null)
    )
  );

  ipcMain.handle("products:getRecipesOverview", () =>
    handle(() => productsRepository.getRecipesOverview())
  );

  ipcMain.handle("products:saveRecipe", (_e, input: SaveRecipeInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const scope = input.variant_id ?? null;
      const before = productsRepository.getRecipe(input.product_id, scope); // الوصفة قبل التعديل
      const result = productsRepository.saveRecipe(input.product_id, input.items, actor, scope);
      const sizeName = scope ? (sizesRepository.getById(scope)?.size ?? null) : null;
      const name = sizeName
        ? `${productsRepository.getName(input.product_id)} — ${sizeName}`
        : productsRepository.getName(input.product_id);
      const mapItems = (
        r: { inventory_item_name: string; standard_qty: number; unit: string }[]
      ) => r.map((x) => ({ name: x.inventory_item_name, qty: x.standard_qty, unit: x.unit }));
      // تمييز: ربط أول وصفة / مسح الوصفة / تعديل
      const action =
        before.length === 0 && result.length > 0
          ? `ربط وصفة منتج: ${name}`
          : result.length === 0
            ? `مسح وصفة منتج: ${name}`
            : `تعديل وصفة منتج: ${name}`;
      audit(action, "product", input.product_id, {
        oldValue: { recipe: mapItems(before) },
        newValue: { product_name: name, recipe: mapItems(result) },
      });
      return result;
    })
  );

  ipcMain.handle("products:calculateCost", (_e, productId: number) =>
    handle(() => productsRepository.calculateCost(productId))
  );

  // ===== الأحجام =====
  ipcMain.handle("sizes:getByProduct", (_e, productId: number) =>
    handle(() => sizesRepository.getByProduct(productId))
  );

  ipcMain.handle("sizes:save", (_e, input: SaveSizesInput) =>
    handle(() => {
      const actor = getCurrentActor();
      const before = sizesRepository.getByProduct(input.product_id);
      const result = sizesRepository.save(input, actor);
      const name = productsRepository.getName(input.product_id);
      const snap = (rows: { size: string; price: number; is_active: boolean }[]) =>
        rows.map((r) => ({ size: r.size, price: r.price, active: r.is_active }));
      audit(`تعديل أحجام منتج: ${name}`, "product", input.product_id, {
        oldValue: { sizes: snap(before) },
        newValue: { product_name: name, sizes: snap(result) },
      });
      return result;
    })
  );
}
