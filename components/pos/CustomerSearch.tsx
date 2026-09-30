"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound, UserPlus, X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCartStore } from "@/store/cart.store";
import { useIPC } from "@/hooks/useIPC";
import { formatDate } from "@/lib/formatters";
import { CustomerModal } from "@/components/customers/CustomerModal";
import type { CustomerDTO } from "@/shared/customers";

const isFullPhone = (s: string) => /^\d{11}$/.test(s.trim());

interface CustomerSearchProps {
  /** عميل متحكَّم فيه من بره (حساب الجلسة) — من غيره بيقرا ويكتب في سلة البيع السريع */
  value?: { id: number | null; name: string };
  onChange?: (id: number | null, name: string) => void;
  inputId?: string;
}

export function CustomerSearch({ value, onChange, inputId = "pos-customer-search" }: CustomerSearchProps = {}) {
  const { invoke } = useIPC();
  const cartCustomerId = useCartStore((s) => s.customerId);
  const cartCustomerName = useCartStore((s) => s.customerName);
  const cartSetCustomer = useCartStore((s) => s.setCustomer);
  const customerId = value ? value.id : cartCustomerId;
  const customerName = value ? value.name : cartCustomerName;
  const setCustomer = onChange ?? cartSetCustomer;

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CustomerDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // بحث مع debounce بسيط
  useEffect(() => {
    if (customerId !== null) return;
    const q = term.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(() => {
      invoke("customers:search", q)
        .then((r) => active && setResults(r))
        .catch(() => undefined)
        .finally(() => active && setSearching(false));
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [term, customerId, invoke]);

  const phone = term.trim();
  const fullPhone = isFullPhone(phone);
  // هل فيه عميل بنفس الرقم بالظبط؟
  const exactMatch = useMemo(
    () => (fullPhone ? results.find((c) => c.phone === phone) ?? null : null),
    [results, fullPhone, phone]
  );
  // نعرض زر التسجيل السريع لما الرقم 11 رقم ومش موجود
  const showQuickAdd = fullPhone && !exactMatch && !searching;

  function selectCustomer(c: CustomerDTO) {
    setCustomer(c.id, c.name);
    setTerm("");
    setResults([]);
  }

  // اختصار Enter: لو فيه تطابق تام → اختاره؛ نتيجة واحدة → اختارها؛ رقم 11 جديد → افتح الإضافة
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (exactMatch) selectCustomer(exactMatch);
    else if (results.length === 1) selectCustomer(results[0]);
    else if (fullPhone) setAddOpen(true);
  }

  // عميل مختار
  if (customerId !== null) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <span className="font-medium text-text-primary">{customerName}</span>
        </div>
        <button
          onClick={() => setCustomer(null, "زائر")}
          title="إزالة العميل"
          className="rounded-md p-1.5 text-text-secondary hover:bg-surface-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
      <Input
        id={inputId}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="رقم الموبايل (11 رقم) أو الاسم..."
        className="pr-9"
        inputMode="text"
      />

      {/* النتايج + زر الإضافة السريعة كـ dropdown عائم */}
      {term.trim() && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg">
          {searching && (
            <p className="py-2 text-center text-xs text-text-secondary">بيدور...</p>
          )}

          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCustomer(c)}
              className="flex w-full items-center justify-between rounded-md p-2 text-right transition-colors hover:bg-surface-secondary"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">{c.name}</p>
                {c.phone && (
                  <p className="text-xs text-text-secondary" dir="ltr">
                    {c.phone}
                  </p>
                )}
              </div>
              {c.last_visit_at && (
                <span className="text-[10px] text-text-secondary">
                  آخر زيارة {formatDate(c.last_visit_at)}
                </span>
              )}
            </button>
          ))}

          {/* زر التسجيل السريع — يظهر لما الرقم 11 رقم ومش مسجّل */}
          {showQuickAdd && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-right transition-colors hover:bg-primary/10"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-primary">
                <UserPlus className="h-4 w-4" />
                تسجيل عميل جديد بالرقم <span dir="ltr">{phone}</span>
              </span>
              <kbd className="rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-text-secondary">
                Enter
              </kbd>
            </button>
          )}

          {/* مفيش نتايج ومش رقم كامل → إرشاد */}
          {!searching && results.length === 0 && !fullPhone && (
            <p className="py-2 text-center text-xs text-text-secondary">
              اكتب رقم الموبايل كامل (11 رقم) لتسجيل عميل جديد.
            </p>
          )}
        </div>
      )}

      {/* مودال الإضافة الكامل — نفس بتاع صفحة العملاء، بالرقم معبّى */}
      <CustomerModal
        open={addOpen}
        onOpenChange={setAddOpen}
        editing={null}
        initialPhone={phone}
        onSaved={(c) => selectCustomer(c)}
      />
    </div>
  );
}
