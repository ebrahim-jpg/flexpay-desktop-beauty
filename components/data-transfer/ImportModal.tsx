"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Upload, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";
import type {
  ProductPlan,
  CustomerPlan,
  ProductImportRow,
  CustomerImportRow,
} from "@/shared/data-transfer";

type Kind = "products" | "customers";

interface Loaded {
  plan: ProductPlan | CustomerPlan;
  rows: ProductImportRow[] | CustomerImportRow[];
  file: string;
}

/**
 * استيراد من إكسل — بمعاينة إجبارية.
 *
 * ⚠️ **المعاينة مش رفاهية.** الاستيراد بيغيّر أسعار على محل شغّال، وملف غلط
 * ممكن يقلب قايمة الأسعار كلها. فالمستخدم بيشوف **القديم والجديد جنب بعض**
 * قبل ما يأكّد، والتنفيذ بياخد نسخة أمان تلقائية قبله.
 */
export function ImportModal({
  kind,
  open,
  onOpenChange,
  onDone,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { invoke } = useIPC();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);

  const label = kind === "products" ? "المنتجات" : "العملاء";

  function reset() {
    setLoaded(null);
    setBusy(false);
  }

  async function pickFile() {
    setBusy(true);
    try {
      const res = (await invoke(
        kind === "products" ? "data:products:plan" : "data:customers:plan"
      )) as Loaded | null;
      if (res) setLoaded(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت قراءة الملف");
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    try {
      const p = (await invoke(
        kind === "products" ? "data:products:template" : "data:customers:template"
      )) as string | null;
      if (p) toast.success("اتحفظ القالب");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ القالب");
    }
  }

  async function apply() {
    if (!loaded) return;
    setBusy(true);
    try {
      const actorId = currentUser?.id ?? null;
      const res =
        kind === "products"
          ? await invoke("data:products:apply", {
              rows: loaded.rows as ProductImportRow[],
              actorId,
            })
          : await invoke("data:customers:apply", {
              rows: (loaded.plan as CustomerPlan).rows,
              actorId,
            });
      toast.success(
        `تم — جديد ${res.created} · محدّث ${res.updated} · متخطّى ${res.skipped}`
      );
      if (!res.backupPath) {
        toast.warning("مقدرناش ناخد نسخة أمان قبل الاستيراد — راجع مساحة القرص");
      }
      onDone();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الاستيراد");
    } finally {
      setBusy(false);
    }
  }

  const c = loaded?.plan.counts;
  const newCats = loaded && "newCategories" in loaded.plan ? loaded.plan.newCategories : [];
  const errors = loaded?.plan.rows.filter((r) => r.action === "error") ?? [];
  const updates = loaded?.plan.rows.filter((r) => r.action === "update") ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>استيراد {label} من إكسل</DialogTitle>
        </DialogHeader>

        {!loaded ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {kind === "products"
                ? "الملف لازم يكون فيه: الاسم والسعر (إجباري)، والباركود والفئة والنوع والتكلفة (اختياري). ترتيب الأعمدة مالوش أهمية."
                : "الملف لازم يكون فيه الموبايل، والاسم اختياري. الرقم الموجود عندك مش هيتلمس."}
            </p>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">مهم تعرفه:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>الاستيراد <b>بيضيف ويحدّث بس</b> — عمره ما بيحذف حاجة.</li>
                <li>خانة فاضية في الملف <b>مابتمسحش</b> القيمة الموجودة عندك.</li>
                <li>هناخد نسخة أمان تلقائية قبل التنفيذ.</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={pickFile} disabled={busy}>
                <Upload className="size-4" />
                اختار الملف
              </Button>
              <Button variant="outline" onClick={downloadTemplate} disabled={busy}>
                <Download className="size-4" />
                نزّل قالب فاضي
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4" />
              <span className="truncate">{loaded.file.split(/[\\/]/).pop()}</span>
            </div>

            {/* الملخّص */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="جديد" value={c?.create ?? 0} tone="good" />
              <Stat label="هيتحدّث" value={c?.update ?? 0} tone="warn" />
              <Stat label="متخطّى" value={c?.skip ?? 0} />
              <Stat label="أخطاء" value={c?.error ?? 0} tone={c?.error ? "bad" : undefined} />
            </div>

            {newCats.length > 0 && (
              <p className="text-sm text-muted-foreground">
                فئات جديدة هتتعمل: <b className="text-foreground">{newCats.join(" · ")}</b>
              </p>
            )}

            {loaded.plan.unknownHeaders.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                أعمدة مش متعرّف عليها واتتجاهلت: {loaded.plan.unknownHeaders.join(" · ")}
              </div>
            )}

            {/* ⚠️ التغييرات — القديم والجديد جنب بعض. ده اللي بيخلّي المستخدم
                يمسك ملف غلط قبل ما يقلب أسعاره. */}
            {updates.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-semibold">اللي هيتغيّر</p>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="p-2 font-medium">الصنف</th>
                        <th className="p-2 font-medium">التغيير</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {updates.map((r) => (
                        <tr key={r.row}>
                          <td className="p-2 font-medium">{r.name}</td>
                          <td className="p-2">
                            {"changes" in r &&
                              r.changes &&
                              Object.entries(r.changes).map(([field, [from, to]]) => (
                                <span key={field} className="me-3 inline-block">
                                  {field}:{" "}
                                  <span className="text-muted-foreground line-through">{from}</span>{" "}
                                  <span className="font-semibold text-foreground">{to}</span>
                                </span>
                              ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-destructive">
                  <AlertTriangle className="size-4" />
                  صفوف فيها مشاكل — مش هتتستورد
                </p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-destructive/30 bg-destructive/5 p-2 text-xs">
                  {errors.map((r) => (
                    <div key={r.row}>
                      الصف {r.row}: {r.message}
                      {r.name ? ` — ${r.name}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              هناخد نسخة أمان من بياناتك قبل التنفيذ.
            </p>
          </div>
        )}

        <DialogFooter>
          {loaded && (
            <>
              <Button variant="outline" onClick={reset} disabled={busy}>
                ملف تاني
              </Button>
              <Button
                onClick={apply}
                disabled={busy || (c?.create ?? 0) + (c?.update ?? 0) === 0}
              >
                {busy ? "بيستورد…" : `نفّذ (${(c?.create ?? 0) + (c?.update ?? 0)})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-2.5 text-center",
        tone === "good" && "border-emerald-500/30 bg-emerald-500/10",
        tone === "warn" && "border-amber-500/30 bg-amber-500/10",
        tone === "bad" && "border-destructive/30 bg-destructive/10",
        !tone && "border-border"
      )}
    >
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
