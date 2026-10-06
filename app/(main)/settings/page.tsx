"use client";

import { Lock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { ShopInfoForm } from "@/components/settings/ShopInfoForm";
import { BusinessSettings } from "@/components/settings/BusinessSettings";
import { PaymentMethodsEditor } from "@/components/settings/PaymentMethodsEditor";
import { NationalitiesEditor } from "@/components/settings/NationalitiesEditor";
import { ReceiptSettings } from "@/components/settings/ReceiptSettings";
import { SyncSettings } from "@/components/settings/SyncSettings";
import { BackupSettings } from "@/components/settings/BackupSettings";
import { TablesManager } from "@/components/gaming/TablesManager";
import { useAuthStore } from "@/store/auth.store";
import { useSettingsStore } from "@/store/settings.store";

export default function SettingsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isLoaded = useSettingsStore((s) => s.isLoaded);

  const isOwner = currentUser?.role === "owner";

  if (!hasPermission("canViewSettings")) {
    return (
      <div className="space-y-6">
        <PageHeader title="الإعدادات" />
        <EmptyState
          icon={Lock}
          title="مفيش صلاحية"
          description="مالكش صلاحية الوصول للإعدادات. كلّم المالك."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإعدادات"
        description="بيانات المحل والعملة واليوم التجاري وطرق الدفع"
      />

      {!isLoaded ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <Tabs defaultValue="shop">
          <TabsList>
            <TabsTrigger value="shop">بيانات المحل</TabsTrigger>
            <TabsTrigger value="business">إعدادات العمل</TabsTrigger>
            <TabsTrigger value="gaming">الكراسي</TabsTrigger>
            <TabsTrigger value="payments">طرق الدفع</TabsTrigger>
            <TabsTrigger value="nationalities">الجنسيات</TabsTrigger>
            <TabsTrigger value="receipt">الفاتورة والطباعة</TabsTrigger>
            {isOwner && <TabsTrigger value="sync">المزامنة</TabsTrigger>}
            {isOwner && <TabsTrigger value="backup">النسخ الاحتياطي</TabsTrigger>}
          </TabsList>

          <TabsContent value="shop">
            <ShopInfoForm />
          </TabsContent>
          <TabsContent value="business">
            <BusinessSettings />
          </TabsContent>
          <TabsContent value="gaming">
            <TablesManager />
          </TabsContent>
          <TabsContent value="payments">
            <PaymentMethodsEditor />
          </TabsContent>
          <TabsContent value="nationalities">
            <NationalitiesEditor />
          </TabsContent>
          <TabsContent value="receipt">
            <ReceiptSettings />
          </TabsContent>
          {isOwner && (
            <TabsContent value="sync">
              <SyncSettings />
            </TabsContent>
          )}
          {isOwner && (
            <TabsContent value="backup">
              <BackupSettings />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
