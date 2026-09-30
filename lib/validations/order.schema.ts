import { z } from "zod";

export const createOrderItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().min(1, "الكمية 1 على الأقل").max(99, "الكمية أكبر من اللازم"),
  modifier_option_ids: z.array(z.string()).optional().default([]),
  notes: z.string().max(200, "الملاحظة طويلة").optional(),
});

export const createOrderSchema = z.object({
  items: z.array(createOrderItemSchema).min(1, "الطلب فاضي"),
  customer_id: z.number().int().positive().optional().nullable(),
  is_guest: z.boolean(),
  order_type: z.enum(["counter", "delivery"]),
  discount_type: z.enum(["none", "percentage", "fixed"]),
  discount_value: z.number().min(0, "قيمة الخصم غير صحيحة"),
  payment_method: z.string().min(1, "اختر طريقة الدفع"),
  amount_paid: z.number().min(0, "المبلغ غير صحيح"),
  notes: z.string().max(300).optional(),
});

export type CreateOrderFormValues = z.infer<typeof createOrderSchema>;
