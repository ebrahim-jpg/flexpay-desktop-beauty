"use client";

import { useRef, useState } from "react";
import { Store, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settings.store";
import { useIPC } from "@/hooks/useIPC";

export function ShopInfoForm() {
  const { invoke } = useIPC();
  const shopName = useSettingsStore((s) => s.shopName);
  const country = useSettingsStore((s) => s.country);
  const currency = useSettingsStore((s) => s.currency);
  const currencySymbol = useSettingsStore((s) => s.currencySymbol);
  const shopLogo = useSettingsStore((s) => s.shopLogo);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const applySettings = useSettingsStore((s) => s.applySettings);

  const [draft, setDraft] = useState({
    shopName,
    country,
    currency,
    currencySymbol,
  });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!draft.shopName.trim()) {
      toast.error("اكتب اسم المحل");
      return;
    }
    try {
      setSaving(true);
      await updateSettings({
        shopName: draft.shopName.trim(),
        country: draft.country.trim(),
        currency: draft.currency.trim(),
        currencySymbol: draft.currencySymbol.trim(),
      });
      toast.success("تم حفظ بيانات المحل");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر ملف صورة");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dto = await invoke("settings:saveLogo", {
          dataUrl: reader.result as string,
        });
        applySettings(dto);
        toast.success("تم حفظ الشعار");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "تعذّر حفظ الشعار");
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleRemoveLogo() {
    try {
      const dto = await invoke("settings:removeLogo");
      applySettings(dto);
      toast.success("تم حذف الشعار");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحذف");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>بيانات المحل</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* الشعار */}
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-secondary">
            {shopLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shopLogo} alt="شعار المحل" className="h-full w-full object-cover" />
            ) : (
              <Store className="h-8 w-8 text-text-secondary" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogo}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              رفع شعار
            </Button>
            {shopLogo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveLogo}
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>اسم المحل</Label>
            <Input
              value={draft.shopName}
              onChange={(e) => setDraft({ ...draft, shopName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>البلد</Label>
            <Input
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>العملة</Label>
            <Input
              value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
              placeholder="جنيه مصري"
            />
          </div>
          <div className="space-y-1.5">
            <Label>رمز العملة</Label>
            <Input
              value={draft.currencySymbol}
              onChange={(e) =>
                setDraft({ ...draft, currencySymbol: e.target.value })
              }
              placeholder="ج.م"
            />
          </div>
        </div>

        <div className="flex justify-start">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
