"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Plus,
  Check,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import { evaluateStocktake } from "@/shared/stocktake";
import type {
  StocktakeCountRow,
  StocktakeDTO,
  StocktakeListItem,
  StocktakeScopeType,
} from "@/shared/stocktake";

const fmtQty = (n: number) => Math.round(n * 1000) / 1000;

type Phase = "list" | "setup" | "count";

export function StocktakeTab() {
  const { invoke } = useIPC();
  const canManage = useAuthStore((s) => s.hasPermission("canManageInventory"));
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [phase, setPhase] = useState<Phase>("list");
  const [list, setList] = useState<StocktakeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<StocktakeDTO | null>(null);

  // إعداد النطاق
  const [categories, setCategories] = useState<string[]>([]);
  const [scopeType, setScopeType] = useState<StocktakeScopeType>("all");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  // جلسة العدّ
  const [rows, setRows] = useState<StocktakeCountRow[]>([]);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [reference, setReference] = useState("");
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      setList(await invoke("stocktake:getAll"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل الجرد");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openSetup() {
    setScopeType("all");
    setSelectedCats([]);
    setCategories(await invoke("stocktake:categories").catch(() => []));
    setPhase("setup");
  }

  async function startCount() {
    if (scopeType === "categories" && selectedCats.length === 0) {
      toast.error("اختر فئة واحدة على الأقل");
      return;
    }
    try {
      const data = await invoke("stocktake:countRows", {
        type: scopeType,
        categories: scopeType === "categories" ? selectedCats : undefined,
      });
      if (data.length === 0) {
        toast.error("مفيش مواد في النطاق ده");
        return;
      }
      setRows(data);
      setCounts({});
      setExcluded(new Set());
      setReference("");
      setSearch("");
      setPhase("count");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر بدء الجرد");
    }
  }

  // البنود اللي هتتحفظ: متعدّاها قيمة + مش متستثناة
  const counted = useMemo(
    () =>
      rows
        .filter((r) => !excluded.has(r.inventory_item_id))
        .map((r) => {
          const raw = counts[r.inventory_item_id];
          const has = raw !== undefined && raw !== "";
          const c = Number(raw);
          // الفرق بعد مراعاة نسبة التهدير (داخل النطاق = تمام = 0)
          const variance = has
            ? evaluateStocktake(r.expected_qty, c, r.waste_percentage).variance
            : null;
          return { row: r, has, counted: c, variance, value: variance !== null ? variance * r.cost_per_unit : 0 };
        }),
    [rows, counts, excluded]
  );

  const toCommit = counted.filter((x) => x.has);
  const shortage = toCommit.reduce((s, x) => s + (x.value < 0 ? -x.value : 0), 0);
  const surplus = toCommit.reduce((s, x) => s + (x.value > 0 ? x.value : 0), 0);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return counted.filter((x) => !q || x.row.item_name.toLowerCase().includes(q));
  }, [counted, search]);

  async function commit() {
    if (toCommit.length === 0) {
      toast.error("اكتب الكميات الفعلية الأول");
      return;
    }
    try {
      setSaving(true);
      await invoke("stocktake:commit", {
        reference: reference.trim() || null,
        scope: {
          type: scopeType,
          categories: scopeType === "categories" ? selectedCats : undefined,
        },
        items: toCommit.map((x) => ({
          inventory_item_id: x.row.inventory_item_id,
          counted_qty: x.counted,
        })),
      });
      toast.success("تم ضبط المخزون للكميات الفعلية");
      setPhase("list");
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ الجرد");
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  async function openDetail(id: number) {
    const stk = await invoke("stocktake:getById", id).catch(() => null);
    if (stk) setDetail(stk);
  }

  // ===== شاشة الإعداد =====
  if (phase === "setup") {
    const scopes: { key: StocktakeScopeType; label: string }[] = [
      { key: "all", label: "كل المخزون" },
      { key: "categories", label: "بفئة معيّنة" },
    ];
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <button
          onClick={() => setPhase("list")}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </button>
        <div>
          <h3 className="text-lg font-bold text-text-primary">جرد جديد</h3>
          <p className="text-sm text-text-secondary">اختار هتجرد إيه النهارده.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {scopes.map((s) => (
            <button
              key={s.key}
              onClick={() => setScopeType(s.key)}
              className={cn(
                "rounded-lg border p-3 text-sm font-medium transition-colors",
                scopeType === s.key
                  ? "border-primary bg-primary/10 text-text-primary"
                  : "border-border text-text-secondary hover:bg-surface-secondary"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {scopeType === "categories" && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">اختر الفئات</p>
            {categories.length === 0 ? (
              <p className="rounded-md bg-warning/10 p-3 text-xs text-warning">
                مفيش فئات لسه — افتح أي مادة وحطلها فئة الأول.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const on = selectedCats.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() =>
                        setSelectedCats((prev) =>
                          on ? prev.filter((x) => x !== c) : [...prev, c]
                        )
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        on
                          ? "border-primary bg-primary text-white"
                          : "border-border text-text-secondary hover:bg-surface-secondary"
                      )}
                    >
                      {on && <Check className="ms-1 inline h-3.5 w-3.5" />} {c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Button onClick={startCount} className="w-full">
          ابدأ الجرد
        </Button>
      </div>
    );
  }

  // ===== شاشة العدّ =====
  if (phase === "count") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setPhase("setup")}
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث..."
              className="w-44"
            />
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="اسم الجرد (اختياري)"
              className="w-44"
            />
          </div>
        </div>

        {/* ملخص حي */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="متعدّ" value={`${toCommit.length} / ${counted.length}`} />
          <SummaryCard label="عجز" value={formatCurrency(shortage)} tone="danger" />
          <SummaryCard label="زيادة" value={formatCurrency(surplus)} tone="success" />
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-text-secondary">
              <tr>
                <th className="px-3 py-2.5 text-right font-medium">المادة</th>
                <th className="px-3 py-2.5 text-center font-medium">المتوقع</th>
                <th className="px-3 py-2.5 text-center font-medium">الفعلي</th>
                <th className="px-3 py-2.5 text-center font-medium">الفرق</th>
                <th className="px-3 py-2.5 text-center font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((x) => {
                const r = x.row;
                return (
                  <tr key={r.inventory_item_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium text-text-primary">{r.item_name}</div>
                      <div className="text-xs text-text-secondary">
                        {r.category || "بدون فئة"} · {r.unit}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-text-secondary" dir="ltr">
                      {r.expected_qty}
                      {r.waste_percentage > 0 && (
                        <div className="text-[10px] text-text-secondary/70">
                          مسموح حتى {fmtQty(r.expected_min)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Input
                        type="number"
                        step="0.001"
                        min={0}
                        value={counts[r.inventory_item_id] ?? ""}
                        onChange={(e) =>
                          setCounts((p) => ({ ...p, [r.inventory_item_id]: e.target.value }))
                        }
                        placeholder="—"
                        dir="ltr"
                        className="mx-auto w-24 text-center"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {x.variance === null ? (
                        <span className="text-text-secondary">—</span>
                      ) : x.variance === 0 ? (
                        <Badge variant="muted">مظبوط</Badge>
                      ) : x.variance < 0 ? (
                        <Badge variant="danger">عجز {fmtQty(Math.abs(x.variance))}</Badge>
                      ) : (
                        <Badge variant="success">زيادة {fmtQty(x.variance)}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() =>
                          setCounts((p) => ({
                            ...p,
                            [r.inventory_item_id]: String(r.expected_qty),
                          }))
                        }
                        title="مظبوط زي السيستم"
                        className="rounded-md p-1.5 text-text-secondary hover:bg-success/10 hover:text-success"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary p-3">
          <p className="text-xs text-text-secondary">
            المواد اللي مش هتعدّها سيبها فاضية — مش هتتأثر. الزرار هيظبط المخزون للكميات اللي كتبتها.
          </p>
          <Button onClick={() => setConfirmOpen(true)} disabled={saving || toCommit.length === 0}>
            ضبط المخزون ({toCommit.length})
          </Button>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="ضبط المخزون"
          description={`هتظبط ${toCommit.length} مادة لكمياتها الفعلية. العجز ${formatCurrency(shortage)} والزيادة ${formatCurrency(surplus)}. تمام؟`}
          confirmText="ضبط المخزون"
          onConfirm={commit}
        />
      </div>
    );
  }

  // ===== شاشة السجل =====
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openSetup}>
            <Plus className="h-5 w-5" />
            جرد جديد
          </Button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center text-text-secondary">
          <ClipboardList className="h-8 w-8 opacity-40" />
          <p>مفيش جرد لسه.</p>
          <p className="text-xs">ابدأ جرد لفئة أو لكل المخزون، وقارن المتوقع بالفعلي.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-text-secondary">
              <tr>
                <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                <th className="px-4 py-3 text-right font-medium">الجرد</th>
                <th className="px-4 py-3 text-center font-medium">مواد</th>
                <th className="px-4 py-3 text-left font-medium">عجز</th>
                <th className="px-4 py-3 text-left font-medium">زيادة</th>
                <th className="px-4 py-3 text-left font-medium">الصافي</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => openDetail(s.id)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-text-secondary" dir="ltr">{s.counted_at}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{s.reference || "—"}</td>
                  <td className="px-4 py-3 text-center text-text-secondary">{s.item_count}</td>
                  <td className="px-4 py-3 text-left text-danger" dir="ltr">{formatCurrency(s.shortage_value)}</td>
                  <td className="px-4 py-3 text-left text-success" dir="ltr">{formatCurrency(s.surplus_value)}</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-left font-semibold",
                      s.variance_value < 0 ? "text-danger" : "text-success"
                    )}
                    dir="ltr"
                  >
                    {formatCurrency(s.variance_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StocktakeDetailDialog
        detail={detail}
        onClose={() => setDetail(null)}
        formatCurrency={formatCurrency}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <p className="text-xs text-text-secondary">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold",
          tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-text-primary"
        )}
        dir="ltr"
      >
        {value}
      </p>
    </div>
  );
}

function StocktakeDetailDialog({
  detail,
  onClose,
  formatCurrency,
}: {
  detail: StocktakeDTO | null;
  onClose: () => void;
  formatCurrency: (n: number) => string;
}) {
  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            تقرير جرد {detail?.reference ? `— ${detail.reference}` : ""}
          </DialogTitle>
        </DialogHeader>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard label="عجز" value={formatCurrency(detail.shortage_value)} tone="danger" />
              <SummaryCard label="زيادة" value={formatCurrency(detail.surplus_value)} tone="success" />
              <SummaryCard
                label="الصافي"
                value={formatCurrency(detail.variance_value)}
                tone={detail.variance_value < 0 ? "danger" : "success"}
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-secondary text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 text-right font-medium">المادة</th>
                    <th className="px-3 py-2 text-center font-medium">المتوقع</th>
                    <th className="px-3 py-2 text-center font-medium">الفعلي</th>
                    <th className="px-3 py-2 text-center font-medium">الفرق</th>
                    <th className="px-3 py-2 text-left font-medium">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="text-text-primary">{it.item_name}</div>
                        <div className="text-xs text-text-secondary">{it.category || "بدون فئة"}</div>
                      </td>
                      <td className="px-3 py-2 text-center text-text-secondary" dir="ltr">
                        {it.expected_qty}
                        {it.waste_percentage > 0 && (
                          <div className="text-[10px] text-text-secondary/70">
                            مسموح حتى {fmtQty(it.expected_min)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-text-primary" dir="ltr">{it.counted_qty}</td>
                      <td className="px-3 py-2 text-center" dir="ltr">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            it.variance_qty < 0 ? "text-danger" : it.variance_qty > 0 ? "text-success" : "text-text-secondary"
                          )}
                        >
                          {it.variance_qty < 0 ? (
                            <TrendingDown className="h-3.5 w-3.5" />
                          ) : it.variance_qty > 0 ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : null}
                          {it.variance_qty > 0 ? `+${fmtQty(it.variance_qty)}` : fmtQty(it.variance_qty)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-left",
                          it.variance_value < 0 ? "text-danger" : it.variance_value > 0 ? "text-success" : "text-text-secondary"
                        )}
                        dir="ltr"
                      >
                        {formatCurrency(it.variance_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.notes && (
              <p className="rounded-md bg-surface-secondary p-3 text-xs text-text-secondary">
                {detail.notes}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
