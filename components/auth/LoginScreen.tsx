"use client";

import { useEffect, useState } from "react";
import { Store, KeyRound, Hash } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings.store";
import { PasswordForm } from "./PasswordForm";
import { CashierSelector } from "./CashierSelector";

type Mode = "password" | "pin";

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("password");
  const shopName = useSettingsStore((s) => s.shopName);
  const shopLogo = useSettingsStore((s) => s.shopLogo);
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  // نحمّل الإعدادات قبل الدخول عشان نعرض الشعار واسم المحل (settings:get مش محتاج تسجيل)
  useEffect(() => {
    if (!isLoaded) void loadSettings().catch(() => undefined);
  }, [isLoaded, loadSettings]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* توهّج خلفي خفيف للعمق */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        {/* الشعار */}
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          {shopLogo ? (
            <div className="h-20 w-20 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shopLogo}
                alt={shopName}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-primary text-white shadow-gold">
              <Store className="h-8 w-8" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
              {shopLogo ? shopName : "FlexPay"}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              سجّل دخولك عشان تبدأ
            </p>
          </div>
        </div>

        <Card className="p-6 shadow-lg">
          {/* تبديل وضع الدخول */}
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-surface-secondary p-1">
            <TabButton
              active={mode === "password"}
              onClick={() => setMode("password")}
              icon={<KeyRound className="h-4 w-4" />}
              label="مالك / مدير"
            />
            <TabButton
              active={mode === "pin"}
              onClick={() => setMode("pin")}
              icon={<Hash className="h-4 w-4" />}
              label="موظف صالة"
            />
          </div>

          {mode === "password" ? <PasswordForm /> : <CashierSelector />}
        </Card>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
        active
          ? "bg-surface text-text-primary shadow-sm"
          : "text-text-secondary hover:text-text-primary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
