"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { POSHeader } from "@/components/pos/POSHeader";
import { POSProductPanel } from "@/components/pos/POSProductPanel";
import { OrderSummary } from "@/components/pos/OrderSummary";
import { useIPC } from "@/hooks/useIPC";
import { usePosShortcuts } from "@/hooks/usePosShortcuts";
import { useCartStore } from "@/store/cart.store";
import { PREPARE_ORDER_KEY } from "@/store/online-orders.store";
import type { ProductDTO, CategoryDTO } from "@/shared/products";

// كاشير المطعم — التيك أواي والتوصيل وطلبات المتجر.
// الصالة (الطاولات) شاشة تانية: حساب مفتوح بيتقفل لما الزبون يمشي.
export default function POSPage() {
  const { invoke } = useIPC();
  const [products, setProducts] = useState<ProductDTO[]>([]);
  usePosShortcuts(products);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    const all = await invoke("products:getAll");
    setProducts(all.filter((p) => p.is_active));
  }, [invoke]);

  // تجهيز طلب متجر: صفحة «طلبات المتجر» بتسيب رقم الطلب في localStorage وتنقلنا هنا،
  // والكاشير هو اللي يملّي السلة بعد ما يفتح — عشان يعيش عبر إعادة التحميل في النسخة النهائية.
  const prefillFromOnlineOrder = useCallback(
    async (localId: string) => {
      try {
        const order = await invoke("onlineOrders:get", localId);
        if (!order) return;
        const all = await invoke("products:getAll");
        const byId = new Map(all.map((p) => [p.id, p]));
        const customer = await invoke("customers:findOrCreateByPhone", {
          phone: order.customer_phone,
          name: order.customer_name,
        });

        const cart = useCartStore.getState();
        cart.clearCart();
        const missing: string[] = [];
        const noSize: string[] = [];
        for (const it of order.items) {
          const product = byId.get(it.product_desktop_id);
          if (!product) {
            missing.push(it.name);
            continue;
          }
          // الحجم اللي الزبون اختاره أونلاين بيتحط زي ما هو — الكاشير مايختارش تاني.
          // ⚠️ الحجم بيتجاب من القاعدة (السعر من عندنا مش من الطلب). ولو المنتج بقى
          // بأحجام والطلب قديم بلا حجم، بنقول للكاشير يختار بنفسه بدل ما البيعة تترفض
          // عند الحساب من غير سبب واضح.
          let size = null;
          if (it.variant_desktop_id) {
            const list = await invoke("sizes:getByProduct", product.id);
            size = list.find((v) => v.id === it.variant_desktop_id && v.is_active) ?? null;
          }
          if (product.has_sizes && !size) {
            noSize.push(it.name);
            continue;
          }
          cart.addItem(product, [], it.notes ?? "", it.quantity, size);
        }
        // القاعدة: العنوان والملاحظة العامة في **حقل واحد** (الهيدر «عنوان / ملاحظة
        // التوصيل») بصيغة «العنوان / الملاحظة» — بلا بادئات ولا حقل تاني في التقفيل.
        cart.setCustomer(customer.id, customer.name);
        cart.setOrderType("delivery");
        cart.setNotes([order.address, order.notes].filter(Boolean).join(" / "));
        cart.setOnlineOrder(order.local_id);

        if (missing.length > 0) {
          toast.warning(`منتجات مش موجودة دلوقتي: ${missing.join("، ")} — راجع السلة`);
        }
        if (noSize.length > 0) {
          toast.warning(`محتاجة تختار حجم: ${noSize.join("، ")} — ضيفها من الشبكة`);
        }
        toast.success("طلب المتجر اتحمّل في السلة — راجعه واضربه توصيل");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر تجهيز طلب المتجر");
      }
    },
    [invoke]
  );

  // مرة واحدة عند فتح الكاشير: لو فيه طلب متجر مستنّي تجهيز، املا السلة بيه
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.localStorage.getItem(PREPARE_ORDER_KEY);
    if (id) {
      window.localStorage.removeItem(PREPARE_ORDER_KEY);
      void prefillFromOnlineOrder(id);
    }
  }, [prefillFromOnlineOrder]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [, cats] = await Promise.all([
        loadProducts(),
        invoke("categories:getAll"),
      ]);
      setCategories(cats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  }, [invoke, loadProducts]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <div className="flex h-full flex-col">
      {/* هيدر الكاشير: نوع الطلب + العميل + ملاحظة */}
      <POSHeader />

      {loading ? (
        <div className="p-6">
          <LoadingSkeleton rows={6} />
        </div>
      ) : (
        // RTL: أول عنصر يظهر على اليمين → السلة يمين، المنتجات شمال
        <div className="flex flex-1 overflow-hidden">
          <OrderSummary onSold={loadProducts} />
          <div className="flex-1 overflow-hidden border-s border-border p-4">
            <POSProductPanel products={products} categories={categories} />
          </div>
        </div>
      )}
    </div>
  );
}
