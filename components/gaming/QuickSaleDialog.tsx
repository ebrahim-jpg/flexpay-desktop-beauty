"use client";

import { useCallback, useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { POSProductPanel } from "@/components/pos/POSProductPanel";
import { OrderSummary } from "@/components/pos/OrderSummary";
import { CustomerSearch } from "@/components/pos/CustomerSearch";
import { useIPC } from "@/hooks/useIPC";
import { useCartStore } from "@/store/cart.store";
import type { CategoryDTO, ProductDTO } from "@/shared/products";

interface QuickSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSold?: () => void;
}

// «بيع سريع» — لحد بيشتري مشروب/سناك من غير ما يقعد في غرفة.
// بيعيد استخدام قطع الكاشير (المنتجات + السلة + الخصم + المجانية + الدفع) **من غير صفحة كاشير**:
// نوع الطلب ثابت «عادي» (مفيش توصيل في البلايستيشن) والفاتورة مصدرها pos.
export function QuickSaleDialog({ open, onOpenChange, onSold }: QuickSaleDialogProps) {
  const { invoke } = useIPC();
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const notes = useCartStore((s) => s.notes);
  const setNotes = useCartStore((s) => s.setNotes);

  const loadProducts = useCallback(async () => {
    const all = await invoke("products:getAll");
    setProducts(all.filter((p) => p.is_active));
  }, [invoke]);

  useEffect(() => {
    if (!open) return;
    // ⚠️ السلة مشتركة: نتأكد إنها «عادي» ومش مربوطة بطلب متجر قديم
    const cart = useCartStore.getState();
    cart.setOrderType("counter");
    cart.setOnlineOrder(null);
    let alive = true;
    setLoading(true);
    void Promise.all([loadProducts(), invoke("categories:getAll")])
      .then(([, cats]) => alive && setCategories(cats))
      .catch((e) => toast.error(e instanceof Error ? e.message : "تعذّر تحميل المنتجات"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, invoke, loadProducts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            بيع سريع
          </DialogTitle>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="min-w-[240px] flex-1 sm:max-w-xs">
              <CustomerSearch />
            </div>
            <div className="min-w-[200px] flex-1">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظة على الفاتورة (اختياري)..." />
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="p-6">
            <LoadingSkeleton rows={6} />
          </div>
        ) : (
          // RTL: السلة يمين والمنتجات شمال — نفس ترتيب الكاشير اللي الكاشير متعوّد عليه
          <div className="flex flex-1 overflow-hidden">
            <OrderSummary
              onSold={() => {
                void loadProducts();
                onSold?.();
              }}
            />
            <div className="flex-1 overflow-hidden border-s border-border p-4">
              <POSProductPanel products={products} categories={categories} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
