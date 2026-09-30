"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/EmptyState";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import type { SizeDTO } from "@/shared/sizes";

interface Row {
  id: number | null;
  size: string;
  price: string;
  is_active: boolean;
  cost_price: number;
  has_recipe: boolean;
}

/**
 * أحجام المنتج (سمول/ميديم/لارج) — كل حجم **سعره ووصفته**.
 *
 * ⚠️ أهم حاجة في الشاشة دي: أول ما يبقى فيه حجم واحد، **خانة سعر المنتج بتتقفل**
 * وبتتحسب من أرخص حجم. السبب: سعر الحجم **بيستبدل** سعر المنتج مش بيتجمع عليه،
 * فرقمين مختلفين = صاحب المحل يفتكر إن فيه زيادة وهي مش موجودة.
 *
 * ومفيش رصيد هنا: مخزون المطعم في المواد عبر الوصفات، فالحجم بيحمل سعره وتكلفته بس.
 */
export function SizesBuilder({
  productId,
  onChanged,
}: {
  productId: number | null;
  /** بيتنادى بعد الحفظ بسعر المنتج الجديد (أرخص حجم) عشان التاب التاني يتحدّث */
  onChanged?: (sizes: SizeDTO[]) => void;
}) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const toRow = (s: SizeDTO): Row => ({
    id: s.id,
    size: s.size,
    price: s.price_override != null ? String(s.price_override) : "",
    is_active: s.is_active,
    cost_price: s.cost_price,
    has_recipe: s.has_recipe,
  });

  useEffect(() => {
    if (!productId) {
      setRows([]);
      return;
    }
    let active = true;
    setLoading(true);
    void invoke("sizes:getByProduct", productId)
      .then((list) => {
        if (active) setRows(list.map(toRow));
      })
      .catch(() => {
        if (active) setRows([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId, invoke]);

  function patch(i: number, p: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function move(i: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    if (!productId) return;
    for (const r of rows) {
      if (!r.size.trim()) {
        toast.error("كل حجم لازم له اسم");
        return;
      }
      if (r.price.trim() === "" || !(Number(r.price) >= 0)) {
        toast.error(`حدّد سعر ${r.size.trim()}`);
        return;
      }
    }
    try {
      setSaving(true);
      const result = await invoke("sizes:save", {
        product_id: productId,
        sizes: rows.map((r, i) => ({
          id: r.id,
          size: r.size.trim(),
          price_override: Number(r.price),
          sort_order: i,
          is_active: r.is_active,
        })),
      });
      setRows(result.map(toRow));
      onChanged?.(result);
      toast.success(rows.length ? "الأحجام اتحفظت" : "الأحجام اتشالت");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ الأحجام");
    } finally {
      setSaving(false);
    }
  }

  if (!productId) {
    return (
      <EmptyState
        title="احفظ المنتج الأول"
        description="الأحجام بتتربط بمنتج موجود — احفظ المنتج وبعدين ضيف أحجامه."
      />
    );
  }

  const cheapest = rows
    .filter((r) => r.is_active && r.price.trim() !== "")
    .map((r) => Number(r.price))
    .sort((a, b) => a - b)[0];

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-surface-secondary p-3 text-sm text-text-secondary">
        كل حجم سعره <strong className="text-text-primary">بديل</strong> لسعر المنتج مش زيادة
        عليه، وليه وصفته من تاب «الوصفة». سعر المنتج بيتحسب لوحده من أرخص حجم.
        {cheapest != null && (
          <span className="block pt-1 text-text-primary">
            سعر المنتج هيبقى: <strong>{formatCurrency(cheapest)}</strong> (يبدأ من)
          </span>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-text-secondary">جاري التحميل...</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="مفيش أحجام"
          description="منتج بلا أحجام بيتباع بسعره العادي. ضيف أحجام لو المنتج له سمول/ميديم/لارج."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={r.id ?? `new-${i}`}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3"
            >
              <div className="min-w-[120px] flex-1 space-y-1.5">
                <Label>الحجم</Label>
                <Input
                  value={r.size}
                  onChange={(e) => patch(i, { size: e.target.value })}
                  placeholder="سمول"
                />
              </div>
              <div className="w-28 space-y-1.5">
                <Label>السعر</Label>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={r.price}
                  onChange={(e) => patch(i, { price: e.target.value })}
                  dir="ltr"
                  className="text-right"
                />
              </div>
              <div className="w-32 space-y-1.5">
                <Label>التكلفة</Label>
                <p className="h-10 truncate pt-2.5 text-sm">
                  {r.has_recipe ? (
                    formatCurrency(r.cost_price)
                  ) : (
                    <span className="text-warning">مفيش وصفة</span>
                  )}
                </p>
              </div>
              <label className="flex h-10 items-center gap-2 px-1">
                <Switch
                  checked={r.is_active}
                  onCheckedChange={(v) => patch(i, { is_active: v })}
                />
                <span className="text-sm text-text-primary">مفعّل</span>
              </label>
              <div className="flex h-10 items-center gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} title="فوق">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} title="تحت">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  title="شيل الحجم"
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.some((r) => !r.has_recipe) && (
        <p className="text-sm text-warning">
          ⚠️ الحجم اللي مالوش وصفة مش هيخصم مخزون ولا تكلفته محسوبة — ظبّطها من تاب «الوصفة».
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { id: null, size: "", price: "", is_active: true, cost_price: 0, has_recipe: false },
            ])
          }
        >
          <Plus className="h-4 w-4" />
          حجم جديد
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "جاري الحفظ..." : "احفظ الأحجام"}
        </Button>
      </div>
    </div>
  );
}
