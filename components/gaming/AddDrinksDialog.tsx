"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChefHat, Minus, Package, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProductCard } from "@/components/pos/ProductCard";
import { ModifierModal } from "@/components/pos/ModifierModal";
import { SizePicker } from "@/components/pos/SizePicker";
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
  const [search, setSearch] = useState("");
  const [modifierProduct, setModifierProduct] = useState<ProductDTO | null>(null);
  const [sizeProduct, setSizeProduct] = useState<ProductDTO | null>(null);
  const [sending, setSending] = useState(false);
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
        (!q || p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q))
    );
  }, [products, category, search]);

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

  // عدد الأصناف اللي لسه ماراحتش للمطبخ (بالفرق مش بالكمية الكاملة)
  const pendingCount = (session?.items ?? []).filter((i) => i.quantity - i.sent_qty > 0.0001).length;

  async function sendToKitchen() {
    if (!session || pendingCount === 0) return;
    try {
      setSending(true);
      const res = await invoke("gaming:session:sendToKitchen", session.id);
      onChanged(res.session);
      toast.success(`راحت دفعة ${res.batch} للمطبخ — ${res.printed} صنف`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إرسال الطلبات للمطبخ");
    } finally {
      setSending(false);
    }
  }

  /**
   * تعديل كمية أو حذف بند.
   * ⚠️ البند اللي **راح للمطبخ خلاص** بيسأل تأكيد الأول: المطبخ بدأ يجهّزه، والنادل
   * هو اللي بيبلّغهم بنفسه (قرار المالك — مفيش ورقة إلغاء في مطعم بطابعة واحدة).
   */
  async function changeQty(it: SessionItemDTO, quantity: number) {
    const sentAffected = it.sent_qty > 0 && quantity < it.sent_qty;
    if (sentAffected) {
      const what = quantity <= 0 ? "تشيل" : "تقلّل";
      const okToGo = window.confirm(
        `${productWithSize(it.product_name, it.variant_size)} راح للمطبخ خلاص — متأكد إنك عايز ${what}ه؟ بلّغ المطبخ بنفسك.`
      );
      if (!okToGo) return;
    }
    await setQty(it.id, quantity);
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
                  // حالة البند مع المطبخ: راح كله · راح جزء منه · لسه معلّق
                  const pending = it.quantity - it.sent_qty;
                  const allSent = pending <= 0.0001;
                  const partial = it.sent_qty > 0 && !allSent;
                  return (
                    <div
                      key={it.id}
                      className={cn(
                        "rounded-md p-2 text-sm",
                        allSent
                          ? "bg-surface-secondary"
                          : "bg-accent/10 ring-1 ring-accent/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 font-medium text-text-primary">
                          {productWithSize(it.product_name, it.variant_size)}
                        </span>
                        <button
                          type="button"
                          className="text-text-secondary hover:text-danger"
                          onClick={() => void changeQty(it, 0)}
                          disabled={busy || sending}
                          aria-label="شيل البند"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* حالة المطبخ — النادل لازم يعرف إيه اللي راح وإيه لسه */}
                      <div className="mt-0.5 text-[11px]">
                        {allSent ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <Check className="h-3 w-3" />
                            راح للمطبخ
                          </span>
                        ) : partial ? (
                          <span className="text-accent-foreground">
                            جديد {pending} · راح {it.sent_qty}
                          </span>
                        ) : (
                          <span className="text-accent-foreground">لسه ماراحش للمطبخ</span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || sending}
                          onClick={() => void changeQty(it, it.quantity - 1)}
                        >
                          <Minus />
                        </Button>
                        <span className="w-6 text-center tabular-nums">{it.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || sending}
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

            {/* ⚠️ **دي الحاجة اللي كانت ناقصة.** التذكرة بتطلع من هنا **ورقة واحدة
                بالجديد بس** — مش ورقة مع كل صنف، ومش الأوردر كله من أوله كل مرة. */}
            <div className="border-t border-border p-3">
              <Button
                className="w-full"
                disabled={pendingCount === 0 || busy || sending}
                onClick={() => void sendToKitchen()}
              >
                <ChefHat className="h-4 w-4" />
                {sending
                  ? "بيطبع..."
                  : pendingCount === 0
                    ? "كل الطلبات راحت للمطبخ"
                    : `أرسل للمطبخ (${pendingCount})`}
              </Button>
              {session && session.kitchen_batches > 0 && (
                <p className="mt-1.5 text-center text-[11px] text-text-secondary">
                  راح للمطبخ {session.kitchen_batches} دفعة
                </p>
              )}
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
            <div className="flex flex-wrap gap-2">
              {[{ id: null as number | null, name: "الكل" }, ...categories].map((c) => (
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
