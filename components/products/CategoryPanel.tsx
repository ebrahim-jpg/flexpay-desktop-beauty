"use client";

import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/shared/icons";
import { cn } from "@/lib/utils";
import type { CategoryDTO } from "@/shared/products";

interface CategoryPanelProps {
  categories: CategoryDTO[];
  selectedId: number | null; // null = الكل
  canManage: boolean;
  onSelect: (id: number | null) => void;
  onAdd: () => void;
  onEdit: (category: CategoryDTO) => void;
  onDelete: (category: CategoryDTO) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}

export function CategoryPanel({
  categories,
  selectedId,
  canManage,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
  onMove,
}: CategoryPanelProps) {
  const totalProducts = categories.reduce((s, c) => s + c.product_count, 0);

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col gap-3 border-l border-border pl-4">
      {canManage && (
        <Button onClick={onAdd} variant="outline" className="w-full">
          <Plus className="h-4 w-4" />
          إضافة فئة
        </Button>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto">
        {/* الكل */}
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-right text-sm transition-colors",
            selectedId === null
              ? "bg-primary text-primary-foreground"
              : "text-text-primary hover:bg-surface-secondary"
          )}
        >
          <LayoutGrid className="h-5 w-5 shrink-0" />
          <span className="flex-1">الكل</span>
          <span className="text-xs opacity-80">{totalProducts}</span>
        </button>

        {categories.map((cat, i) => {
          const active = selectedId === cat.id;
          return (
            <div key={cat.id} className="group relative">
              <button
                onClick={() => onSelect(cat.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-right text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-text-primary hover:bg-surface-secondary"
                )}
              >
                <CategoryIcon name={cat.icon} className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate">{cat.name}</span>
                <span className="text-xs opacity-80">{cat.product_count}</span>
              </button>

              {canManage && (
                <div className="absolute left-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-surface/95 px-1 shadow-sm group-hover:flex">
                  <button
                    onClick={() => onMove(i, -1)}
                    disabled={i === 0}
                    className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
                    aria-label="لأعلى"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onMove(i, 1)}
                    disabled={i === categories.length - 1}
                    className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
                    aria-label="لأسفل"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onEdit(cat)}
                    className="p-1 text-text-secondary hover:text-text-primary"
                    aria-label="تعديل"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(cat)}
                    className="p-1 text-danger hover:opacity-80"
                    aria-label="حذف"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
