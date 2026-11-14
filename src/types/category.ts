// types/category.ts
import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(50),
  description: z.string().optional().nullable(),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;