"use client";

import { Lock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { SalesReport } from "@/components/reports/SalesReport";
import { InventoryReport } from "@/components/reports/InventoryReport";
import { useAuthStore } from "@/store/auth.store";

export default function ReportsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);

  if (!hasPermission("canViewReports")) {
    return (
      <div className="space-y-6">
        <PageHeader title="التقارير" />
        <EmptyState
          icon={Lock}
          title="مفيش صلاحية"
          description="مالكش صلاحية عرض التقارير. كلّم المالك."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير"
        description="المبيعات والمخزون — آخر 30 يوم. التقارير التاريخية الكاملة في السحابة."
      />

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">تقرير المبيعات</TabsTrigger>
          <TabsTrigger value="inventory">تقرير المخزون</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <SalesReport />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
