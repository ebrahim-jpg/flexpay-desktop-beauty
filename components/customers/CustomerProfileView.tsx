"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Users } from "lucide-react";
import { CustomerProfileCard } from "./CustomerProfileCard";
import { CustomerStats } from "./CustomerStats";
import { FavoriteProduct } from "./FavoriteProduct";
import { PurchaseHistory } from "./PurchaseHistory";
import { CustomerFreeItems } from "./CustomerFreeItems";
import { CustomerModal } from "./CustomerModal";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import type { CustomerDTO } from "@/shared/customers";

export function CustomerProfileView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { invoke } = useIPC();
  // تعديل/حذف العميل = مدير/مالك فقط (canEditCustomers). الكاشير يشوف بس.
  const canManage = useAuthStore((s) => s.hasPermission("canEditCustomers"));

  const id = Number(searchParams.get("id"));
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id || Number.isNaN(id)) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await invoke("customers:getById", id);
      setCustomer(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل العميل");
    } finally {
      setLoading(false);
    }
  }, [id, invoke]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!customer) return;
    try {
      await invoke("customers:delete", customer.id);
      toast.success("تم حذف العميل");
      router.push("/customers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحذف");
    }
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push("/customers")}>
        <ArrowRight className="h-4 w-4" />
        رجوع للعملاء
      </Button>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : !customer ? (
        <EmptyState
          icon={Users}
          title="العميل غير موجود"
          description="يمكن يكون اتحذف أو الرابط غلط."
        />
      ) : (
        <>
          <CustomerProfileCard
            customer={customer}
            canManage={canManage}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
          <CustomerStats customer={customer} />
          <FavoriteProduct customer={customer} />

          <CustomerFreeItems customerId={customer.id} />

          <div>
            <h3 className="mb-3 text-lg font-bold text-text-primary">سجل المشتريات</h3>
            <PurchaseHistory customerId={customer.id} />
          </div>

          <CustomerModal
            open={editOpen}
            onOpenChange={setEditOpen}
            editing={customer}
            onSaved={(c) => setCustomer(c)}
          />
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="حذف العميل"
            description={`متأكد إنك عايز تحذف "${customer.name}"؟ بياناته بتفضل موجودة لكن مش هيظهر في القوائم.`}
            confirmText="حذف"
            variant="danger"
            onConfirm={handleDelete}
          />
        </>
      )}
    </div>
  );
}
