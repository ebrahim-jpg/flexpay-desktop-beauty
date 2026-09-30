"use client";

import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Settings2, Store } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ipc } from "@/hooks/useIPC";

export function ActivationScreen({
  defaultServerUrl,
  onActivated,
}: {
  defaultServerUrl: string;
  onActivated: () => void;
}) {
  const [code, setCode] = useState("");
  const [serverUrl, setServerUrl] = useState(defaultServerUrl || "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  async function activate() {
    if (!code.trim()) {
      toast.error("اكتب كود التفعيل");
      return;
    }
    setBusy(true);
    try {
      const res = await ipc.invoke("activation:activate", {
        code: code.trim(),
        serverUrl: serverUrl.trim(),
      });
      toast.success(`تم تفعيل «${res.shopName}» ✓`);
      onActivated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-primary text-white shadow-gold">
            <Store className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">تفعيل البرنامج</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              أدخل كود التفعيل اللي استلمته عشان تبدأ
            </p>
          </div>
        </div>

        <Card className="space-y-5 p-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRound className="h-4 w-4 text-primary" />
              كود التفعيل
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              dir="ltr"
              className="text-center font-mono text-lg tracking-widest"
              onKeyDown={(e) => e.key === "Enter" && void activate()}
              autoFocus
            />
          </div>

          <Button onClick={() => void activate()} disabled={busy} className="w-full">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            تفعيل
          </Button>

          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
              إعدادات متقدّمة
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-2">
                <label className="text-xs text-muted-foreground">رابط السيرفر</label>
                <Input
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://..."
                  dir="ltr"
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>
        </Card>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          مفيش كود؟ تواصل مع الإدارة عشان تستلم كود التفعيل بتاع محلك.
        </p>
      </div>
    </div>
  );
}
