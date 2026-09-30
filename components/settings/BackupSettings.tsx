"use client";

import { useState } from "react";
import { Download, Upload, Loader2, ShieldAlert, Database } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ipc } from "@/hooks/useIPC";

export function BackupSettings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function doExport() {
    setExporting(true);
    try {
      const res = await ipc.invoke("backup:export");
      if (res) toast.success("اتحفظت النسخة الاحتياطية ✓");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function doImport() {
    setImporting(true);
    try {
      const res = await ipc.invoke("backup:import");
      if (res?.staged) {
        toast.success("بيتم الاسترجاع... البرنامج هيقفل ويفتح تاني");
        // البرنامج هيعيد التشغيل تلقائياً — مفيش داعي نوقف الـ loading
      } else {
        setImporting(false);
        setConfirm(false);
      }
    } catch (e) {
      toast.error((e as Error).message);
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* حفظ نسخة */}
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-foreground">حفظ نسخة احتياطية</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          بتحفظ نسخة كاملة من كل بياناتك في ملف واحد (<span dir="ltr">.fpbackup</span>).
          احفظها في فلاشة أو مكان آمن — لو حصل أي مشكلة ترجّعها منها.
        </p>
        <Button onClick={() => void doExport()} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          حفظ نسخة احتياطية
        </Button>
      </Card>

      {/* استرجاع نسخة */}
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-foreground">استرجاع نسخة</h3>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            الاسترجاع هيستبدل كل البيانات الحالية بالبيانات اللي في النسخة، والبرنامج
            هيقفل ويفتح تاني. تأكد إنك عايز ده.
          </span>
        </div>

        {!confirm ? (
          <Button variant="outline" onClick={() => setConfirm(true)}>
            <Upload className="h-4 w-4" />
            استرجاع من نسخة
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="danger" onClick={() => void doImport()} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              اختار الملف واسترجع
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={importing}>
              إلغاء
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
