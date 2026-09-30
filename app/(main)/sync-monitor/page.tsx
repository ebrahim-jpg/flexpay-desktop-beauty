"use client";

import { Lock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { SyncMonitor } from "@/components/sync/SyncMonitor";
import { useAuthStore } from "@/store/auth.store";

export default function SyncMonitorPage() {
  const canViewSync = useAuthStore((s) => s.hasPermission("canViewSync"));

  if (!canViewSync) {
    return (
      <div className="space-y-6">
        <PageHeader title="مراقب المزامنة" />
        <EmptyState
          icon={Lock}
          title="مفيش صلاحية"
          description="مالكش صلاحية الوصول لمراقب المزامنة. كلّم المالك."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مراقب المزامنة"
        description="حالة رفع البيانات للسحابة — كل بيانة بتتسجّل بتترفع، مفيش حاجة بتضيع"
      />
      <SyncMonitor />
    </div>
  );
}
