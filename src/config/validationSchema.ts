import {z} from "zod";

export const productValidationSchema = z.object({
  name: z.string().min(1, "Metal name is required"),
  category: z.string().min(1, "Category is required"),
  cost_price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid cost price format"),
  unit_price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid unit price format"),
  stock: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid stock quantity format"),
});
