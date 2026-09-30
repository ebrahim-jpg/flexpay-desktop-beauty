"use client";

import { Lock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { AttendanceTab } from "@/components/management/AttendanceTab";
import { ExpensesTab } from "@/components/management/ExpensesTab";
import { useAuthStore } from "@/store/auth.store";

export default function ManagementPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canAttendance = hasPermission("canManageAttendance");
  const canExpenses = hasPermission("canManageExpenses");

  if (!canAttendance && !canExpenses) {
    return (
      <div className="space-y-6">
        <PageHeader title="الإدارة" />
        <EmptyState
          icon={Lock}
          title="مفيش صلاحية"
          description="مالكش صلاحية الوصول لشاشة الإدارة. كلّم المالك."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإدارة"
        description="الحضور والانصراف والمصاريف — آخر 30 يوم"
      />

      <Tabs defaultValue={canExpenses ? "expenses" : "attendance"}>
        <TabsList>
          {canExpenses && <TabsTrigger value="expenses">المصاريف</TabsTrigger>}
          {canAttendance && (
            <TabsTrigger value="attendance">الحضور والانصراف</TabsTrigger>
          )}
        </TabsList>

        {canExpenses && (
          <TabsContent value="expenses">
            <ExpensesTab />
          </TabsContent>
        )}
        {canAttendance && (
          <TabsContent value="attendance">
            <AttendanceTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
