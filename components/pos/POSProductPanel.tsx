"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search, Package, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ProductCard } from "./ProductCard";
import { ModifierModal } from "./ModifierModal";
import { SizePicker } from "./SizePicker";
import { EmptyState } from "@/components/shared/EmptyState";
import { CategoryIcon } from "@/components/shared/icons";
import { useCartStore } from "@/store/cart.store";
import { usePosUiStore } from "@/store/pos-ui.store";
import { useIPC } from "@/hooks/useIPC";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { parseBarcode } from "@/lib/barcode";
import { cn } from "@/lib/utils";
import type { ProductDTO, CategoryDTO } from "@/shared/products";
import type { SelectedModifier } from "@/shared/orders";
import type { SizeDTO } from "@/shared/sizes";

interface POSProductPanelProps {
  products: ProductDTO[];
  categories: CategoryDTO[];
}

export function POSProductPanel({ products, categories }: POSProductPanelProps) {
  const { invoke } = useIPC();
  const addItem = useCartStore((s) => s.addItem);

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  // فلتر النوع — صالون التجميل كتالوجه خدمات في الأساس والمنتجات جنبها
  const [kind, setKind] = useState<"all" | "service" | "product">("all");
  const [search, setSearch] = useState("");
  const [modifierProduct, setModifierProduct] = useState<ProductDTO | null>(null);
  const [sizeProduct, setSizeProduct] = useState<ProductDTO | null>(null);
  // الحجم المختار بيستنى لحد ما الخيارات تخلص (الترتيب: حجم ← خيارات ← السلة)
  const [pickedSize, setPickedSize] = useState<SizeDTO | null>(null);

  // إضافة منتج: الحجم الأول (لو له أحجام) بعدين الخيارات
  function selectProduct(product: ProductDTO) {
    if (!product.is_available) return;
    if (product.has_sizes) {
      setPickedSize(null);
      setSizeProduct(product);
      return;
    }
    if (product.modifiers.length > 0) {
      setModifierProduct(product);
    } else {
      addItem(product, [], "");
      toast.success(`أضيف ${product.name}`);
    }
  }

  // الحجم اتحدد → لو فيه خيارات كمّل عليها، وإلا ضيف على طول
  function confirmSize(product: ProductDTO, size: SizeDTO) {
    if (product.modifiers.length > 0) {
      setPickedSize(size);
      setModifierProduct(product);
      return;
    }
    addItem(product, [], "", undefined, size);
    toast.success(`أضيف ${product.name} — ${size.size}`);
  }

  function confirmModifier(modifiers: SelectedModifier[], notes: string) {
    if (!modifierProduct) return;
    const size = pickedSize;
    addItem(modifierProduct, modifiers, notes, undefined, size);
    toast.success(`أضيف ${modifierProduct.name}${size ? ` — ${size.size}` : ""}`);
    setPickedSize(null);
  }

  // الباركود — جاهز دايماً بدون focus خاص
  useBarcodeScanner({
    enabled: true,
    onScan: async (code) => {
      const parsed = parseBarcode(code);
      try {
        const product = await invoke("products:getByBarcode", parsed.lookupCode);
        if (!product) {
          toast.error("باركود غير موجود");
          return;
        }
        if (!product.is_available) {
          toast.error(`${product.name} نفد`);
          return;
        }
        // المنتجات كلها بالقطعة في نسخة البلايستيشن — مفيش باركود ميزان
        selectProduct(product);
      } catch {
        toast.error("تعذّر قراءة الباركود");
      }
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const inCat = selectedCategory === null || p.category_id === selectedCategory;
      const inKind =
        kind === "all" || (kind === "service" ? p.is_service : !p.is_service);
      const match =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q);
      return inCat && inKind && match;
    });
  }, [products, selectedCategory, kind, search]);

  // Enter في البحث:
  // - البحث فاضي → افتح الحساب (لو السلة فيها أصناف)
  // - نتيجة واحدة → ضيفها وامسح البحث
  function onSearchEnter() {
    const q = search.trim();
    if (q === "") {
      const cart = useCartStore.getState();
      if (cart.items.length > 0) {
        usePosUiStore.getState().openCheckout();
      }
      return;
    }
    if (filtered.length === 1) {
      selectProduct(filtered[0]);
      setSearch("");
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* بحث */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
        <Input
          id="pos-product-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearchEnter()}
          placeholder="ابحث عن منتج أو امسح الباركود..."
          className="h-12 rounded-xl pr-11 text-base shadow-sm focus-visible:ring-primary/30"
        />
      </div>

      {/* النوع: خدمات ولا منتجات — الصالون بيبيع الاتنين من نفس الشاشة */}
      <div className="flex gap-2">
        <CategoryPill label="الكل" active={kind === "all"} onClick={() => setKind("all")} />
        <CategoryPill label="خدمات" active={kind === "service"} onClick={() => setKind("service")} />
        <CategoryPill label="منتجات" active={kind === "product"} onClick={() => setKind("product")} />
      </div>

      {/* تبويبات الفئات — بتلفّ للسطر اللي بعده لما تكتر (بدل ما تختفي في تمرير أفقي) */}
      <div className="flex flex-wrap gap-2 pb-1">
        <CategoryPill
          label="كل الفئات"
          icon={<LayoutGrid className="h-4 w-4" />}
          active={selectedCategory === null}
          onClick={() => setSelectedCategory(null)}
        />
        {categories.map((c) => (
          <CategoryPill
            key={c.id}
            label={c.name}
            icon={<CategoryIcon name={c.icon} className="h-4 w-4" />}
            active={selectedCategory === c.id}
            onClick={() => setSelectedCategory(c.id)}
          />
        ))}
      </div>

      {/* شبكة المنتجات */}
      <div className="flex-1 overflow-y-auto pl-1">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="مفيش منتجات"
            description="جرّب فئة تانية أو امسح البحث."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onSelect={selectProduct} />
            ))}
          </div>
        )}
      </div>

      <SizePicker
        product={sizeProduct}
        onOpenChange={(o) => {
          if (!o) setSizeProduct(null);
        }}
        onPick={(size) => sizeProduct && confirmSize(sizeProduct, size)}
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
        onConfirm={confirmModifier}
        sizeLabel={pickedSize?.size ?? null}
        sizePrice={pickedSize?.price ?? null}
      />
    </div>
  );
}

function CategoryPill({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-surface-secondary text-text-secondary hover:text-text-primary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
