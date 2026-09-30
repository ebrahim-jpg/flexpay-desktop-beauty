import { z } from "zod";

export const customerSchema = z.object({
  // الاسم اختياري — لو فاضي بيتعبّى تلقائياً برقم الموبايل
  name: z.string().trim().max(100, "الاسم طويل").optional(),
  // الموبايل إجباري — لازم 11 رقم بالظبط (مفتاح العميل)
  phone: z
    .string()
    .trim()
    .regex(/^\d{11}$/, "رقم الموبايل لازم يكون 11 رقم"),
  gender: z.enum(["male", "female"], { message: "اختر الجنس" }),
  nationality: z.string().trim().min(2, "اختر الجنسية").max(50),
  notes: z.string().max(500, "الملاحظات طويلة").optional().nullable(),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;
