"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound, Users, Search, Gift } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIPC } from "@/hooks/useIPC";
import { ROLE_LABELS } from "@/shared/permissions";
import type { SafeUser } from "@/types/ipc.types";
import type { CustomerDTO } from "@/shared/customers";

interface FreeRecipientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** إجباري: المستدعي بيربط المجانية بنفسه (سلة الكاشير اتشالت) */
  onPick: (type: "staff" | "customer", id: number, name: string) => void;
}

// اختيار المستفيد من الفاتورة المجانية: موظف من المستخدمين أو عميل بالبحث.
export function FreeRecipientModal({ open, onOpenChange, onPick }: FreeRecipientModalProps) {
  const { invoke } = useIPC();

  const [users, setUsers] = useState<SafeUser[]>([]);
  const [staffTerm, setStaffTerm] = useState("");

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CustomerDTO[]>([]);
  const [searching, setSearching] = useState(false);

  // تحميل المستخدمين عند الفتح (كل الأدوار — حتى اللي مالهومش دخول)
  useEffect(() => {
    if (!open) return;
    setStaffTerm("");
    setTerm("");
    setResults([]);
    invoke("users:getAll")
      .then(setUsers)
      .catch(() => undefined);
  }, [open, invoke]);

  const filteredStaff = useMemo(() => {
    const q = staffTerm.trim();
    if (!q) return users;
    return users.filter((u) => u.name.includes(q));
  }, [users, staffTerm]);

  // بحث العملاء مع debounce
  useEffect(() => {
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
  }, [term, invoke]);

  function pickStaff(u: SafeUser) {
    onPick("staff", u.id, u.name);
    onOpenChange(false);
  }

  function pickCustomer(c: CustomerDTO) {
    onPick("customer", c.id, c.name); // المستدعي بيربط العميل بنفسه
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-danger" />
            مين هياخد المجاني؟
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="staff">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="staff">
              <Users className="h-4 w-4" />
              موظف
            </TabsTrigger>
            <TabsTrigger value="customer">
              <UserRound className="h-4 w-4" />
              عميل
            </TabsTrigger>
          </TabsList>

          {/* موظف */}
          <TabsContent value="staff" className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={staffTerm}
                onChange={(e) => setStaffTerm(e.target.value)}
                placeholder="ابحث عن موظف بالاسم..."
                className="pr-9"
                autoFocus
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredStaff.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-secondary">
                  مفيش موظف بالاسم ده
                </p>
              ) : (
                filteredStaff.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => pickStaff(u)}
                    className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-right transition-colors hover:border-primary/40 hover:bg-surface-secondary"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <span className="font-medium text-text-primary">{u.name}</span>
                    </div>
                    <span className="text-xs text-text-secondary">
                      {ROLE_LABELS[u.role]}
                    </span>
                  </button>
                ))
              )}
            </div>
          </TabsContent>

          {/* عميل */}
          <TabsContent value="customer" className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="ابحث عن عميل بالاسم أو الموبايل..."
                className="pr-9"
                autoFocus
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {searching && (
                <p className="py-4 text-center text-sm text-text-secondary">بيدور...</p>
              )}
              {!searching && term.trim() && results.length === 0 && (
                <p className="py-4 text-center text-sm text-text-secondary">
                  مفيش عميل بالاسم ده
                </p>
              )}
              {!searching && !term.trim() && (
                <p className="py-4 text-center text-sm text-text-secondary">
                  اكتب اسم أو موبايل العميل عشان تدوّر
                </p>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickCustomer(c)}
                  className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-right transition-colors hover:border-primary/40 hover:bg-surface-secondary"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <span className="font-medium text-text-primary">{c.name}</span>
                  </div>
                  {c.phone && (
                    <span className="text-xs text-text-secondary" dir="ltr">
                      {c.phone}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
