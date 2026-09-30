"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { CustomerFilters } from "@/components/customers/CustomerFilters";
import { CustomerList } from "@/components/customers/CustomerList";
import { CustomerModal } from "@/components/customers/CustomerModal";
import { ImportModal } from "@/components/data-transfer/ImportModal";
import { useIPC } from "@/hooks/useIPC";
import type { CustomerDTO, Classification, CustomerSortKey } from "@/shared/customers";

export default function CustomersPage() {
  const { invoke } = useIPC();

  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState<Classification | "all">("all");
  const [sort, setSort] = useState<CustomerSortKey>("last_visit");
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke("customers:getAll", {
        search: search.trim() || undefined,
        classification,
        sort,
      });
      setCustomers(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تحميل العملاء");
    } finally {
      setLoading(false);
    }
  }, [invoke, search, classification, sort]);

  // ⚠️ التصدير بيرجّع **كل** العملاء مش المفلترين — الملف ده بيرجع يتستورد،
  // وتصدير نتيجة فلترة كان هيدّي المستخدم إحساس إن ده كل عملاؤه
  const exportCustomers = useCallback(async () => {
    try {
      const p = await invoke("data:customers:export");
      if (p) toast.success("اتحفظ الملف");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التصدير");
    }
  }, [invoke]);

  // debounce بسيط على البحث + الفلاتر
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="العملاء"
        description={loading ? "—" : `${customers.length} عميل`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCustomers}>
              <Download className="h-5 w-5" />
              تصدير
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-5 w-5" />
              استيراد
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-5 w-5" />
              إضافة عميل
            </Button>
          </div>
        }
      />

      <CustomerFilters
        search={search}
        onSearch={setSearch}
        classification={classification}
        onClassification={setClassification}
        sort={sort}
        onSort={setSort}
      />

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <CustomerList customers={customers} onAdd={() => setModalOpen(true)} />
      )}

      <CustomerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={null}
        onSaved={() => load()}
      />

      <ImportModal
        kind="customers"
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={load}
      />
    </div>
  );
}
