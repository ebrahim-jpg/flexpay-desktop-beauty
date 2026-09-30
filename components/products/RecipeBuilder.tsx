"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Plus, Trash2, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import type { InventoryItemDTO } from "@/shared/inventory";
import type { SizeDTO } from "@/shared/sizes";

interface RecipeBuilderProps {
  productId: number | null;
  price: number;
  onSaved?: () => void;
}

/**
 * نطاق الوصفة المعروضة: `null` = **مشترك لكل الأحجام** · رقم = حجم معيّن.
 *
 * المنتج اللي له أحجام بيظهر بتابات: «مشترك» + تاب لكل حجم. المشترك للمكوّنات اللي
 * في كل الأحجام (الكرتونة والمناديل) — بتتحط مرة واحدة وبتتحسب على كل حجم. وده اللي
 * يخلّي حفظ وصفة حجم **مايمسحش** وصفة حجم تاني (كل نطاق لوحده في الـMain).
 */
type Scope = number | null;

interface RecipeRow {
  inventory_item_id: number;
  standard_qty: number;
}

export function RecipeBuilder({ productId, price, onSaved }: RecipeBuilderProps) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [inventory, setInventory] = useState<InventoryItemDTO[]>([]);
  const [sizes, setSizes] = useState<SizeDTO[]>([]);
  const [scope, setScope] = useState<Scope>(null);
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // المواد والأحجام — مرة واحدة لكل منتج
  useEffect(() => {
    if (!productId) {
      setLoaded(true);
      return;
    }
    let active = true;
    void Promise.all([invoke("inventory:getAll"), invoke("sizes:getByProduct", productId)])
      .then(([inv, sz]) => {
        if (!active) return;
        setInventory(inv);
        setSizes(sz);
      })
      .catch(() => {
        /* الفشل بيبان في تحميل الوصفة */
      });
    return () => {
      active = false;
    };
  }, [productId, invoke]);

  // وصفة النطاق الحالي
  const load = useCallback(async () => {
    if (!productId) {
      setLoaded(true);
      return;
    }
    try {
      const recipe = await invoke("products:getRecipe", {
        product_id: productId,
        variant_id: scope,
      });
      setRows(
        recipe.map((r) => ({
          inventory_item_id: r.inventory_item_id,
          standard_qty: r.standard_qty,
        }))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الوصفة");
    } finally {
      setLoaded(true);
    }
  }, [productId, scope, invoke]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemById = (id: number) => inventory.find((i) => i.id === id);

  function addRow() {
    const firstUnused = inventory.find(
      (i) => !rows.some((r) => r.inventory_item_id === i.id)
    );
    if (!firstUnused) {
      toast.error("مفيش مواد متاحة تانية");
      return;
    }
    setRows([...rows, { inventory_item_id: firstUnused.id, standard_qty: 1 }]);
  }

  function updateRow(index: number, patch: Partial<RecipeRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  const cost = rows.reduce((sum, r) => {
    const item = itemById(r.inventory_item_id);
    return sum + (item ? item.cost_per_unit * r.standard_qty : 0);
  }, 0);
  // في تاب حجم: المقارنة بسعر **الحجم** وتكلفته الكاملة (وصفته + المشترك)
  const activeSize = scope == null ? null : sizes.find((x) => x.id === scope);
  const comparePrice = activeSize ? activeSize.price : price;
  const sharedCost = activeSize ? Math.max(0, activeSize.cost_price - cost) : 0;
  const fullCost = cost + sharedCost;
  const margin =
    comparePrice > 0 ? Math.round(((comparePrice - fullCost) / comparePrice) * 100) : 0;

  async function handleSave() {
    if (!productId) return;
    if (rows.some((r) => r.standard_qty <= 0)) {
      toast.error("كل كمية لازم تكون أكبر من صفر");
      return;
    }
    try {
      setSaving(true);
      await invoke("products:saveRecipe", {
        product_id: productId,
        items: rows,
        variant_id: scope,
      });
      toast.success(
        scope == null ? "تم حفظ الوصفة المشتركة وحساب التكاليف" : "تم حفظ وصفة الحجم وتكلفته"
      );
      await load();
      // تكلفة كل حجم بتتغيّر لما المشترك يتغيّر — نرجّع الأحجام بتكاليفها الجديدة
      if (sizes.length) {
        try {
          setSizes(await invoke("sizes:getByProduct", productId));
        } catch {
          /* عرض التكلفة بس */
        }
      }
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ الوصفة");
    } finally {
      setSaving(false);
    }
  }

  if (!productId) {
    return (
      <EmptyState
        icon={Boxes}
        title="احفظ المنتج الأول"
        description="احفظ المنتج عشان تقدر تربطه بمكوناته من المخزون."
      />
    );
  }

  if (loaded && inventory.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="المخزون فاضي"
        description="الوصفة بتتطلب إضافة مواد في المخزون أولاً."
        action={
          <Button variant="outline" asChild>
            <Link href="/inventory">رايح للمخزون</Link>
          </Button>
        }
      />
    );
  }

  const usedIds = new Set(rows.map((r) => r.inventory_item_id));
  const materialOptions = inventory.map((inv) => ({
    value: inv.id,
    label: `${inv.name} (${inv.unit})`,
    disabled: usedIds.has(inv.id), // مستخدمة في صف تاني (الصف الحالي بيتعرض كمختار)
  }));

  return (
    <div className="space-y-4">
      {sizes.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <ScopeTab label="مشترك" active={scope === null} onClick={() => setScope(null)} />
            {sizes.map((sz) => (
              <ScopeTab
                key={sz.id}
                label={sz.size}
                warn={!sz.has_recipe}
                active={scope === sz.id}
                onClick={() => setScope(sz.id)}
              />
            ))}
          </div>
          <p className="text-xs text-text-secondary">
            {scope === null
              ? "المكوّنات اللي في كل الأحجام (الكرتونة، المناديل) — بتتحط مرة واحدة وبتتحسب على كل حجم."
              : "المكوّنات الخاصة بالحجم ده بس. المشترك بيتضاف عليها تلقائي."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => {
          const item = itemById(row.inventory_item_id);
          const lineCost = item ? item.cost_per_unit * row.standard_qty : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <SearchableSelect
                value={row.inventory_item_id}
                options={materialOptions}
                onChange={(v) => updateRow(i, { inventory_item_id: v })}
                placeholder="اختر مادة"
                searchPlaceholder="ابحث عن مادة..."
                className="flex-1"
              />
              <Input
                type="number"
                step="0.001"
                min={0}
                value={row.standard_qty}
                onChange={(e) =>
                  updateRow(i, { standard_qty: Number(e.target.value) || 0 })
                }
                className="w-24"
                dir="ltr"
              />
              <span className="w-20 shrink-0 text-xs text-text-secondary" dir="ltr">
                {formatCurrency(lineCost)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeRow(i)}
                className="text-danger hover:bg-danger/10"
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" />
          إضافة مكون
        </Button>
      </div>

      {/* ملخص التكلفة — في تاب حجم: تكلفته الكاملة (وصفته + المشترك) وسعره هو */}
      <div className="grid grid-cols-3 gap-3 rounded-lg border border-border p-3 text-center text-sm">
        <div>
          <p className="text-text-secondary">
            {activeSize ? "تكلفة " + activeSize.size : "تكلفة الإنتاج"}
          </p>
          <p className="font-bold text-text-primary">{formatCurrency(fullCost)}</p>
          {activeSize && sharedCost > 0 && (
            <p className="text-xs text-text-secondary">منها {formatCurrency(sharedCost)} مشترك</p>
          )}
        </div>
        <div>
          <p className="text-text-secondary">سعر البيع</p>
          <p className="font-bold text-text-primary">{formatCurrency(comparePrice)}</p>
        </div>
        <div>
          <p className="text-text-secondary">هامش الربح</p>
          <p className="font-bold text-success">{margin}%</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="h-4 w-4" />
        {saving
          ? "جاري الحفظ..."
          : activeSize
            ? "حفظ وصفة " + activeSize.size
            : sizes.length
              ? "حفظ الوصفة المشتركة"
              : "حفظ الوصفة"}
      </Button>
    </div>
  );
}

function ScopeTab({
  label,
  active,
  warn,
  onClick,
}: {
  label: string;
  active: boolean;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-surface-secondary text-text-secondary hover:text-text-primary"
      )}
    >
      {label}
      {warn && !active && <span className="pr-1 text-warning">•</span>}
    </button>
  );
}
