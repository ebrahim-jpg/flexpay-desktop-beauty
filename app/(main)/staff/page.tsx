"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { StaffList } from "@/components/staff/StaffList";
import { StaffModal } from "@/components/staff/StaffModal";
import { useIPC } from "@/hooks/useIPC";
import { useAuthStore } from "@/store/auth.store";
import type { SafeUser } from "@/types/ipc.types";

export default function StaffPage() {
  const { invoke } = useIPC();
  const currentUser = useAuthStore((s) => s.currentUser);
  const canManage = useAuthStore((s) => s.hasPermission("canManageStaff"));
  const viewerRole = currentUser?.role ?? "cashier";

  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SafeUser | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<SafeUser | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke("users:getAll");
      setUsers(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
  }, [users, search]);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(user: SafeUser) {
    setEditing(user);
    setModalOpen(true);
  }

  async function handleDeactivate() {
    if (!confirmTarget) return;
    try {
      await invoke("users:deactivate", confirmTarget.id);
      toast.success("تم تعطيل الموظف");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التعطيل");
    }
  }

  async function handleReactivate(user: SafeUser) {
    try {
      await invoke("users:reactivate", user.id);
      toast.success("تم إعادة تفعيل الموظف");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إعادة التفعيل");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="المستخدمين"
        description="إدارة الموظفين وأدوارهم وصلاحياتهم"
        action={
          canManage ? (
            <Button onClick={openAdd}>
              <Plus className="h-5 w-5" />
              إضافة مستخدم
            </Button>
          ) : undefined
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="ابحث بالاسم أو اسم المستخدم..."
        className="max-w-sm"
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="مفيش مستخدمين"
          description={
            canManage
              ? "ابدأ بإضافة أول موظف للمحل."
              : "لا يوجد مستخدمون مطابقون للبحث."
          }
          action={
            canManage ? (
              <Button onClick={openAdd}>
                <Plus className="h-5 w-5" />
                إضافة مستخدم
              </Button>
            ) : undefined
          }
        />
      ) : (
        <StaffList
          users={filtered}
          canManage={canManage}
          viewerRole={viewerRole}
          onEdit={openEdit}
          onDeactivate={setConfirmTarget}
          onReactivate={handleReactivate}
        />
      )}

      <StaffModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title="تعطيل الموظف"
        description={`متأكد إنك عايز تعطّل "${confirmTarget?.name}"؟ مش هيقدر يسجل دخول، بس بياناته بتفضل موجودة.`}
        confirmText="تعطيل"
        variant="danger"
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
