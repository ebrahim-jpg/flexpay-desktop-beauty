"use client";

import { useState } from "react";
import {
  Copy,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wifi,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settings.store";
import { useSyncStore } from "@/store/sync.store";
import { useIPC } from "@/hooks/useIPC";
import { formatDateTime } from "@/lib/formatters";

export function SyncSettings() {
  const { invoke } = useIPC();
  const shopCode = useSettingsStore((s) => s.shopCode);
  const secretKeyTail = useSettingsStore((s) => s.secretKeyTail);
  const syncServerUrl = useSettingsStore((s) => s.syncServerUrl);
  const syncEnabled = useSettingsStore((s) => s.syncEnabled);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  const pendingCount = useSyncStore((s) => s.pendingCount);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);

  const [serverUrl, setServerUrl] = useState(syncServerUrl);
  const [savingUrl, setSavingUrl] = useState(false);
  const [togglingSync, setTogglingSync] = useState(false);
  const [reactivateCode, setReactivateCode] = useState("");
  const [reactivating, setReactivating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  async function copyCode() {
    if (!shopCode) return;
    try {
      await navigator.clipboard.writeText(shopCode);
      toast.success("تم نسخ كود المحل");
    } catch {
      toast.error("تعذّر النسخ");
    }
  }

  async function handleSaveUrl() {
    try {
      setSavingUrl(true);
      await updateSettings({ syncServerUrl: serverUrl.trim() });
      toast.success("تم حفظ رابط السيرفر");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSavingUrl(false);
    }
  }

  async function handleToggleSync() {
    try {
      setTogglingSync(true);
      await updateSettings({ syncEnabled: !syncEnabled });
      toast.success(syncEnabled ? "المزامنة اتوقفت" : "المزامنة اشتغلت");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setTogglingSync(false);
    }
  }

  async function handleReactivate() {
    const code = reactivateCode.trim();
    if (!code) {
      toast.error("اكتب كود التفعيل");
      return;
    }
    try {
      setReactivating(true);
      const res = await invoke("activation:reactivate", { code });
      await loadSettings();
      setReactivateCode("");
      toast.success(`تمت إعادة تفعيل «${res.shopName}» ✓`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشلت إعادة التفعيل");
    } finally {
      setReactivating(false);
    }
  }

  async function handleTest() {
    try {
      setTesting(true);
      setTestResult(null);
      const result = await invoke("settings:testSync");
      setTestResult({ ok: result.reachable, message: result.message });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : "تعذّر الاتصال",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>المزامنة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-secondary/50 p-3 text-xs text-text-secondary">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            هوية المحل بتتحدّد من كود التفعيل بس ومش قابلة للتعديل اليدوي — عشان
            مفيش خطأ يقطع الاتصال بلوحتك. لو محتاج تغيّرها، اطلب كود تفعيل جديد
            من الإدارة واستخدمه في «إعادة التفعيل» تحت.
          </span>
        </p>

        {/* هوية المحل — عرض فقط */}
        <div className="space-y-1.5">
          <Label>كود المحل</Label>
          <div className="flex items-center gap-2">
            <div className="flex h-10 flex-1 items-center rounded-md border border-border bg-surface-secondary/40 px-3 font-mono tracking-widest text-text-primary">
              {shopCode ?? "—"}
            </div>
            {shopCode && (
              <Button variant="outline" size="icon" onClick={copyCode} title="نسخ">
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>المفتاح السري</Label>
          <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-surface-secondary/40 px-3 text-sm">
            {secretKeyTail ? (
              <>
                <ShieldCheck className="h-4 w-4 text-success" />
                <span className="text-text-primary">مفعّل</span>
                <span className="font-mono text-text-secondary" dir="ltr">
                  ···· {secretKeyTail}
                </span>
              </>
            ) : (
              <span className="text-text-secondary">غير مفعّل</span>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            المفتاح متخزّن على الجهاز ومابيتعرضش. آخر ٤ خانات للتعرّف عليه وقت
            الدعم.
          </p>
        </div>

        {/* إعادة التفعيل */}
        <div className="space-y-2 border-t border-border pt-4">
          <Label className="flex items-center gap-1.5">
            <KeyRound className="h-4 w-4 text-primary" />
            إعادة التفعيل
          </Label>
          <p className="text-xs text-text-secondary">
            لو غيّرت الجهاز أو حصلت مشكلة في الاتصال بلوحتك، اطلب كود تفعيل جديد
            واكتبه هنا. بياناتك مابتتمسحش، والهوية القديمة بتفضل شغّالة لحد ما
            الكود الجديد ينجح.
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={reactivateCode}
              onChange={(e) => setReactivateCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              dir="ltr"
              className="text-center font-mono tracking-widest"
              onKeyDown={(e) => e.key === "Enter" && void handleReactivate()}
            />
            <Button onClick={() => void handleReactivate()} disabled={reactivating}>
              {reactivating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              إعادة تفعيل
            </Button>
          </div>
        </div>

        {/* تشغيل/إيقاف المزامنة */}
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-text-primary">إرسال البيانات للوحة</p>
            <p className="text-xs text-text-secondary">
              {syncEnabled
                ? "شغّال — بيانات المحل بتوصل لوحتك على الويب"
                : "متوقّف — البيانات بتتجمّع على الجهاز وهتترفع كلها أول ما تشغّله"}
            </p>
          </div>
          <Button
            variant={syncEnabled ? "outline" : "primary"}
            onClick={() => void handleToggleSync()}
            disabled={togglingSync}
          >
            {togglingSync && <Loader2 className="h-4 w-4 animate-spin" />}
            {syncEnabled ? "إيقاف" : "تشغيل"}
          </Button>
        </div>

        {/* رابط السيرفر */}
        <div className="space-y-1.5 border-t border-border pt-4">
          <Label>رابط السيرفر</Label>
          <div className="flex items-center gap-2">
            <Input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              dir="ltr"
              className="text-left"
            />
            <Button variant="outline" onClick={handleSaveUrl} disabled={savingUrl}>
              حفظ
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            متغيّرهوش إلا لو الإدارة طلبت منك. بيانات محلك بتتبعت للرابط ده —
            رابط غلط معناه إرسال بياناتك لجهة تانية. لو عايز توقّف الإرسال
            استخدم زرار الإيقاف فوق.
          </p>
        </div>

        {/* اختبار الاتصال */}
        <div className="space-y-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4" />
            )}
            اختبار الاتصال
          </Button>

          {testResult && (
            <div
              className={
                "flex items-center gap-2 text-sm " +
                (testResult.ok ? "text-success" : "text-danger")
              }
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {testResult.message}
            </div>
          )}
        </div>

        {/* حالة المزامنة */}
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
          <div>
            <p className="text-text-secondary">آخر مزامنة ناجحة</p>
            <p className="font-medium text-text-primary">
              {lastSyncAt ? formatDateTime(lastSyncAt) : "لم تتم بعد"}
            </p>
          </div>
          <div>
            <p className="text-text-secondary">في انتظار المزامنة</p>
            <p className="font-medium text-text-primary">{pendingCount} سجل</p>
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-text-secondary">
          <RefreshCw className="h-3.5 w-3.5" />
          المزامنة بتشتغل تلقائي في الخلفية. لو الاتصال قطع، البيانات بتتجمّع
          وبتترفع لوحدها أول ما يرجع.
        </p>
      </CardContent>
    </Card>
  );
}
