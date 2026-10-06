"use client";

import { useEffect, useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useSettingsStore } from "@/store/settings.store";
import { useIPC } from "@/hooks/useIPC";
import type { PrinterInfo } from "@/shared/settings";

export function ReceiptSettings() {
  const { invoke } = useIPC();
  const receiptHeader = useSettingsStore((s) => s.receiptHeader);
  const receiptFooter = useSettingsStore((s) => s.receiptFooter);
  const printerName = useSettingsStore((s) => s.printerName);
  const kitchenPrinterName = useSettingsStore((s) => s.kitchenPrinterName);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [draft, setDraft] = useState({
    receiptHeader,
    receiptFooter,
    printerName: printerName ?? "",
    kitchenPrinterName: kitchenPrinterName ?? "",
  });
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    invoke("settings:getPrinters")
      .then(setPrinters)
      .catch(() => undefined);
  }, [invoke]);

  async function handleSave() {
    try {
      setSaving(true);
      await updateSettings({
        receiptHeader: draft.receiptHeader,
        receiptFooter: draft.receiptFooter,
        printerName: draft.printerName || null,
      kitchenPrinterName: draft.kitchenPrinterName || null,
      });
      toast.success("تم حفظ إعدادات الفاتورة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPrint() {
    try {
      setTesting(true);
      await invoke("settings:testPrint", {
        printerName: draft.printerName || undefined,
      });
      toast.success("تم إرسال الطباعة التجريبية");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت الطباعة");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الفاتورة والطباعة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>نص أعلى الفاتورة (اختياري)</Label>
          <Input
            value={draft.receiptHeader}
            onChange={(e) =>
              setDraft({ ...draft, receiptHeader: e.target.value })
            }
            placeholder="صالون نور — فرع المعادي"
          />
        </div>

        <div className="space-y-1.5">
          <Label>نص أسفل الفاتورة</Label>
          <Textarea
            value={draft.receiptFooter}
            onChange={(e) =>
              setDraft({ ...draft, receiptFooter: e.target.value })
            }
            placeholder="شكراً لزيارتكم"
          />
        </div>

        <div className="space-y-1.5">
          <Label>الطابعة</Label>
          <Select
            value={draft.printerName}
            onChange={(e) =>
              setDraft({ ...draft, printerName: e.target.value })
            }
          >
            <option value="">الطابعة الافتراضية للنظام</option>
            {printers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.displayName}
                {p.isDefault ? " (افتراضية)" : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
          <Button variant="outline" onClick={handleTestPrint} disabled={testing}>
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            طباعة تجريبية
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
