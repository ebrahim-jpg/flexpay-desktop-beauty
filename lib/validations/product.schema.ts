import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(50, "الاسم طويل"),
  icon: z.string().optional().nullable(),
});

export const productSchema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100, "الاسم طويل"),
  category_id: z
    .number({ message: "اختر الفئة" })
    .int()
    .positive("اختر الفئة"),
  price: z.number({ message: "اكتب السعر" }).min(0.01, "السعر لازم أكبر من صفر"),
  description: z.string().max(300, "الوصف طويل").optional().nullable(),
  barcode: z.string().max(50, "الباركود طويل").optional().nullable(),
  is_active: z.boolean(),
});

export const recipeItemSchema = z.object({
  inventory_item_id: z.number().int().positive(),
  standard_qty: z.number().min(0.001, "الكمية لازم أكبر من صفر"),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;
export type ProductFormValues = z.infer<typeof productSchema>;
