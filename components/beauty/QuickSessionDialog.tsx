"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserRound, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIPC } from "@/hooks/useIPC";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/utils";
import type { ProductDTO } from "@/shared/products";
import type { GamingRoomDTO, GamingSessionDTO } from "@/shared/gaming";
import type { SafeUser } from "@/types/ipc.types";

/**
 * **الجلسة السريعة** — الحلاق + الخدمة + الحساب في تلات دوسات، من غير وقفة.
 *
 * ⚠️ **ليه موجودة:** الجلسة بتقيس **الوقت**، وده أهم رقم في الصالون (إشغال كل حلاق
 * ومدة كل خدمة فعلياً — وأساس المواعيد بعدين). بس حلاق رجالي بيقص في ١٥ دقيقة
 * والزبون واقف — فتح جلسة وقفلها بإيده دوسات زيادة، ولو مالتزمش **تقارير الوقت
 * تبقى زبالة والفلوس نفسها تتسجّل غلط**.
 *
 * الحل: نفس مسار الجلسة بالحرف (`open → addItem → checkout`) بس في دوسة واحدة
 * متصلة. الزمن بيتسجّل (دقيقة الفتح = دقيقة الخدمة)، والعمولة بتتحسب زي أي جلسة.
 *
 * ⚠️ ومفيش أي IPC جديد: بتستخدم القنوات الموجودة — فمفيش مسار تاني للفلوس يحتاج
 * اختبار لوحده.
 */
export function QuickSessionDialog({
  chair,
  onOpenChange,
  onDone,
}: {
  chair: GamingRoomDTO | null;
  onOpenChange: (open: boolean) => void;
  /** بعد الحساب — الصفحة بتعيد التحميل وتعرض الفاتورة */
  onDone: (session: GamingSessionDTO, orderId: number) => void;
}) {
  const { invoke } = useIPC();
  const formatCurrency = useSettingsStore((s) => s.formatCurrency);

  const [staff, setStaff] = useState<SafeUser[]>([]);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [picked, setPicked] = useState<SafeUser | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!chair) return;
    let active = true;
    setPicked(null);
    setSearch("");
    void Promise.all([invoke("users:getAll"), invoke("products:getAll")])
      .then(([users, prods]) => {
        if (!active) return;
        setStaff(
          users.filter((u) => u.is_active && ["stylist", "manager", "owner"].includes(u.role))
        );
        // الجلسة السريعة للخدمات — المنتجات بتتباع من الكاشير
        setProducts(prods.filter((p) => p.is_active && p.is_available && p.is_service));
      })
      .catch(() => {
        if (!active) return;
        setStaff([]);
        setProducts([]);
      });
    return () => {
      active = false;
    };
  }, [chair, invoke]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

  /**
   * الخدمة اتختارت → جلسة تفتح وتتحاسب في نفس اللحظة.
   * ⚠️ **الترتيب مهم:** لو الحساب فشل، الجلسة بتفضل **مفتوحة** على الكرسي —
   * والحلاق يكمّلها من الشاشة العادية. أحسن من إننا نلغيها ونضيّع الخدمة.
   */
  async function run(product: ProductDTO) {
    if (!chair || !picked || busy) return;
    try {
      setBusy(true);
      const session = await invoke("gaming:session:open", {
        room_id: chair.id,
        staff_id: picked.id,
      });
      await invoke("gaming:session:addItem", {
        session_id: session.id,
        product_id: product.id,
        quantity: 1,
      });
      const res = await invoke("gaming:session:checkout", {
        session_id: session.id,
        payment_method: "cash",
        amount_paid: product.price,
        discount_type: "none",
        discount_value: 0,
      });
      toast.success(`${product.name} — ${picked.name} · ${formatCurrency(res.order.total)}`);
      onOpenChange(false);
      onDone(res.session, res.order.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت الجلسة السريعة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!chair} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-accent-foreground" />
            جلسة سريعة — {chair?.name ?? ""}
          </DialogTitle>
          <DialogDescription>
            {picked
              ? `${picked.name} — اختار الخدمة وهتتحاسب على طول`
              : "اختار الحلاق الأول"}
          </DialogDescription>
        </DialogHeader>

        {/* ① الحلاق */}
        {!picked ? (
          staff.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-secondary">
              مفيش حلاقين مفعّلين — ضيفهم من شاشة الموظفين.
            </p>
          ) : (
            <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {staff.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setPicked(u)}
                  className="flex items-center gap-2 rounded-xl border border-border p-3 text-right transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-secondary">
                    <UserRound className="size-4" />
                  </span>
                  <span className="truncate font-semibold text-text-primary">{u.name}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          /* ② الخدمة — دوسة واحدة وخلاص */
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن خدمة..."
                className="pr-9"
                autoFocus
              />
            </div>

            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-secondary">
                {products.length === 0
                  ? "مفيش خدمات — ضيفها من شاشة المنتجات ونوعها «خدمة»."
                  : "مفيش نتيجة للبحث."}
              </p>
            ) : (
              <div className="grid max-h-[45vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(p)}
                    className={cn(
                      "rounded-xl border border-border p-3 text-center transition-colors",
                      "hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                    )}
                  >
                    <span className="block truncate font-semibold text-text-primary">{p.name}</span>
                    <span className="mt-1 block text-sm font-bold text-primary">
                      {formatCurrency(p.price)}
                    </span>
                    {p.duration_minutes > 0 && (
                      <span className="mt-0.5 block text-[11px] text-text-secondary">
                        {p.duration_minutes} دقيقة
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => setPicked(null)}>
              غيّر الحلاق
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
