"use server";

import { z } from "zod";
import { Result } from "@/types/globals";

const contactSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  subject: z.string().min(3, "Subject is required"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

type ContactFormValues = z.infer<typeof contactSchema>;

/**
 * Send a contact message (email or store in DB).
 * For now, we'll log and return success.
 * In production, integrate with Resend, Nodemailer, or your preferred service.
 */
export async function sendContactMessage(
  data: ContactFormValues
): Promise<Result<{ success: true }>> {
  try {
    // Validate
    const validated = contactSchema.parse(data);

    // TODO: Replace with actual email sending logic
    // Example using Resend:
    // await resend.emails.send({ ... });
    // console.log("Contact form submission:", validated);

    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return Result.ok({ success: true });
  } catch (error: any) {
    console.error("Contact form error:", error);
    return Result.fail(error?.message || "Failed to send message");
  }
}