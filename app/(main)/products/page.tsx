"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { CategoryPanel } from "@/components/products/CategoryPanel";
import { CategoryModal } from "@/components/products/CategoryModal";
import { ProductGrid } from "@/components/products/ProductGrid";
import { ProductModal } from "@/components/products/ProductModal";
import { ImportModal } from "@/components/data-transfer/ImportModal";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import type { CategoryDTO, ProductDTO } from "@/shared/products";

export default function ProductsPage() {
  const { invoke } = useIPC();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission("canManageProducts");
  const isOwner = useAuthStore((s) => s.currentUser?.role === "owner");

  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDTO | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<CategoryDTO | null>(null);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductDTO | null>(null);
  const [deleteProductTarget, setDeleteProductTarget] = useState<ProductDTO | null>(null);
  const [removeCashierTarget, setRemoveCashierTarget] = useState<ProductDTO | null>(null);

  const loadCategories = useCallback(async () => {
    const data = await invoke("categories:getAll");
    setCategories(data);
  }, [invoke]);

  const loadProducts = useCallback(async () => {
    const data = await invoke("products:getAll");
    setProducts(data);
  }, [invoke]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([loadCategories(), loadProducts()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [loadCategories, loadProducts]);

  // التصدير بيحترم الفئة المختارة — «تصدير الكل» أو الفئة اللي إنت واقف عليها
  const exportProducts = useCallback(async () => {
    try {
      const p = await invoke("data:products:export", selectedCategory);
      if (p) toast.success("اتحفظ الملف");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التصدير");
    }
  }, [invoke, selectedCategory]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // فلترة المنتجات حسب الفئة المختارة + البحث
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const inCategory =
        selectedCategory === null || p.category_id === selectedCategory;
      const matches =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q);
      return inCategory && matches;
    });
  }, [products, selectedCategory, search]);

  // ===== فئات =====
  function openAddCategory() {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  }
  function openEditCategory(cat: CategoryDTO) {
    setEditingCategory(cat);
    setCategoryModalOpen(true);
  }

  async function handleCategoryMove(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
    try {
      await invoke("categories:reorder", { ids: next.map((c) => c.id) });
    } catch {
      void loadCategories();
    }
  }

  async function handleDeleteCategory() {
    if (!deleteCategoryTarget) return;
    try {
      await invoke("categories:delete", deleteCategoryTarget.id);
      toast.success("تم حذف الفئة");
      if (selectedCategory === deleteCategoryTarget.id) setSelectedCategory(null);
      await loadCategories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    }
  }

  // ===== منتجات =====
  function openAddProduct() {
    if (categories.length === 0) {
      toast.error("أضف فئة الأول قبل ما تضيف منتج");
      return;
    }
    setEditingProduct(null);
    setProductModalOpen(true);
  }
  function openEditProduct(product: ProductDTO) {
    setEditingProduct(product);
    setProductModalOpen(true);
  }

  async function handleToggleAvailable(product: ProductDTO, available: boolean) {
    try {
      const updated = await invoke("products:toggleAvailability", {
        id: product.id,
        available,
      });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التحديث");
    }
  }

  async function handleDeleteProduct() {
    if (!deleteProductTarget) return;
    try {
      await invoke("products:delete", deleteProductTarget.id);
      toast.success("تم حذف المنتج");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    }
  }

  // شيل من الكاشير (is_active=0) — بتأكيد. الرجوع فوري بدون تأكيد.
  async function handleRemoveFromCashier() {
    if (!removeCashierTarget) return;
    try {
      const updated = await invoke("products:setActive", {
        id: removeCashierTarget.id,
        active: false,
      });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success("اتشال من البيع");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الإجراء");
    }
  }

  async function handleRestoreToCashier(product: ProductDTO) {
    try {
      const updated = await invoke("products:setActive", {
        id: product.id,
        active: true,
      });
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success("رجع للبيع");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الإجراء");
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col space-y-4">
      <PageHeader
        title="المنتجات والفئات"
        description="إدارة كل ما يُباع في المحل"
        action={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={exportProducts}>
                <Download className="h-5 w-5" />
                تصدير
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-5 w-5" />
                استيراد
              </Button>
              <Button onClick={openAddProduct}>
                <Plus className="h-5 w-5" />
                إضافة منتج
              </Button>
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <div className="flex flex-1 gap-4 overflow-hidden">
          <CategoryPanel
            categories={categories}
            selectedId={selectedCategory}
            canManage={canManage}
            onSelect={setSelectedCategory}
            onAdd={openAddCategory}
            onEdit={openEditCategory}
            onDelete={setDeleteCategoryTarget}
            onMove={handleCategoryMove}
          />

          <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="ابحث بالاسم أو الباركود..."
              className="max-w-sm"
            />
            <div className="flex-1 overflow-y-auto pl-1">
              <ProductGrid
                products={filteredProducts}
                canManage={canManage}
                isOwner={isOwner}
                onEdit={openEditProduct}
                onToggleAvailable={handleToggleAvailable}
                onRemoveFromCashier={setRemoveCashierTarget}
                onRestoreToCashier={handleRestoreToCashier}
                onAdd={openAddProduct}
              />
            </div>
          </div>
        </div>
      )}

      <CategoryModal
        open={categoryModalOpen}
        onOpenChange={setCategoryModalOpen}
        editing={editingCategory}
        onSaved={loadCategories}
      />

      <ProductModal
        open={productModalOpen}
        onOpenChange={setProductModalOpen}
        editing={editingProduct}
        categories={categories}
        defaultCategoryId={selectedCategory}
        onSaved={loadAll}
      />

      <ConfirmDialog
        open={!!deleteCategoryTarget}
        onOpenChange={(o) => !o && setDeleteCategoryTarget(null)}
        title="حذف الفئة"
        description={`متأكد إنك عايز تحذف فئة "${deleteCategoryTarget?.name}"؟`}
        confirmText="حذف"
        variant="danger"
        onConfirm={handleDeleteCategory}
      />

      <ConfirmDialog
        open={!!deleteProductTarget}
        onOpenChange={(o) => !o && setDeleteProductTarget(null)}
        title="حذف المنتج"
        description={`متأكد إنك عايز تحذف منتج "${deleteProductTarget?.name}"؟ بياناته بتفضل موجودة.`}
        confirmText="حذف"
        variant="danger"
        onConfirm={handleDeleteProduct}
      />

      <ConfirmDialog
        open={!!removeCashierTarget}
        onOpenChange={(o) => !o && setRemoveCashierTarget(null)}
        title="شيل المنتج من البيع"
        description={`المنتج "${removeCashierTarget?.name}" هيختفي خالص من الطاولات والبيع السريع (مش هيظهر حتى كـ "نفد"). بياناته وتقاريره بتفضل زي ما هي، وتقدر ترجّعه في أي وقت. متأكد؟`}
        confirmText="شيله من البيع"
        variant="danger"
        onConfirm={handleRemoveFromCashier}
      />

      <ImportModal
        kind="products"
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={loadAll}
      />
    </div>
  );
}
