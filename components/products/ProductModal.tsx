"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, Upload, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ModifierBuilder } from "./ModifierBuilder";
import { RecipeBuilder } from "./RecipeBuilder";
import { SizesBuilder } from "./SizesBuilder";
import { useIPC } from "@/hooks/useIPC";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { productSchema } from "@/lib/validations/product.schema";
import { parseBarcode } from "@/lib/barcode";
import { cn } from "@/lib/utils";
import type {
  CategoryDTO,
  ProductDTO,
  ModifierGroup,
  CreateProductInput,
  UpdateProductInput,
} from "@/shared/products";

interface ProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ProductDTO | null;
  categories: CategoryDTO[];
  defaultCategoryId: number | null;
  onSaved: () => void;
}

export function ProductModal({
  open,
  onOpenChange,
  editing,
  categories,
  defaultCategoryId,
  onSaved,
}: ProductModalProps) {
  const { invoke } = useIPC();
  const isEdit = !!editing;

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [barcode, setBarcode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isAvailable, setIsAvailable] = useState(true);
  // ⚠️ نسخة البلايستيشن: المنتجات بالقطعة بس — مفيش اختيار «بالوزن» (والـmain بيجبر piece)
  const [modifiers, setModifiers] = useState<ModifierGroup[]>([]);
  // المنتج بأحجام: السعر بيتحسب من أرخص حجم فالخانة بتتقفل
  const [hasSizes, setHasSizes] = useState(false);
  // خدمة (حلاقة/صبغة) ولا منتج على رف — ومدتها بالدقايق
  const [isService, setIsService] = useState(false);
  const [duration, setDuration] = useState("");

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImageFlag, setRemoveImageFlag] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setCategoryId(editing?.category_id ?? defaultCategoryId ?? null);
    setPrice(editing ? String(editing.price) : "");
    setDescription(editing?.description ?? "");
    setBarcode(editing?.barcode ?? "");
    setIsActive(editing?.is_active ?? true);
    setIsAvailable(editing?.is_available ?? true);
    setModifiers(editing?.modifiers ?? []);
    setHasSizes(editing?.has_sizes ?? false);
    setIsService(editing?.is_service ?? false);
    setDuration(editing?.duration_minutes ? String(editing.duration_minutes) : "");
    setImageDataUrl(null);
    setImagePreview(editing?.image ?? null);
    setRemoveImageFlag(false);
    setScanning(false);
  }, [open, editing, defaultCategoryId]);

  // استقبال مدخل السكانر عند تفعيل وضع المسح
  useBarcodeScanner({
    enabled: open && scanning,
    onScan: (code) => {
      const parsed = parseBarcode(code);
      setBarcode(parsed.lookupCode);
      setScanning(false);
      toast.success("تم مسح الباركود");
    },
  });

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر ملف صورة");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setImagePreview(reader.result as string);
      setRemoveImageFlag(false);
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImageDataUrl(null);
    setImagePreview(null);
    setRemoveImageFlag(true);
  }

  async function handleSave() {
    const parsed = productSchema.safeParse({
      name,
      category_id: categoryId ?? 0,
      price: Number(price),
      description: description || null,
      barcode: barcode || null,
      is_active: isActive,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }

    try {
      setSaving(true);
      if (isEdit && editing) {
        const payload: UpdateProductInput = {
          id: editing.id,
          name: name.trim(),
          category_id: categoryId,
          price: Number(price),
          description: description.trim() || null,
          barcode: barcode.trim() || null,
          is_active: isActive,
          is_available: isAvailable,
          sale_type: "piece",
          is_service: isService,
          duration_minutes: Number(duration) || 0,
          modifiers,
        };
        if (imageDataUrl) payload.imageDataUrl = imageDataUrl;
        if (removeImageFlag) payload.removeImage = true;
        await invoke("products:update", payload);
        toast.success("تم حفظ المنتج");
      } else {
        const payload: CreateProductInput = {
          name: name.trim(),
          category_id: categoryId,
          price: Number(price),
          description: description.trim() || null,
          barcode: barcode.trim() || null,
          is_active: isActive,
          is_available: isAvailable,
          sale_type: "piece",
          is_service: isService,
          duration_minutes: Number(duration) || 0,
          modifiers,
          imageDataUrl: imageDataUrl ?? undefined,
        };
        await invoke("products:create", payload);
        toast.success("تم إضافة المنتج");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "حصل خطأ، حاول تاني");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل منتج" : "إضافة منتج"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic">
          <TabsList>
            <TabsTrigger value="basic">المعلومات الأساسية</TabsTrigger>
            <TabsTrigger value="sizes">الأحجام</TabsTrigger>
            <TabsTrigger value="modifiers">الخيارات والإضافات</TabsTrigger>
            <TabsTrigger value="recipe">الوصفة</TabsTrigger>
          </TabsList>

          {/* Tab 1 */}
          <TabsContent value="basic" className="space-y-4">
            {/* الصورة */}
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-secondary">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="صورة المنتج" className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-8 w-8 text-text-secondary" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  رفع صورة
                </Button>
                {imagePreview && (
                  <Button variant="ghost" size="sm" onClick={clearImage} className="text-danger hover:bg-danger/10">
                    <Trash2 className="h-4 w-4" />
                    حذف الصورة
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>الاسم</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>الفئة</Label>
                <Select
                  value={categoryId ?? ""}
                  onChange={(e) =>
                    setCategoryId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">اختر الفئة</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>السعر</Label>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  dir="ltr"
                  className="text-right"
                  disabled={hasSizes}
                />
                {hasSizes && (
                  <p className="text-xs text-text-secondary">
                    المنتج ده بأحجام — السعر بيتحسب لوحده من أرخص حجم («يبدأ من»). عدّله من تاب
                    «الأحجام».
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>الباركود</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    dir="ltr"
                    className="text-right"
                    placeholder="اختياري"
                  />
                  <Button
                    type="button"
                    variant={scanning ? "accent" : "outline"}
                    size="icon"
                    onClick={() => setScanning((v) => !v)}
                    title="مسح بالسكانر"
                  >
                    <ScanLine className="h-4 w-4" />
                  </Button>
                </div>
                {scanning && (
                  <p className="text-xs text-accent-foreground">
                    وجّه السكانر على الباركود الآن...
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>الوصف (اختياري)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {/* ملاحظة: "شيل من الكاشير" (is_active) بقى إجراء مالك فقط من كارت المنتج،
                مش توجل هنا — عشان مايتخطاش قيد المالك. */}
            {/* ⚙️ خدمة ولا منتج — ومدتها.
                ⚠️ الخدمة **برضه بتستهلك مواد** (الصبغة بتخصم صبغة وفويل)،
                فتاب «الوصفة» بيفضل شغّال زي أي منتج. الفرق في الجرد والتقارير. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>النوع</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={isService ? "outline" : "primary"}
                    className="flex-1"
                    onClick={() => setIsService(false)}
                  >
                    منتج
                  </Button>
                  <Button
                    type="button"
                    variant={isService ? "primary" : "outline"}
                    className="flex-1"
                    onClick={() => setIsService(true)}
                  >
                    خدمة
                  </Button>
                </div>
              </div>
              {isService && (
                <div className="space-y-1.5">
                  <Label>المدة (دقايق)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={5}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    dir="ltr"
                    className="text-right"
                    placeholder="٣٠"
                  />
                  <p className="text-xs text-text-secondary">
                    بتتستخدم في المواعيد ومقارنة المدة الفعلية بالمتوقّعة.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2">
                <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
                <span className="text-sm text-text-primary">متاح للبيع</span>
              </label>
            </div>
          </TabsContent>

          <TabsContent value="sizes">
            <SizesBuilder
              productId={editing?.id ?? null}
              onChanged={(sizes) => {
                setHasSizes(sizes.length > 0);
                const cheapest = sizes
                  .filter((x) => x.is_active)
                  .map((x) => x.price)
                  .sort((a, b) => a - b)[0];
                if (cheapest != null) setPrice(String(cheapest));
                onSaved();
              }}
            />
          </TabsContent>

          {/* Tab 2 */}
          <TabsContent value="modifiers">
            <ModifierBuilder value={modifiers} onChange={setModifiers} />
          </TabsContent>

          {/* Tab 3 */}
          <TabsContent value="recipe">
            <RecipeBuilder productId={editing?.id ?? null} price={Number(price) || 0} />
          </TabsContent>
        </Tabs>

        <DialogFooter className={cn("border-t border-border pt-4")}>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
