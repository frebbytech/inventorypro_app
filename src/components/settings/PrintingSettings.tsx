"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { RefreshCw } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";
import type { Settings } from "@/types/globals";
import type { PrinterInfo } from "@/types/printer";
import { usePlatform } from "@/hooks/use-platform";

interface PrintingSettingsProps {
  settings: Settings | null;
}

/* -------------------------------------------------------------------------- */
/*  Schema & constants                                                        */
/* -------------------------------------------------------------------------- */

const printingSchema = z.object({
  print_after_sale: z.boolean(),
  paper_size: z.string().min(1, "Choose a paper size."),
  printer_device_name: z.string().optional(),
});

type PrintingFormValues = z.infer<typeof printingSchema>;

const PAPER_SIZES = [
  { value: "a4", label: "A4 (210 × 297 mm)" },
  { value: "a5", label: "A5 (148 × 210 mm)" },
  { value: "a6", label: "A6 (105 × 148 mm)" },
  { value: "thermal_80mm", label: "Thermal 80mm (80 × 200 mm)" },
  { value: "thermal_58mm", label: "Thermal 58mm (58 × 200 mm)" },
];

const ROW = "grid gap-4 space-y-0 px-5 py-5 sm:px-6 md:grid-cols-[14rem_1fr]";

const toFormValues = (settings: Settings | null): PrintingFormValues => ({
  print_after_sale: Boolean(settings?.print_after_sale),
  paper_size: settings?.paper_size || "thermal_80mm",
  printer_device_name: settings?.printer_device_name || "",
});

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function PrintingSettings({ settings }: PrintingSettingsProps) {
  const { updateNewSettings } = useSettings();
  const { isDesktop } = usePlatform();
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const form = useForm<PrintingFormValues>({
    resolver: zodResolver(printingSchema),
    defaultValues: toFormValues(settings),
  });

  const { isSubmitting, isDirty } = form.formState;

  // Pick up settings that arrive or change after the first render.
  useEffect(() => {
    if (settings) form.reset(toFormValues(settings));
  }, [settings, form]);

  const loadPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    setLoadError(null);
    try {
      // The printer API only exists inside the Electron shell.
      const printerApi = window.api?.printer;
      // console.log(printerApi)
      if (!printerApi) {
        setLoadError("Printers can only be listed in the desktop app.");
        return;
      }
      setPrinters(await printerApi.getPrinters());
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Couldn't load printers.",
      );
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  // A saved printer that's no longer connected is kept visible (and flagged)
  // instead of leaving the select blank and silently saving over it.
  const savedPrinter = settings?.printer_device_name;
  const savedPrinterMissing =
    !!savedPrinter &&
    !isLoadingPrinters &&
    !loadError &&
    printers.length > 0 &&
    !printers.some((p) => p.name === savedPrinter);

  const printerOptions = useMemo(() => {
    const options = printers.map((p) => ({
      value: p.name,
      label: p.displayName,
    }));
    if (savedPrinterMissing && savedPrinter) {
      options.unshift({
        value: savedPrinter,
        label: `${savedPrinter} (not connected)`,
      });
    }
    return options;
  }, [printers, savedPrinter, savedPrinterMissing]);

  async function onSubmit(values: PrintingFormValues) {
    try {
      const result = await updateSettings({
        business_name: settings?.business_name,
        ...values,
      });
      if (!result.success) {
        toast.error("Couldn't save changes", {
          description: result.message,
          position: "top-right",
        });
        return;
      }

      updateNewSettings(values); // only share with the app once it's actually saved
      form.reset(values); // clears the dirty state against the saved values
      toast.success("Changes saved", { position: "top-right" });
    } catch {
      toast.error("Couldn't save changes", {
        description: "Try again in a moment.",
        position: "top-right",
      });
    }
  }

  return (
    <section
      className="rounded-xl border bg-card"
      aria-labelledby="printing-settings-title"
    >
      <header className="border-b px-5 py-4 sm:px-6">
        <h2
          id="printing-settings-title"
          className="text-base font-semibold tracking-tight"
        >
          Printing
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose where receipts and invoices print after a sale.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
          {/* Printer */}
          <FormField
            control={form.control}
            name="printer_device_name"
            render={({ field }) => (
              <FormItem className={ROW}>
                <div className="space-y-1">
                  <FormLabel>Printer</FormLabel>
                  <FormDescription>
                    Receipts are sent here. Refresh after connecting a printer.
                  </FormDescription>
                </div>

                <div className="max-w-md space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!!loadError || printerOptions.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full min-w-0 flex-1">
                          <SelectValue
                            placeholder={
                              isLoadingPrinters
                                ? "Looking for printers…"
                                : printerOptions.length === 0
                                  ? "No printers found"
                                  : "Choose a printer"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {printerOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {isDesktop && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={loadPrinters}
                        disabled={isLoadingPrinters}
                        className="shrink-0 gap-1.5"
                      >
                        <RefreshCw
                          aria-hidden
                          className={cn(
                            "size-3.5",
                            isLoadingPrinters && "animate-spin",
                          )}
                        />
                        Refresh
                      </Button>
                    )}
                  </div>

                  {loadError && (
                    <p role="alert" className="text-sm text-destructive">
                      {loadError}
                    </p>
                  )}
                  {savedPrinterMissing && (
                    <p
                      role="status"
                      className="text-sm text-amber-600 dark:text-amber-400"
                    >
                      The saved printer, {savedPrinter}, isn't connected right
                      now.
                    </p>
                  )}
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          {/* Paper size */}
          <FormField
            control={form.control}
            name="paper_size"
            render={({ field }) => (
              <FormItem className={ROW}>
                <div className="space-y-1">
                  <FormLabel>Paper size</FormLabel>
                  <FormDescription>
                    Your printer must support this size. Thermal printers
                    usually take 80mm or 58mm rolls.
                  </FormDescription>
                </div>

                <div className="max-w-md space-y-2">
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a paper size" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAPER_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          {/* Auto-print */}
          <FormField
            control={form.control}
            name="print_after_sale"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-6 space-y-0 px-5 py-4 sm:px-6">
                <div className="space-y-1">
                  <FormLabel className="text-sm font-medium">
                    Print after each sale
                  </FormLabel>
                  <FormDescription>
                    Send the receipt to the printer as soon as a sale is
                    completed.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
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

// import { useEffect, useState, useCallback } from "react";
// import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import * as z from "zod";
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
//   FormMessage,
// } from "@/components/ui/form";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Switch } from "@/components/ui/switch";
// import {
//   Printer,
//   FileText,
//   RefreshCw,
//   Loader2,
//   AlertCircle,
// } from "lucide-react";
// import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";
// import { PrinterInfo } from "@/types/printer";
// import { useSettings } from "@/providers/SettingsProvider";

// const printingSchema = z.object({
//   print_after_sale: z.boolean(),
//   paper_size: z.string().min(1, "Please select a paper size"),
//   printer_device_name: z.string().min(0, "Please select a printer").optional(),
// });

// type PrintingFormValues = z.infer<typeof printingSchema>;

// const PAPER_SIZES = [
//   { value: "a4", label: "A4 (210 × 297 mm)" },
//   { value: "a5", label: "A5 (148 × 210 mm)" },
//   { value: "a6", label: "A6 (105 × 148 mm)" },
//   { value: "thermal_80mm", label: "Thermal 80mm (80 × 200 mm)" },
//   { value: "thermal_58mm", label: "Thermal 58mm (58 × 200 mm)" },
// ];

// interface PrintingSettingsProps {
//   settings: Settings | null;
// }

// export default function PrintingSettings({ settings }: PrintingSettingsProps) {
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [printers, setPrinters] = useState<PrinterInfo[]>([]);
//   const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
//   const [loadError, setLoadError] = useState<string | null>(null);
//   const { updateNewSettings } = useSettings();

//   const form = useForm<PrintingFormValues>({
//     resolver: zodResolver(printingSchema),
//     defaultValues: {
//       print_after_sale: Boolean(settings?.print_after_sale) ?? false,
//       paper_size: settings?.paper_size || "thermal_80mm",
//       printer_device_name: settings?.printer_device_name || "",
//     },
//   });

//   const loadPrinters = useCallback(async () => {
//     setIsLoadingPrinters(true);
//     setLoadError(null);
//     try {
//       // Guard in case this component ever renders outside the Electron shell

//       if (typeof window !== "undefined" && !window.api?.printer) {
//         setLoadError("Printer API unavailable in this environment");
//         return;
//       }
//       const list = await window.api.printer.getPrinters();
//       setPrinters(list);

//       // If no printer saved yet, default to the OS default printer
//       // const currentValue = form.getValues("printer_device_name");
//       // if (!currentValue) {
//       //   const defaultPrinter = list.find((p) => p.isDefault);
//       //   if (defaultPrinter) {
//       //     form.setValue("printer_device_name", defaultPrinter.name, {
//       //       shouldDirty: true,
//       //     });
//       //   }
//       // }
//     } catch (err) {
//       setLoadError(
//         err instanceof Error ? err.message : "Failed to load printers",
//       );
//     } finally {
//       setIsLoadingPrinters(false);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   useEffect(() => {
//     if (settings) {
//       form.reset({
//         print_after_sale: Boolean(settings?.print_after_sale) ?? false,
//         paper_size: settings?.paper_size || "thermal_80mm",
//         printer_device_name: settings?.printer_device_name || "",
//       });
//     }
//   }, [open, settings, form]);

//   useEffect(() => {
//     loadPrinters();
//   }, [loadPrinters]);

//   const selectedPrinterName = form.watch("printer_device_name", "");
//   const selectedPrinterInfo = printers.find(
//     (p) => p.name === selectedPrinterName,
//   );

//   // If the saved printer_device_name from the DB no longer matches any
//   // currently-connected printer, warn the user instead of silently saving
//   // over it with the next submit.
//   const savedPrinterMissing =
//     !isLoadingPrinters &&
//     !loadError &&
//     printers.length > 0 &&
//     !!settings?.printer_device_name &&
//     !printers.some((p) => p.name === settings?.printer_device_name);

//   async function onSubmit(values: PrintingFormValues) {
//     setIsSubmitting(true);
//     try {
//       const result = await updateSettings(values);
//       updateNewSettings(values);
//       if (result.success) {
//         toast.success("Printing settings updated!", {
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
//           <Printer className="h-5 w-5" />
//           Printing Preferences
//         </CardTitle>
//         <CardDescription>
//           Configure how receipts and invoices are printed after a sale.
//         </CardDescription>
//       </CardHeader>
//       <CardContent>
//         <Form {...form}>
//           <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
//             {/* Printer selector */}
//             <FormField
//               control={form.control}
//               name="printer_device_name"
//               render={({ field }) => (
//                 <FormItem>
//                   <div className="flex items-center justify-between">
//                     <FormLabel className="flex items-center gap-2">
//                       <Printer className="h-4 w-4" />
//                       Printer
//                     </FormLabel>
//                     <Button
//                       type="button"
//                       variant="ghost"
//                       size="sm"
//                       onClick={loadPrinters}
//                       disabled={isLoadingPrinters}
//                     >
//                       {isLoadingPrinters ? (
//                         <Loader2 className="h-4 w-4 animate-spin" />
//                       ) : (
//                         <RefreshCw className="h-4 w-4" />
//                       )}
//                       <span className="ml-1">Refresh</span>
//                     </Button>
//                   </div>

//                   {loadError ? (
//                     <div className="flex items-center gap-2 text-sm text-destructive">
//                       <AlertCircle className="h-4 w-4" />
//                       {loadError}
//                     </div>
//                   ) : (
//                     <Select onValueChange={field.onChange} value={field.value}>
//                       <FormControl>
//                         <SelectTrigger className="w-full md:w-64">
//                           <SelectValue
//                             placeholder={
//                               isLoadingPrinters
//                                 ? "Loading printers..."
//                                 : "Select a printer"
//                             }
//                           />
//                         </SelectTrigger>
//                       </FormControl>
//                       <SelectContent>
//                         {printers.length === 0 && !isLoadingPrinters ? (
//                           <div className="px-2 py-1.5 text-sm text-muted-foreground">
//                             No printers found
//                           </div>
//                         ) : (
//                           printers.map((printer) => (
//                             <SelectItem key={printer.name} value={printer.name}>
//                               <div className="flex items-center gap-2">
//                                 {printer.displayName}
//                                 {/* {printer.isDefault && (
//                                   <span className="text-sm text-muted-foreground">
//                                     (default)
//                                   </span>
//                                 )} */}
//                               </div>
//                             </SelectItem>
//                           ))
//                         )}
//                       </SelectContent>
//                     </Select>
//                   )}

//                   {/* {selectedPrinterInfo && (
//                     <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
//                       <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
//                       Status: {selectedPrinterInfo.status === 0 ? "Ready" : "Check printer"}
//                     </div>
//                   )} */}

//                   {savedPrinterMissing && (
//                     <div className="flex items-center gap-1.5 text-sm text-amber-600">
//                       <AlertCircle className="h-3.5 w-3.5" />
//                       Previously saved printer "{settings?.printer_device_name}"
//                       is not currently connected.
//                     </div>
//                   )}

//                   <FormDescription>
//                     Select the physical printer to send receipts to.
//                   </FormDescription>
//                   <FormMessage />
//                 </FormItem>
//               )}
//             />

//             {/* Auto‑print toggle */}
//             <FormField
//               control={form.control}
//               name="print_after_sale"
//               render={({ field }) => (
//                 <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
//                   <div className="space-y-0.5">
//                     <FormLabel className="text-base">
//                       Auto‑print after sale
//                     </FormLabel>
//                     <FormDescription>
//                       Automatically send the receipt to the printer after each
//                       completed sale.
//                     </FormDescription>
//                   </div>
//                   <FormControl>
//                     <Switch
//                       checked={field.value}
//                       onCheckedChange={field.onChange}
//                     />
//                   </FormControl>
//                 </FormItem>
//               )}
//             />

//             {/* Paper size selector */}
//             <FormField
//               control={form.control}
//               name="paper_size"
//               render={({ field }) => (
//                 <FormItem>
//                   <FormLabel className="flex items-center gap-2">
//                     <FileText className="h-4 w-4" />
//                     Paper Size
//                   </FormLabel>
//                   <Select
//                     onValueChange={field.onChange}
//                     defaultValue={field.value}
//                   >
//                     <FormControl>
//                       <SelectTrigger className="w-full md:w-64">
//                         <SelectValue placeholder="Select paper size" />
//                       </SelectTrigger>
//                     </FormControl>
//                     <SelectContent>
//                       {PAPER_SIZES.map((size) => (
//                         <SelectItem key={size.value} value={size.value}>
//                           {size.label}
//                         </SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                   <FormDescription>
//                     Choose the paper size for printed receipts and invoices.
//                   </FormDescription>
//                   <FormMessage />
//                 </FormItem>
//               )}
//             />

//             {/* Preview hint */}
//             <div className="p-4 bg-muted/30 rounded-lg border text-sm text-muted-foreground">
//               <p>
//                 <strong>Note:</strong> Your printer must support the selected
//                 paper size. Thermal printers typically use 80mm or 58mm rolls.
//               </p>
//             </div>

//             <Button type="submit" disabled={isSubmitting}>
//               {isSubmitting ? "Saving..." : "Save Printing Settings"}
//             </Button>
//           </form>
//         </Form>
//         {isSubmitting && <LoadingSpinner loadingText="Saving..." />}
//       </CardContent>
//     </Card>
//   );
// }
