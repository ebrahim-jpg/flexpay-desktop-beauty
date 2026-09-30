"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Package, Plus, Search, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProductCard } from "@/components/pos/ProductCard";
import { ModifierModal } from "@/components/pos/ModifierModal";
import { SizePicker } from "@/components/pos/SizePicker";
import { StaffPicker } from "@/components/beauty/StaffPicker";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import type { CategoryDTO, ProductDTO } from "@/shared/products";
import type { SizeDTO } from "@/shared/sizes";
import { productWithSize } from "@/shared/sizes";
import type { SelectedModifier } from "@/shared/orders";
import type { SessionItemDTO } from "@/shared/gaming";
import type { GamingSessionDTO } from "@/shared/gaming";

interface AddDrinksDialogProps {
  session: GamingSessionDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (session: GamingSessionDTO) => void;
}

// أصناف «الحساب المفتوح» للطاولة — بتتضاف على الحساب ومابتخصمش مخزون غير وقت الفاتورة،
// وكل صنف بيتضاف بتطلع له تذكرة مطبخ على طول.
export function AddDrinksDialog({ session, open, onOpenChange, onChanged }: AddDrinksDialogProps) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [category, setCategory] = useState<number | null>(null);
  // الصالون كتالوجه خدمات في الأساس — الفلتر بيوصّل للخدمة بضغطة
  const [kind, setKind] = useState<"all" | "service" | "product">("all");
  const [search, setSearch] = useState("");
  const [modifierProduct, setModifierProduct] = useState<ProductDTO | null>(null);
  const [sizeProduct, setSizeProduct] = useState<ProductDTO | null>(null);
  const [pickedSize, setPickedSize] = useState<SizeDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [all, cats] = await Promise.all([invoke("products:getAll"), invoke("categories:getAll")]);
      setProducts(all.filter((p) => p.is_active));
      setCategories(cats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل المنتجات");
    }
  }, [invoke]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setCategory(null);
      void load();
    }
  }, [open, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === null || p.category_id === category) &&
        (kind === "all" || (kind === "service" ? p.is_service : !p.is_service)) &&
        (!q || p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q))
    );
  }, [products, category, kind, search]);

  async function add(
    product: ProductDTO,
    modifiers: SelectedModifier[],
    notes: string,
    size: SizeDTO | null = null
  ) {
    if (!session) return;
    try {
      setBusy(true);
      const updated = await invoke("gaming:session:addItem", {
        session_id: session.id,
        product_id: product.id,
        quantity: 1,
        modifier_option_ids: modifiers.map((m) => m.option_id),
        notes: notes || null,
        variant_id: size?.id ?? null,
      });
      onChanged(updated);
      toast.success(`أضيف ${product.name}${size ? ` — ${size.size}` : ""}`);
      // ⚠️ **مفيش طباعة هنا.** كانت تذكرة بتطلع مع **كل صنف** يتضاف — طاولة واخدة
      // ١٠ أصناف = ١٠ ورقات. التذكرة بقت بـ«أرسل للمطبخ»: **ورقة واحدة بالجديد بس**.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إضافة الصنف");
    } finally {
      setBusy(false);
    }
  }

  // الترتيب: حجم (لو له أحجام) ← خيارات ← الحساب
  function select(product: ProductDTO) {
    if (!product.is_available || busy) return;
    if (product.has_sizes) {
      setPickedSize(null);
      setSizeProduct(product);
      return;
    }
    if (product.modifiers.length > 0) setModifierProduct(product);
    else void add(product, [], "");
  }

  function afterSize(product: ProductDTO, size: SizeDTO) {
    if (product.modifiers.length > 0) {
      setPickedSize(size);
      setModifierProduct(product);
      return;
    }
    void add(product, [], "", size);
  }

  // البند اللي بنغيّر الحلاق بتاعه
  const [staffForItem, setStaffForItem] = useState<SessionItemDTO | null>(null);

  async function changeQty(it: SessionItemDTO, quantity: number) {
    await setQty(it.id, quantity);
  }

  /**
   * تغيير اللي عمل الخدمة دي.
   * ⚠️ بيشيل البند ويضيفه تاني بالحلاق الجديد — لأن الحلاق **جزء من مفتاح تجميع
   * البنود** (نفس الخدمة بحلاقين = بندين)، فتعديله في مكانه كان هيكسر المفتاح.
   */
  async function changeStaff(it: SessionItemDTO, staffId: number) {
    if (!session) return;
    try {
      setBusy(true);
      await invoke("gaming:session:removeItem", it.id);
      const updated = await invoke("gaming:session:addItem", {
        session_id: session.id,
        product_id: it.product_id,
        quantity: it.quantity,
        modifier_option_ids: it.modifier_option_ids,
        notes: it.notes,
        variant_id: it.variant_id,
        staff_id: staffId,
      });
      onChanged(updated);
      toast.success("اتغيّر اللي عمل الخدمة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تغيير الحلاق");
    } finally {
      setBusy(false);
    }
  }

  async function setQty(itemId: number, quantity: number) {
    try {
      setBusy(true);
      const updated =
        quantity > 0
          ? await invoke("gaming:session:updateItem", { item_id: itemId, quantity })
          : await invoke("gaming:session:removeItem", itemId);
      onChanged(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تعديل البند");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            أوردر {session?.room_name} — {session?.session_label}
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-[65vh] gap-4">
          {/* الحساب المفتوح (يمين في RTL) */}
          <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border">
            <div className="border-b border-border p-3 text-sm font-semibold text-text-primary">على الحساب</div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {!session || session.items.length === 0 ? (
                <p className="text-center text-sm text-text-secondary">
                  لسه مفيش أصناف
                </p>
              ) : (
                session.items.map((it) => {
                  return (
                    <div key={it.id} className={cn("rounded-md bg-surface-secondary p-2 text-sm")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 font-medium text-text-primary">
                          {productWithSize(it.product_name, it.variant_size)}
                        </span>
                        <button
                          type="button"
                          className="text-text-secondary hover:text-danger"
                          onClick={() => void changeQty(it, 0)}
                          disabled={busy}
                          aria-label="شيل البند"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* ⚠️ **اللي عمل الخدمة** — عليه بتتحسب عمولته، فلازم يبان
                          على كل بند ويتغيّر بضغطة (سماح الصبغة ومنى الاستشوار). */}
                      <button
                        type="button"
                        onClick={() => setStaffForItem(it)}
                        disabled={busy}
                        className="mt-0.5 flex items-center gap-1 text-[11px] text-text-secondary hover:text-primary"
                      >
                        <UserRound className="h-3 w-3" />
                        {it.staff_name ?? "مش محدّد"}
                      </button>

                      <div className="mt-1 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void changeQty(it, it.quantity - 1)}
                        >
                          <Minus />
                        </Button>
                        <span className="w-6 text-center tabular-nums">{it.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void changeQty(it, it.quantity + 1)}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border p-3 text-sm">
              <span className="text-text-secondary">المجموع</span>
              <span className="font-bold text-primary tabular-nums">{formatCurrency(session?.items_subtotal ?? 0)}</span>
            </div>

          </div>

          {/* المنتجات */}
          <div className="flex flex-1 flex-col gap-3 overflow-hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن صنف..."
                className="pr-9"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              {(
                [
                  { k: "all" as const, label: "الكل" },
                  { k: "service" as const, label: "خدمات" },
                  { k: "product" as const, label: "منتجات" },
                ]
              ).map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setKind(t.k)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    kind === t.k
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-secondary text-text-secondary hover:text-text-primary"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[{ id: null as number | null, name: "كل الفئات" }, ...categories].map((c) => (
                <button
                  key={String(c.id)}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    category === c.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-secondary text-text-secondary hover:text-text-primary"
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto pl-1">
              {filtered.length === 0 ? (
                <EmptyState icon={Package} title="مفيش منتجات" description="جرّب فئة تانية أو امسح البحث." />
              ) : (
                <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
                  {filtered.map((p) => (
                    <ProductCard key={p.id} product={p} onSelect={select} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* تغيير اللي عمل خدمة معيّنة */}
        <StaffPicker
          open={!!staffForItem}
          title={staffForItem ? `مين عمل ${staffForItem.product_name}؟` : ""}
          currentId={staffForItem?.staff_id ?? null}
          onOpenChange={(o) => !o && setStaffForItem(null)}
          onPick={(staff) => {
            const it = staffForItem;
            setStaffForItem(null);
            if (it) void changeStaff(it, staff.id);
          }}
        />

        <SizePicker
          product={sizeProduct}
          onOpenChange={(o) => {
            if (!o) setSizeProduct(null);
          }}
          onPick={(size) => sizeProduct && afterSize(sizeProduct, size)}
        />

        <ModifierModal
          product={modifierProduct}
          open={!!modifierProduct}
          onOpenChange={(o) => {
            if (!o) {
              setModifierProduct(null);
              setPickedSize(null);
            }
          }}
          onConfirm={(mods, notes) => {
            if (modifierProduct) void add(modifierProduct, mods, notes, pickedSize);
            setPickedSize(null);
          }}
          sizeLabel={pickedSize?.size ?? null}
          sizePrice={pickedSize?.price ?? null}
        />
      </DialogContent>
    </Dialog>
  );
}
