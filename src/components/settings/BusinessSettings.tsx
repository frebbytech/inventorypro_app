"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  useForm,
  type Control,
  type ControllerRenderProps,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";

import { updateSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Settings } from "@/types/globals";
import { useSettings } from "@/providers/SettingsProvider";

interface BusinessSettingsProps {
  settings: Settings | null;
}

/* -------------------------------------------------------------------------- */
/*  Schema & constants (module scope: built once, not on every render)        */
/* -------------------------------------------------------------------------- */

const businessSchema = z.object({
  business_name: z.string().min(2, "Enter your business name."),
  business_address: z.string().min(5, "Enter at least 5 characters."),
  business_phone: z.string().optional(),
  business_email: z
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
  tax_rate: z
    .number()
    .min(0, "Enter a rate from 0 to 100.")
    .max(100, "Enter a rate from 0 to 100.")
    .nullable(),
  logo: z.string().nullable().optional(), // base64 data URL, or null
  old_business_name: z.string().nullable().optional(), // base64 data URL, or null
});

type BusinessFormValues = z.infer<typeof businessSchema>;

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ROW = "grid gap-4 space-y-0 px-5 py-5 sm:px-6 md:grid-cols-[14rem_1fr]";

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

/** A settings row: label and description on the left, the control on the right. */
function SettingField<N extends keyof BusinessFormValues>({
  control,
  name,
  label,
  description,
  render,
}: {
  control: Control<BusinessFormValues>;
  name: N;
  label: string;
  description?: string;
  /** Should return the control wrapped in <FormControl>. */
  render: (field: ControllerRenderProps<BusinessFormValues, N>) => ReactNode;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={ROW}>
          <div className="space-y-1">
            <FormLabel>{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
          <div className="max-w-md space-y-2">
            {render(field)}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function BusinessSettings({ settings }: BusinessSettingsProps) {
  const { updateNewSettings } = useSettings();
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      business_name: settings?.business_name || "",
      business_address: settings?.business_address || "",
      business_phone: settings?.business_phone || "",
      business_email: settings?.business_email || "",
      tax_rate: settings?.tax_rate ?? 0,
      logo: settings?.logo || null,
      old_business_name: window.localStorage.getItem("old_business_name"),
    },
  });

  const { isSubmitting, isDirty } = form.formState;

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be chosen again later
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("That image is too large", {
        description: "Choose one under 5 MB.",
      });
      return;
    }

    setIsProcessingLogo(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 400,
        useWebWorker: true,
        fileType: "image/png",
      });
      const dataUrl = await imageCompression.getDataUrlFromFile(compressed);
      form.setValue("logo", dataUrl, { shouldDirty: true });
    } catch (error) {
      console.error("Logo compression failed:", error);
      toast.error("Couldn't process that image", {
        description: "Try a different file.",
      });
    } finally {
      setIsProcessingLogo(false);
    }
  }

  async function onSubmit(values: BusinessFormValues) {
    try {
      const result = await updateSettings(values);

      if (!result.success) {
        toast.error("Couldn't save changes", {
          description: result.message,
          position: "top-right",
        });
        return;
      }
      updateNewSettings(values);
      // Storage can be full or blocked. The save already succeeded, so don't report an error.

      form.reset(values); // clears the dirty state against the saved values
      toast.success("Changes saved", { position: "top-right" });
    } catch {
      toast.error("Couldn't save changes", {
        description: "Check your connection and try again.",
        position: "top-right",
      });
    }
  }

  return (
    <section
      className="rounded-xl border bg-card"
      aria-labelledby="business-settings-title"
    >
      <header className="border-b px-5 py-4 sm:px-6">
        <h2
          id="business-settings-title"
          className="text-base font-semibold tracking-tight"
        >
          Business
        </h2>
        <p className="text-sm text-muted-foreground">
          These details appear on your invoices and receipts.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
          {/* Logo */}
          <FormField
            control={form.control}
            name="logo"
            render={({ field }) => (
              <div className={ROW}>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Logo</p>
                  <p className="text-sm text-muted-foreground">
                    A square image works best. It's resized to 400 px and
                    compressed.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {/* White, because receipts are printed on white paper. */}
                  <div
                    className={
                      "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white " +
                      (field.value ? "" : "border-dashed bg-muted/40")
                    }
                  >
                    {field.value ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL or unknown remote host
                      <img
                        src={field.value}
                        alt="Business logo"
                        className="size-full object-contain p-1"
                      />
                    ) : (
                      <ImagePlus
                        aria-hidden
                        className="size-6 text-muted-foreground"
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isProcessingLogo}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isProcessingLogo
                        ? "Processing…"
                        : field.value
                          ? "Replace logo"
                          : "Upload logo"}
                    </Button>
                    {field.value && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isProcessingLogo}
                        onClick={() =>
                          form.setValue("logo", null, { shouldDirty: true })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                    aria-label="Upload business logo"
                  />
                </div>
              </div>
            )}
          />

          {/* Name */}
          <SettingField
            control={form.control}
            name="business_name"
            label="Business name"
            render={(field) => (
              <FormControl>
                <Input
                  placeholder="Your business name"
                  autoComplete="organization"
                  {...field}
                />
              </FormControl>
            )}
          />

          {/* Address */}
          <SettingField
            control={form.control}
            name="business_address"
            label="Address"
            render={(field) => (
              <FormControl>
                <Textarea
                  placeholder="123 Main St, City, Country"
                  rows={3}
                  autoComplete="street-address"
                  {...field}
                />
              </FormControl>
            )}
          />

          {/* Contact */}
          <div className={ROW}>
            <div className="space-y-1">
              <p className="text-sm font-medium">Contact</p>
              <p className="text-sm text-muted-foreground">Optional.</p>
            </div>

            <div className="grid max-w-xl gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="business_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="+233 24 000 0000"
                        autoComplete="tel"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="business_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="info@yourbusiness.com"
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Tax */}
          <SettingField
            control={form.control}
            name="tax_rate"
            label="Tax rate"
            description="Default rate applied to all sales."
            render={(field) => (
              <div className="relative w-40">
                <FormControl>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    max={100}
                    placeholder="0"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    className="pr-8 tabular-nums"
                  />
                </FormControl>
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            )}
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-4 px-5 py-4 sm:px-6">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {isDirty ? "You have unsaved changes" : ""}
            </p>
            <Button
              type="submit"
              disabled={isSubmitting || isProcessingLogo || !isDirty}
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
// "use client";

// import { useState, useRef, ChangeEvent } from "react";
// import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import * as z from "zod";
// import { toast } from "sonner";
// import Image from "next/image";
// import { Settings } from "@/types/globals";
// import { updateSettings } from "@/actions/settings";
// import { Button } from "@/components/ui/button";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import {
//   Form,
//   FormControl,
//   FormDescription,
//   FormField,
//   FormItem,
//   FormLabel,
//   FormMessage,
// } from "@/components/ui/form";
// import { Input } from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// import { X, Upload } from "lucide-react";
// import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
// import imageCompression from "browser-image-compression";

// // Extended schema with logo
// const businessSchema = z.object({
//   business_name: z.string().min(2, "Business name is required"),
//   business_address: z.string().min(5, "Address must be at least 5 characters"),
//   business_phone: z.string().optional(),
//   business_email: z.email("Invalid email").optional().or(z.literal("")),
//   tax_rate: z.preprocess(
//     (val) => (val === "" || val === undefined ? null : val),
//     z.coerce
//       .number()
//       .min(0)
//       .max(100, "Tax rate must be between 0 and 100")
//       .nullable(),
//   ),
//   logo: z.string().optional().nullable(), // base64 or null
// });

// type BusinessFormValues = z.infer<typeof businessSchema>;

// interface BusinessSettingsProps {
//   settings: Settings | null;
// }

// export default function BusinessSettings({ settings }: BusinessSettingsProps) {
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [logoPreview, setLogoPreview] = useState<string | null>(
//     settings?.logo || null,
//   );
//   const [logoFile, setLogoFile] = useState<File | null>(null);
//   const fileInputRef = useRef<HTMLInputElement>(null);

//   const extendedBusinessSchema = businessSchema.extend({
//     tax_rate: z
//       .number()
//       .min(0)
//       .max(100, "Tax rate must be between 0 and 100")
//       .nullable(),
//   });

//   const form = useForm<BusinessFormValues>({
//     resolver: zodResolver(extendedBusinessSchema),
//     defaultValues: {
//       business_name: settings?.business_name || "",
//       business_address: settings?.business_address || "",
//       business_phone: settings?.business_phone || "",
//       business_email: settings?.business_email || "",
//       tax_rate: settings?.tax_rate || 0,
//       logo: settings?.logo || null,
//     },
//   });

//   // ── Logo handling ──
//   const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (!file) return;

//     // Validate file type
//     if (!file.type.startsWith("image/")) {
//       toast.error("Please select an image file.");
//       return;
//     }

//     // Validate file size (max 5MB before compression)
//     if (file.size > 5 * 1024 * 1024) {
//       toast.error("Image size must be less than 5MB.");
//       return;
//     }

//     try {
//       // Compress image
//       const options = {
//         maxSizeMB: 0.5, // target 500KB
//         maxWidthOrHeight: 400, // resize to 400px max
//         useWebWorker: true,
//         fileType: "image/png", // or 'image/jpeg'
//       };
//       const compressedFile = await imageCompression(file, options);

//       // Convert to base64
//       const reader = new FileReader();
//       reader.onloadend = () => {
//         const base64 = reader.result as string;
//         setLogoPreview(base64);
//         setLogoFile(compressedFile);
//         // Set the form value
//         form.setValue("logo", base64);
//       };
//       reader.readAsDataURL(compressedFile);

//       toast.success("Logo compressed and ready.");
//     } catch (error) {
//       console.error("Compression error:", error);
//       toast.error("Failed to process image. Please try again.");
//     }
//   };

//   const removeLogo = () => {
//     setLogoPreview(null);
//     setLogoFile(null);
//     form.setValue("logo", null);
//     if (fileInputRef.current) fileInputRef.current.value = "";
//   };

//  // ── Form submission ──
// async function onSubmit(values: BusinessFormValues) {
//   setIsSubmitting(true);
//   try {
//     // The logo is already included in values (base64)
//     const result = await updateSettings(values);
//     if (result.success) {
//       // 📝 Save settings to localStorage upon success
//       localStorage.setItem("business_settings", JSON.stringify(values));

//       toast.success("Business settings updated!", {
//         position: "top-right",
//       });
//     } else {
//       toast.error("Failed to update settings", {
//         description: result.message,
//         position: "top-right",
//       });
//     }
//   } catch (error) {
//     toast.error("An unexpected error occurred", {
//       position: "top-right",
//     });
//   } finally {
//     setIsSubmitting(false);
//   }
// }

//   return (
//     <Card>
//       <CardHeader>
//         <CardTitle>Business Information</CardTitle>
//         <CardDescription>
//           Configure your business details that will appear on invoices and
//           receipts.
//         </CardDescription>
//       </CardHeader>
//       <CardContent>
//         <Form {...form}>
//           <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
//             {/* ── Logo Picker ── */}
//             <FormItem>
//               <FormLabel>Business Logo</FormLabel>
//               <div className="flex items-center gap-4">
//                 {/* Logo Preview */}
//                 <Avatar className="h-20 w-20 border-2 border-muted">
//                   <AvatarImage
//                     src={logoPreview || undefined}
//                     alt="Business logo"
//                   />
//                   <AvatarFallback className="bg-muted text-muted-foreground">
//                     <Upload className="h-8 w-8" />
//                   </AvatarFallback>
//                 </Avatar>

//                 <div className="flex flex-col gap-2">
//                   <div className="flex items-center gap-2">
//                     <Button
//                       type="button"
//                       variant="outline"
//                       size="sm"
//                       onClick={() => fileInputRef.current?.click()}
//                     >
//                       <Upload className="h-4 w-4 mr-2" />
//                       Upload Logo
//                     </Button>
//                     {logoPreview && (
//                       <Button
//                         type="button"
//                         variant="ghost"
//                         size="sm"
//                         onClick={removeLogo}
//                       >
//                         <X className="h-4 w-4" />
//                       </Button>
//                     )}
//                   </div>
//                   <p className="text-sm text-muted-foreground">
//                     Recommended: Square image, max 400x400px, compressed to &lt;
//                     500KB.
//                   </p>
//                 </div>
//               </div>
//               <input
//                 ref={fileInputRef}
//                 type="file"
//                 accept="image/*"
//                 onChange={handleLogoChange}
//                 className="hidden"
//                 aria-label="Upload business logo"
//               />
//             </FormItem>

//             {/* ── Business Name ── */}
//             <FormField
//               control={form.control}
//               name="business_name"
//               render={({ field }) => (
//                 <FormItem>
//                   <FormLabel>Business Name *</FormLabel>
//                   <FormControl>
//                     <Input placeholder="Your business name" {...field} />
//                   </FormControl>
//                   <FormMessage />
//                 </FormItem>
//               )}
//             />

//             {/* ── Address ── */}
//             <FormField
//               control={form.control}
//               name="business_address"
//               render={({ field }) => (
//                 <FormItem>
//                   <FormLabel>Business Address *</FormLabel>
//                   <FormControl>
//                     <Textarea
//                       placeholder="123 Main St, City, Country"
//                       rows={3}
//                       {...field}
//                     />
//                   </FormControl>
//                   <FormMessage />
//                 </FormItem>
//               )}
//             />

//             {/* ── Phone & Email ── */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <FormField
//                 control={form.control}
//                 name="business_phone"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Phone Number</FormLabel>
//                     <FormControl>
//                       <Input placeholder="+233 24 000 0000" {...field} />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               <FormField
//                 control={form.control}
//                 name="business_email"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Email Address</FormLabel>
//                     <FormControl>
//                       <Input
//                         type="email"
//                         placeholder="info@yourbusiness.com"
//                         {...field}
//                       />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />
//             </div>

//             {/* ── Tax Rate ── */}
//             <FormField
//               control={form.control}
//               name="tax_rate"
//               render={({ field }) => (
//                 <FormItem>
//                   <FormLabel>Tax Rate (%)</FormLabel>
//                   <FormControl>
//                     <Input
//                       type="number"
//                       step="0.01"
//                       min="0"
//                       max="100"
//                       placeholder="0"
//                       {...field}
//                       // Fix: Convert null/undefined to empty string for the HTML input element
//                       value={field.value ?? ""}
//                       // Fix: Ensure changing the value updates the React Hook Form state properly
//                       onChange={(e) => {
//                         const val = e.target.value;
//                         field.onChange(val === "" ? null : Number(val));
//                       }}
//                     />
//                   </FormControl>

//                   <FormDescription>
//                     Default tax rate applied to all sales.
//                   </FormDescription>
//                   <FormMessage />
//                 </FormItem>
//               )}
//             />

//             <Button type="submit" disabled={isSubmitting}>
//               {isSubmitting ? "Saving..." : "Save Business Settings"}
//             </Button>
//           </form>
//         </Form>
//         {isSubmitting && <LoadingSpinner loadingText="Saving..." />}
//       </CardContent>
//     </Card>
//   );
// }
