import { z } from "zod";

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100, "الاسم طويل"),
  unit: z.string().min(1, "اختر الوحدة"),
  current_quantity: z.number().min(0, "الكمية لا تقل عن صفر"),
  alert_threshold: z.number().min(0, "حد التنبيه لا يقل عن صفر"),
  waste_percentage: z
    .number()
    .min(0, "النسبة لا تقل عن صفر")
    .max(100, "النسبة لا تزيد عن 100"),
  cost_per_unit: z.number().min(0, "التكلفة لا تقل عن صفر"),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100, "الاسم طويل"),
  phone: z.string().max(30).optional().nullable(),
  email: z
    .string()
    .email("إيميل غير صحيح")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export const restockSchema = z.object({
  quantity: z.number().min(0.001, "الكمية لازم أكبر من صفر"),
  notes: z.string().max(200, "الملاحظة طويلة").optional().nullable(),
});

export const wasteSchema = z.object({
  quantity: z.number().min(0.001, "الكمية لازم أكبر من صفر"),
  reason: z.string().trim().min(2, "اكتب السبب"),
});
