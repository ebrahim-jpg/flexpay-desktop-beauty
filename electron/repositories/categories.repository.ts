import { BaseRepository } from "./base.repository";
import type { CategoryRow } from "../../types/database.types";
import type {
  CategoryDTO,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../../shared/products";

export class CategoriesRepository extends BaseRepository {
  private toDTO(row: CategoryRow & { product_count?: number }): CategoryDTO {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      icon: row.icon,
      sort_order: row.sort_order,
      is_active: row.is_active === 1,
      product_count: row.product_count ?? 0,
    };
  }

  private findRow(id: number): CategoryRow | null {
    const row = this.db
      .prepare("SELECT * FROM categories WHERE id = ? AND is_deleted = 0")
      .get(id) as CategoryRow | undefined;
    return row ?? null;
  }

  getAll(): CategoryDTO[] {
    const rows = this.db
      .prepare(
        `SELECT c.*,
          (SELECT COUNT(*) FROM products p
           WHERE p.category_id = c.id AND p.is_deleted = 0) AS product_count
         FROM categories c
         WHERE c.is_deleted = 0
         ORDER BY c.sort_order ASC, c.id ASC`
      )
      .all() as (CategoryRow & { product_count: number })[];
    return rows.map((r) => this.toDTO(r));
  }

  getById(id: number): CategoryDTO | null {
    const row = this.findRow(id);
    return row ? this.toDTO(row) : null;
  }

  private nextSortOrder(): number {
    const row = this.db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories WHERE is_deleted = 0"
      )
      .get() as { m: number };
    return row.m + 1;
  }

  create(input: CreateCategoryInput, actorId: number | null): CategoryDTO {
    const localId = this.newLocalId();
    const now = this.now();

    return this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO categories (
            local_id, name, icon, sort_order, is_active,
            created_by, updated_by, created_at, updated_at, sync_status
          ) VALUES (
            @local_id, @name, @icon, @sort_order, 1,
            @actor, @actor, @now, @now, 'pending'
          )`
        )
        .run({
          local_id: localId,
          name: input.name,
          icon: input.icon ?? null,
          sort_order: this.nextSortOrder(),
          actor: actorId,
          now,
        });

      const created = this.findRow(Number(result.lastInsertRowid))!;
      this.enqueue("category", "CREATED", localId, this.toSyncPayload(created));
      return this.toDTO(created);
    });
  }

  update(input: UpdateCategoryInput, actorId: number | null): CategoryDTO {
    const existing = this.findRow(input.id);
    if (!existing) throw new Error("الفئة غير موجودة");

    const fields: string[] = ["updated_at = @now", "updated_by = @actor", "sync_status = 'pending'"];
    const params: Record<string, unknown> = {
      id: input.id,
      now: this.now(),
      actor: actorId,
    };
    if (input.name !== undefined) {
      fields.push("name = @name");
      params.name = input.name;
    }
    if (input.icon !== undefined) {
      fields.push("icon = @icon");
      params.icon = input.icon;
    }

    return this.transaction(() => {
      this.db
        .prepare(`UPDATE categories SET ${fields.join(", ")} WHERE id = @id`)
        .run(params);
      const updated = this.findRow(input.id)!;
      this.enqueue("category", "UPDATED", updated.local_id, this.toSyncPayload(updated));
      return this.toDTO(updated);
    });
  }

  reorder(ids: number[], actorId: number | null): boolean {
    return this.transaction(() => {
      const stmt = this.db.prepare(
        "UPDATE categories SET sort_order = @order, updated_by = @actor, updated_at = @now, sync_status = 'pending' WHERE id = @id AND is_deleted = 0"
      );
      ids.forEach((id, index) => {
        stmt.run({ id, order: index + 1, actor: actorId, now: this.now() });
        const row = this.findRow(id);
        if (row) {
          this.enqueue("category", "UPDATED", row.local_id, this.toSyncPayload(row));
        }
      });
      return true;
    });
  }

  softDelete(id: number, actorId: number | null): boolean {
    const existing = this.findRow(id);
    if (!existing) throw new Error("الفئة غير موجودة");

    const count = this.db
      .prepare(
        "SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND is_deleted = 0"
      )
      .get(id) as { c: number };
    if (count.c > 0) {
      throw new Error("مينفعش تحذف فئة فيها منتجات. انقل أو احذف المنتجات الأول.");
    }

    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE categories SET is_deleted = 1, deleted_by = @actor, deleted_at = @now, sync_status = 'pending' WHERE id = @id`
        )
        .run({ id, actor: actorId, now: this.now() });
      this.enqueue("category", "DELETED", existing.local_id, {
        local_id: existing.local_id,
      });
      return true;
    });
  }

  private toSyncPayload(row: CategoryRow) {
    return {
      id: row.id,
      local_id: row.local_id,
      name: row.name,
      icon: row.icon,
      sort_order: row.sort_order,
      is_active: row.is_active === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const categoriesRepository = new CategoriesRepository();
