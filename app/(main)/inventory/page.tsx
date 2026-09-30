"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InventoryList } from "@/components/inventory/InventoryList";
import { InventoryItemModal } from "@/components/inventory/InventoryItemModal";
import { RestockModal } from "@/components/inventory/RestockModal";
import { WasteModal } from "@/components/inventory/WasteModal";
import { TransactionDrawer } from "@/components/inventory/TransactionDrawer";
import { SupplierList } from "@/components/inventory/SupplierList";
import { SupplierModal } from "@/components/inventory/SupplierModal";
import { SupplierLedgerModal } from "@/components/inventory/SupplierLedgerModal";
import { RecipesTab } from "@/components/inventory/RecipesTab";
import { PurchaseInvoicesTab } from "@/components/inventory/PurchaseInvoicesTab";
import { StocktakeTab } from "@/components/inventory/StocktakeTab";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";
import type { InventoryItemDTO, SupplierDTO } from "@/shared/inventory";

type Filter = "all" | "low" | "out";

export default function InventoryPage() {
  const { invoke } = useIPC();
  // canManage = إدارة المخزون الكاملة (المواد + الجرد + الوصفات)
  const canManage = useAuthStore((s) => s.hasPermission("canManageInventory"));
  // صلاحيات جزئية للكاشير: فواتير التوريد + الموردين (بيوصّلوا لتابات محددة بس)
  const canInvoices = useAuthStore(
    (s) => s.hasPermission("canManageInventory") || s.hasPermission("canCreatePurchaseInvoices")
  );
  const canSuppliers = useAuthStore(
    (s) => s.hasPermission("canManageInventory") || s.hasPermission("canManageSuppliers")
  );
  // التاب الافتراضي = أول تاب متاح للمستخدم
  const defaultTab = canManage ? "inventory" : canInvoices ? "invoices" : "suppliers";

  const [items, setItems] = useState<InventoryItemDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  // modals
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemDTO | null>(null);
  const [restockTarget, setRestockTarget] = useState<InventoryItemDTO | null>(null);
  const [wasteTarget, setWasteTarget] = useState<InventoryItemDTO | null>(null);
  const [historyTarget, setHistoryTarget] = useState<InventoryItemDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItemDTO | null>(null);

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDTO | null>(null);
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<SupplierDTO | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<SupplierDTO | null>(null);

  const loadItems = useCallback(async () => {
    const data = await invoke("inventory:getAll");
    setItems(data);
  }, [invoke]);

  const loadSuppliers = useCallback(async () => {
    const data = await invoke("suppliers:getAll");
    setSuppliers(data);
  }, [invoke]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([loadItems(), loadSuppliers()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [loadItems, loadSuppliers]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const lowCount = items.filter((i) => i.status === "low").length;
  const outCount = items.filter((i) => i.status === "out_of_stock").length;

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const byFilter =
        filter === "all" ||
        (filter === "low" && i.status === "low") ||
        (filter === "out" && i.status === "out_of_stock");
      const bySearch = !q || i.name.toLowerCase().includes(q);
      return byFilter && bySearch;
    });
  }, [items, filter, search]);

  // handlers
  function openAddItem() {
    setEditingItem(null);
    setItemModalOpen(true);
  }
  function openEditItem(item: InventoryItemDTO) {
    setEditingItem(item);
    setItemModalOpen(true);
  }

  async function handleDeleteItem() {
    if (!deleteTarget) return;
    try {
      await invoke("inventory:delete", deleteTarget.id);
      toast.success("تم حذف المادة");
      await loadItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    }
  }

  function openAddSupplier() {
    setEditingSupplier(null);
    setSupplierModalOpen(true);
  }
  function openEditSupplier(s: SupplierDTO) {
    setEditingSupplier(s);
    setSupplierModalOpen(true);
  }
  async function handleDeleteSupplier() {
    if (!deleteSupplierTarget) return;
    try {
      await invoke("suppliers:delete", deleteSupplierTarget.id);
      toast.success("تم حذف المورد");
      await loadSuppliers();
      await loadItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    }
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "low", label: "منخفض" },
    { key: "out", label: "نفد" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="المخزون"
        description="المواد الخام والموردين"
        action={
          <div className="flex items-center gap-2">
            {lowCount > 0 && <Badge variant="warning">{lowCount} منخفض</Badge>}
            {outCount > 0 && <Badge variant="danger">{outCount} نفد</Badge>}
          </div>
        }
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {canManage && <TabsTrigger value="inventory">المخزون</TabsTrigger>}
          {canManage && <TabsTrigger value="stocktake">الجرد</TabsTrigger>}
          {canInvoices && <TabsTrigger value="invoices">فواتير التوريد</TabsTrigger>}
          {canManage && <TabsTrigger value="recipes">الوصفات</TabsTrigger>}
          {canSuppliers && <TabsTrigger value="suppliers">الموردين</TabsTrigger>}
        </TabsList>

        {/* المخزون */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-surface-secondary p-1">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    filter === f.key
                      ? "bg-surface text-text-primary shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="ابحث بالاسم..."
                className="w-56"
              />
              {canManage && (
                <Button onClick={openAddItem}>
                  <Plus className="h-5 w-5" />
                  إضافة مادة
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <InventoryList
              items={filteredItems}
              canManage={canManage}
              onRestock={setRestockTarget}
              onWaste={setWasteTarget}
              onHistory={setHistoryTarget}
              onEdit={openEditItem}
              onDelete={setDeleteTarget}
            />
          )}
        </TabsContent>

        {/* الجرد */}
        <TabsContent value="stocktake" className="space-y-4">
          <StocktakeTab />
        </TabsContent>

        {/* فواتير التوريد */}
        <TabsContent value="invoices" className="space-y-4">
          <PurchaseInvoicesTab />
        </TabsContent>

        {/* الوصفات */}
        <TabsContent value="recipes" className="space-y-4">
          <RecipesTab />
        </TabsContent>

        {/* الموردين */}
        <TabsContent value="suppliers" className="space-y-4">
          {canSuppliers && (
            <div className="flex justify-end">
              <Button onClick={openAddSupplier}>
                <Plus className="h-5 w-5" />
                إضافة مورد
              </Button>
            </div>
          )}
          {loading ? (
            <LoadingSkeleton rows={3} />
          ) : (
            <SupplierList
              suppliers={suppliers}
              canManage={canSuppliers}
              onEdit={openEditSupplier}
              onDelete={setDeleteSupplierTarget}
              onLedger={setLedgerSupplier}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* المودالات */}
      <InventoryItemModal
        open={itemModalOpen}
        onOpenChange={setItemModalOpen}
        editing={editingItem}
        suppliers={suppliers}
        onSaved={loadItems}
      />
      <RestockModal
        open={!!restockTarget}
        onOpenChange={(o) => !o && setRestockTarget(null)}
        item={restockTarget}
        onSaved={loadItems}
      />
      <WasteModal
        open={!!wasteTarget}
        onOpenChange={(o) => !o && setWasteTarget(null)}
        item={wasteTarget}
        onSaved={loadItems}
      />
      <TransactionDrawer
        open={!!historyTarget}
        onOpenChange={(o) => !o && setHistoryTarget(null)}
        item={historyTarget}
      />
      <SupplierModal
        open={supplierModalOpen}
        onOpenChange={setSupplierModalOpen}
        editing={editingSupplier}
        onSaved={loadSuppliers}
      />
      <SupplierLedgerModal
        supplier={ledgerSupplier}
        onOpenChange={(o) => !o && setLedgerSupplier(null)}
        onChanged={loadSuppliers}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="حذف المادة"
        description={`متأكد إنك عايز تحذف "${deleteTarget?.name}"؟ بياناتها بتفضل موجودة.`}
        confirmText="حذف"
        variant="danger"
        onConfirm={handleDeleteItem}
      />
      <ConfirmDialog
        open={!!deleteSupplierTarget}
        onOpenChange={(o) => !o && setDeleteSupplierTarget(null)}
        title="حذف المورد"
        description={`متأكد إنك عايز تحذف المورد "${deleteSupplierTarget?.name}"؟`}
        confirmText="حذف"
        variant="danger"
        onConfirm={handleDeleteSupplier}
      />
    </div>
  );
}
