"use client";

import { useEffect, useState } from "react";
import { Users, ChevronRight, ChevronLeft } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { CustomerCard } from "./CustomerCard";
import type { CustomerDTO } from "@/shared/customers";

const PAGE_SIZE = 20;

export function CustomerList({
  customers,
  onAdd,
}: {
  customers: CustomerDTO[];
  onAdd: () => void;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));

  // ارجع لأول صفحة لو اتغيرت الفلترة
  useEffect(() => {
    setPage(1);
  }, [customers]);

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="مفيش عملاء"
        description="ابدأ بإضافة أول عميل، أو سجّل عميل من الطاولات أو البيع السريع."
        action={
          <Button onClick={onAdd}>
            <Users className="h-4 w-4" />
            إضافة عميل
          </Button>
        }
      />
    );
  }

  const start = (page - 1) * PAGE_SIZE;
  const visible = customers.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => (
          <CustomerCard key={c.id} customer={c} />
        ))}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronRight className="h-4 w-4" />
            السابق
          </Button>
          <span className="text-sm text-text-secondary">
            صفحة {page} من {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
