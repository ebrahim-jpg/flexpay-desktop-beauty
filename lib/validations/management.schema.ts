import { z } from "zod";

export const expenseSchema = z.object({
  category: z.enum(["staff", "utilities", "resources", "maintenance", "cleaning", "other"], {
    message: "اختر نوع المصروف",
  }),
  amount: z.number().min(0.01, "المبلغ لازم أكبر من صفر"),
  description: z.string().trim().min(2, "اكتب وصف المصروف").max(200, "الوصف طويل"),
  staff_id: z.number().int().positive().optional().nullable(),
  is_recurring: z.boolean().optional(),
  recurrence_type: z.enum(["monthly", "weekly"]).optional().nullable(),
});

export const restockWithDrawerSchema = z.object({
  inventory_item_id: z.number().int().positive(),
  quantity: z.number().min(0.001, "الكمية لازم أكبر من صفر"),
  cost_per_unit: z.number().min(0, "السعر غير صحيح"),
  drawer_amount: z.number().min(0, "المبلغ غير صحيح"),
  notes: z.string().max(200).optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseSchema>;
