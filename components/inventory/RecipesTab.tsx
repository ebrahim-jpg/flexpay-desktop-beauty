"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Link2Off, Pencil, UtensilsCrossed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/shared/SearchInput";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { RecipeModal } from "./RecipeModal";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import type { RecipeOverviewItem } from "@/shared/products";

type LinkFilter = "all" | "linked" | "unlinked";

const num = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("ar-EG");

function marginTone(m: number): string {
  if (m >= 30) return "text-success";
  if (m >= 10) return "text-warning";
  return "text-danger";
}

export function RecipesTab() {
  const { invoke } = useIPC();
  const canManage = useAuthStore((s) => s.hasPermission("canManageProducts"));
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [rows, setRows] = useState<RecipeOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string; price: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await invoke("products:getRecipesOverview"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الوصفات");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.categoryName ?? "بدون فئة");
    return Array.from(set);
  }, [rows]);

  const linkedCount = rows.filter((r) => r.items.length > 0).length;
  const unlinkedCount = rows.length - linkedCount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const isLinked = r.items.length > 0;
      const byLink =
        linkFilter === "all" ||
        (linkFilter === "linked" && isLinked) ||
        (linkFilter === "unlinked" && !isLinked);
      const cat = r.categoryName ?? "بدون فئة";
      const byCat = category === "all" || cat === category;
      const bySearch = !q || r.productName.toLowerCase().includes(q);
      return byLink && byCat && bySearch;
    });
  }, [rows, linkFilter, category, search]);

  const linkFilters: { key: LinkFilter; label: string }[] = [
    { key: "all", label: `الكل (${rows.length})` },
    { key: "linked", label: `مربوط (${linkedCount})` },
    { key: "unlinked", label: `غير مربوط (${unlinkedCount})` },
  ];

  return (
    <div className="space-y-4">
      {/* فلاتر */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-surface-secondary p-1">
          {linkFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setLinkFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                linkFilter === f.key
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="all">كل الفئات</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ابحث بمنتج..."
            className="w-52"
          />
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="مفيش منتجات مطابقة"
          description="غيّر الفلتر أو ابحث باسم تاني."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="p-3 font-medium">المنتج</th>
                <th className="p-3 font-medium">الفئة</th>
                <th className="p-3 font-medium">المكوّنات</th>
                <th className="hidden p-3 font-medium sm:table-cell">التكلفة</th>
                <th className="hidden p-3 font-medium sm:table-cell">الهامش</th>
                {canManage && <th className="p-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                // المنتج بأحجام ممكن يكون كل وصفته على الأحجام والمشترك فاضي — فمربوط
                // = مكوّنات مشتركة **أو** حجم واحد على الأقل له وصفة
                const linked = r.items.length > 0 || r.sizes.some((s) => s.hasRecipe);
                const missingSizes = r.sizes.filter((s) => !s.hasRecipe);
                return (
                  <tr key={r.productId} className="hover:bg-surface-secondary/40">
                    <td className="p-3 font-medium text-text-primary">
                      {r.productName}
                      {!r.isActive && (
                        <span className="mr-2 text-xs text-text-secondary">(غير نشط)</span>
                      )}
                    </td>
                    <td className="p-3 text-text-secondary">{r.categoryName ?? "بدون فئة"}</td>
                    <td className="p-3">
                      {linked ? (
                        <div className="space-y-1.5">
                          {r.items.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {r.sizes.length > 0 && (
                                <span className="text-xs text-text-secondary">مشترك:</span>
                              )}
                              {r.items.map((it, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-md bg-surface-secondary px-2 py-0.5 text-xs text-text-primary"
                                >
                                  {it.name}
                                  <span className="text-text-secondary">
                                    {num(it.qty)} {it.unit}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                          {r.sizes.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {r.sizes.map((s) => (
                                <span
                                  key={s.size}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs",
                                    s.hasRecipe
                                      ? "bg-primary/10 text-text-primary"
                                      : "bg-warning/10 text-warning"
                                  )}
                                >
                                  {s.size}
                                  <span className="text-text-secondary">
                                    {s.hasRecipe ? formatCurrency(s.cost) : "بلا وصفة"}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Badge variant="warning">
                          <Link2Off className="h-3 w-3" />
                          غير مربوط
                        </Badge>
                      )}
                      {linked && missingSizes.length > 0 && (
                        <p className="pt-1 text-xs text-warning">
                          أحجام بلا وصفة: {missingSizes.map((s) => s.size).join("، ")}
                        </p>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap p-3 text-text-primary sm:table-cell">
                      {linked ? formatCurrency(r.cost) : "—"}
                    </td>
                    <td className="hidden whitespace-nowrap p-3 sm:table-cell">
                      {r.margin != null ? (
                        <span className={cn("font-medium", marginTone(r.margin))}>
                          {Math.round(r.margin)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {canManage && (
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditing({ id: r.productId, name: r.productName, price: r.price })
                          }
                        >
                          {linked ? (
                            <Pencil className="h-3.5 w-3.5" />
                          ) : (
                            <Link2 className="h-3.5 w-3.5" />
                          )}
                          {linked ? "تعديل" : "ربط"}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <RecipeModal
        product={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}
