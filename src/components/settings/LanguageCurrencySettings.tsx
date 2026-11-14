"use client";

import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Settings } from "@/types/globals";

interface LanguageCurrencySettingsProps {
  settings: Settings | null;
}

interface FormValues {
  language: string;
  currency: string;
}

/* -------------------------------------------------------------------------- */
/*  Static config                                                             */
/* -------------------------------------------------------------------------- */

const CURRENCY_OPTIONS = [
  { value: "GHS", label: "Ghana Cedi (GHS)" },
  { value: "USD", label: "US Dollar ($)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "British Pound (£)" },
  { value: "NGN", label: "Nigerian Naira (₦)" },
  { value: "KES", label: "Kenyan Shilling (KSh)" },
  { value: "ZAR", label: "South African Rand (R)" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
];

const SAMPLE_AMOUNT = 1234.5;
const ROW = "grid gap-4 space-y-0 px-5 py-5 sm:px-6 md:grid-cols-[14rem_1fr]";

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function LanguageCurrencySettings({ settings }: LanguageCurrencySettingsProps) {
  const form = useForm<FormValues>({
    defaultValues: {
      language: settings?.language || "en",
      currency: settings?.currency || "GHS",
    },
  });

  const { isSubmitting, isDirty } = form.formState;
  const [language, currency] = useWatch({
    control: form.control,
    name: ["language", "currency"],
  });

  // Shows how an amount reads with the current choices, rather than repeating them back.
  const example = useMemo(() => {
    try {
      return new Intl.NumberFormat(language, { style: "currency", currency }).format(SAMPLE_AMOUNT);
    } catch {
      return `${currency} ${SAMPLE_AMOUNT.toFixed(2)}`;
    }
  }, [language, currency]);

  async function onSubmit(values: FormValues) {
    try {
      const result = await updateSettings(values);

      if (!result.success) {
        toast.error("Couldn't save changes", {
          description: result.message,
          position: "top-right",
        });
        return;
      }

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
    <section className="rounded-xl border bg-card" aria-labelledby="language-currency-title">
      <header className="border-b px-5 py-4 sm:px-6">
        <h2 id="language-currency-title" className="text-base font-semibold tracking-tight">
          Language and currency
        </h2>
        <p className="text-sm text-muted-foreground">
          Set the app language and the currency used for prices and sales.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
          {/* Language */}
          <FormField
            control={form.control}
            name="language"
            render={({ field }) => (
              <FormItem className={ROW}>
                <div className="space-y-1">
                  <FormLabel>Language</FormLabel>
                  <FormDescription>The language the app is shown in.</FormDescription>
                </div>
                <div className="max-w-md space-y-2">
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a language" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          {/* Currency */}
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem className={ROW}>
                <div className="space-y-1">
                  <FormLabel>Currency</FormLabel>
                  <FormDescription>Used for prices, sales and reports.</FormDescription>
                </div>
                <div className="max-w-md space-y-2">
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a currency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Example: <span className="text-foreground tabular-nums">{example}</span>
                  </p>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-4 px-5 py-4 sm:px-6">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {isDirty ? "You have unsaved changes" : ""}
            </p>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}

// "use client";

// import { useState } from "react";
// import { useForm } from "react-hook-form";
// import { toast } from "sonner";
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
// } from "@/components/ui/form";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Globe, DollarSign } from "lucide-react";

// const currencyOptions = [
//   { value: "GHS", label: "Ghana Cedi (GHS)" },
//   { value: "USD", label: "US Dollar ($)" },
//   { value: "EUR", label: "Euro (€)" },
//   { value: "GBP", label: "British Pound (£)" },
//   { value: "NGN", label: "Nigerian Naira (₦)" },
//   { value: "KES", label: "Kenyan Shilling (KSh)" },
//   { value: "ZAR", label: "South African Rand (R)" },
// ];

// const languageOptions = [
//   { value: "en", label: "English" },
//   { value: "fr", label: "French" },
//   { value: "es", label: "Spanish" },
//   { value: "pt", label: "Portuguese" },
//   { value: "ar", label: "Arabic" },
//   { value: "zh", label: "Chinese" },
//   { value: "hi", label: "Hindi" },
// ];

// interface LanguageCurrencySettingsProps {
//   settings: Settings | null;
// }

// export default function LanguageCurrencySettings({
//   settings,
// }: LanguageCurrencySettingsProps) {
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   const form = useForm({
//     defaultValues: {
//       language: settings?.language || "en",
//       currency: settings?.currency || "GHS",
//     },
//   });

//   async function onSubmit(values: any) {
//     setIsSubmitting(true);
//     try {
//       const result = await updateSettings(values);
//       if (result.success) {
//         toast.success("Language and currency settings updated!", {
//           position: "top-right",
//         });
//       } else {
//         toast.error("Failed to update settings", {
//           description: result.message,
//           position: "top-right",
//         });
//       }
//     } catch (error) {
//       toast.error("An unexpected error occurred", {
//         position: "top-right",
//       });
//     } finally {
//       setIsSubmitting(false);
//     }
//   }

//   return (
//     <Card>
//       <CardHeader>
//         <CardTitle className="flex items-center gap-2">
//           <Globe className="h-5 w-5" />
//           Language & Currency
//         </CardTitle>
//         <CardDescription>
//           Configure your preferred language and currency settings.
//         </CardDescription>
//       </CardHeader>
//       <CardContent>
//         <Form {...form}>
//           <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
//             {/* Language Selector */}
//             <FormField
//               control={form.control}
//               name="language"
//               render={({ field }) => (
//                 <FormItem>
//                   <FormLabel>Language</FormLabel>
//                   <Select
//                     onValueChange={field.onChange}
//                     defaultValue={field.value}
//                     value={field.value}
//                   >
//                     <FormControl>
//                       <SelectTrigger className="w-full md:w-64">
//                         <SelectValue placeholder="Select language" />
//                       </SelectTrigger>
//                     </FormControl>
//                     <SelectContent>
//                       {languageOptions.map((lang) => (
//                         <SelectItem key={lang.value} value={lang.value}>
//                           {lang.label}
//                         </SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                   <FormDescription>
//                     Choose your preferred application language.
//                   </FormDescription>
//                 </FormItem>
//               )}
//             />

//             {/* Currency Selector */}
//             <FormField
//               control={form.control}
//               name="currency"
//               render={({ field }) => (
//                 <FormItem>
//                   <FormLabel className="flex items-center gap-2">
//                     <DollarSign className="h-4 w-4" />
//                     Currency
//                   </FormLabel>
//                   <Select
//                     onValueChange={field.onChange}
//                     defaultValue={field.value}
//                     value={field.value}
//                   >
//                     <FormControl>
//                       <SelectTrigger className="w-full md:w-64">
//                         <SelectValue placeholder="Select currency" />
//                       </SelectTrigger>
//                     </FormControl>
//                     <SelectContent>
//                       {currencyOptions.map((curr) => (
//                         <SelectItem key={curr.value} value={curr.value}>
//                           {curr.label}
//                         </SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                   <FormDescription>
//                     Currency used for all financial calculations.
//                   </FormDescription>
//                 </FormItem>
//               )}
//             />

//             {/* Preview */}
//             <div className="p-4 bg-muted/30 rounded-lg border">
//               <p className="text-sm font-medium text-muted-foreground mb-2">
//                 Preview
//               </p>
//               <div className="flex gap-4 text-sm">
//                 <div>
//                   <span className="font-medium">Currency:</span>{" "}
//                   <span className="text-foreground">
//                     {form.watch("currency") || "GHS"}
//                   </span>
//                 </div>
//                 <div>
//                   <span className="font-medium">Language:</span>{" "}
//                   <span className="text-foreground">
//                     {languageOptions.find(
//                       (l) => l.value === form.watch("language")
//                     )?.label || "English"}
//                   </span>
//                 </div>
//               </div>
//             </div>

//             <Button type="submit" disabled={isSubmitting}>
//               {isSubmitting ? "Saving..." : "Save Language & Currency Settings"}
//             </Button>
//           </form>
//         </Form>
//       </CardContent>
//     </Card>
//   );
// }