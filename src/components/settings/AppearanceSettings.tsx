"use client";

import { useEffect, useId, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useTheme } from "next-themes";

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
import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";
import type { Settings } from "@/types/globals";

interface AppearanceSettingsProps {
  settings: Settings | null;
}

/* -------------------------------------------------------------------------- */
/*  Static config                                                             */
/* -------------------------------------------------------------------------- */

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

type Theme = (typeof THEMES)[number]["value"];

interface FormValues {
  theme: Theme;
  accent_color: string;
}

const DEFAULT_ACCENT = "#3b82f6";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const isTheme = (value: unknown): value is Theme =>
  THEMES.some((t) => t.value === value);

const ROW = "grid gap-4 space-y-0 px-5 py-5 sm:px-6 md:grid-cols-[14rem_1fr]";

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A tiny stand-in for the app. Fixed neutral colours keep each tile true to
 * the theme it represents, whatever theme the page is in right now.
 */
function MockPane({ dark, accent }: { dark?: boolean; accent: string }) {
  return (
    <span
      className={cn(
        "flex flex-1 flex-col gap-1.5 p-2.5",
        dark ? "bg-zinc-900" : "bg-white",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1/2 rounded-full",
          dark ? "bg-zinc-600" : "bg-zinc-300",
        )}
      />
      <span
        className={cn(
          "h-1.5 w-3/4 rounded-full",
          dark ? "bg-zinc-700" : "bg-zinc-200",
        )}
      />
      <span
        className="mt-auto h-3 w-1/3 rounded-sm"
        style={{ backgroundColor: accent }}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function AppearanceSettings({
  settings,
}: AppearanceSettingsProps) {
  const themeLabelId = useId();
  const { setTheme } = useTheme();
  const { setAccentColor,updateNewSettings } = useSettings();

  const savedAccent = useRef(
    settings?.accent_color && HEX_COLOR.test(settings.accent_color)
      ? settings.accent_color
      : DEFAULT_ACCENT,
  );

  const form = useForm<FormValues>({
    defaultValues: {
      theme: isTheme(settings?.theme) ? settings.theme : "system",
      accent_color: savedAccent.current,
    },
  });

  const { isSubmitting, isDirty } = form.formState;
  const accent = useWatch({ control: form.control, name: "accent_color" });
  const isValidAccent = HEX_COLOR.test(accent);

  // Preview the accent live, but only once it's a complete, valid colour.
  useEffect(() => {
    if (isValidAccent) setAccentColor(accent);
  }, [accent, isValidAccent, setAccentColor]);

  // Leaving without saving shouldn't leave an unsaved accent applied.
  useEffect(() => () => setAccentColor(savedAccent.current), [setAccentColor]);

  async function onSubmit(values: FormValues) {
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
 updateNewSettings(values);
      setTheme(values.theme);
      setAccentColor(values.accent_color);
      savedAccent.current = values.accent_color;
      form.reset(values); // clears the dirty state against the saved values

      toast.success("Changes saved", { position: "top-right" });
    } catch {
      toast.error("Couldn't save changes", {
        description: "Check your connection and try again.",
        position: "top-right",
      });
    }
  }

  const previewAccent = isValidAccent ? accent : "var(--primary)";

  return (
    <section
      className="rounded-xl border bg-card"
      aria-labelledby="appearance-settings-title"
    >
      <header className="border-b px-5 py-4 sm:px-6">
        <h2
          id="appearance-settings-title"
          className="text-base font-semibold tracking-tight"
        >
          Appearance
        </h2>
        <p className="text-sm text-muted-foreground">
          Set the theme and accent color for your dashboard.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
          {/* Theme */}
          <FormField
            control={form.control}
            name="theme"
            render={({ field }) => (
              <div className={ROW}>
                <div className="space-y-1">
                  <p id={themeLabelId} className="text-sm font-medium">
                    Theme
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Light, dark, or match your device.
                  </p>
                </div>

                <div
                  role="radiogroup"
                  aria-labelledby={themeLabelId}
                  className="grid max-w-md grid-cols-3 gap-3"
                >
                  {THEMES.map((option) => (
                    <label
                      key={option.value}
                      className="block cursor-pointer space-y-2"
                    >
                      <input
                        type="radio"
                        name={field.name}
                        value={option.value}
                        checked={field.value === option.value}
                        onChange={() => field.onChange(option.value)}
                        onBlur={field.onBlur}
                        className="peer sr-only"
                      />
                      <span className="flex h-20 overflow-hidden rounded-lg border peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                        {option.value === "system" ? (
                          <>
                            <MockPane accent={previewAccent} />
                            <MockPane dark accent={previewAccent} />
                          </>
                        ) : (
                          <MockPane
                            dark={option.value === "dark"}
                            accent={previewAccent}
                          />
                        )}
                      </span>
                      <span className="block text-sm text-muted-foreground peer-checked:font-medium peer-checked:text-foreground">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          />

          {/* Accent color */}
          <FormField
            control={form.control}
            name="accent_color"
            rules={{
              validate: (value) =>
                HEX_COLOR.test(value) ||
                "Use a 6-digit hex code, like #3B82F6.",
            }}
            render={({ field }) => (
              <FormItem className={ROW}>
                <div className="space-y-1">
                  <FormLabel>Accent color</FormLabel>
                  <FormDescription>
                    Used for buttons, links and highlights. Changes preview
                    right away; save to keep them.
                  </FormDescription>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      aria-label="Pick accent color"
                      value={isValidAccent ? field.value : "#000000"}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="size-9 shrink-0 cursor-pointer appearance-none rounded-md border border-input bg-transparent p-1 [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                    />
                    <FormControl>
                      <Input
                        maxLength={7}
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="off"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          field.onChange(raw.startsWith("#") ? raw : `#${raw}`);
                        }}
                        className="w-32 font-mono uppercase"
                      />
                    </FormControl>
                  </div>
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

// import { useState, useEffect, ChangeEvent } from "react";
// import { useForm } from "react-hook-form";
// import { toast } from "sonner";
// import { Settings } from "@/types/globals";
// import { updateSettings } from "@/actions/settings";
// import { useTheme } from "next-themes";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
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
// import { Palette, Monitor, Moon, Sun } from "lucide-react";
// import { useSettings } from "@/providers/SettingsProvider";

// interface AppearanceSettingsProps {
//   settings: Settings | null;
// }

// interface FormValues {
//   theme: string;
//   accent_color: string;
// }

// export default function AppearanceSettings({
//   settings,
// }: AppearanceSettingsProps) {
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const { setTheme } = useTheme();

//   // Connect straight into the shared system state
//   const { setAccentColor } = useSettings();

//   const form = useForm<FormValues>({
//     defaultValues: {
//       theme: settings?.theme || "system",
//       accent_color: settings?.accent_color?.startsWith("#")
//         ? settings.accent_color
//         : "#3b82f6",
//     },
//   });

//   const currentAccentColor = form.watch("accent_color");

//   useEffect(() => {
//     if (currentAccentColor.startsWith("#")) {
//       setAccentColor(currentAccentColor);
//     }
//   }, [currentAccentColor, setAccentColor]);

//   async function onSubmit(values: FormValues) {
//     setIsSubmitting(true);
//     try {
//       const result = await updateSettings({
//         ...values,
//         theme: values?.theme as "system" | "dark" | "light",
//       });
//       if (result.success) {
//         setTheme(values.theme);
//         setAccentColor(values.accent_color); // Finalize value in context
//         toast.success("Appearance settings updated!", {
//           position: "top-right",
//         });
//       } else {
//         toast.error("Failed to update settings", {
//           description: result.message,
//           position: "top-right",
//         });
//       }
//     } catch (error) {
//       toast.error("An unexpected error occurred", { position: "top-right" });
//     } finally {
//       setIsSubmitting(false);
//     }
//   }

//   const themeOptions = [
//     { value: "light", icon: Sun, label: "Light" },
//     { value: "dark", icon: Moon, label: "Dark" },
//     { value: "system", icon: Monitor, label: "System" },
//   ];

//   return (
//     <Card>
//       <CardHeader>
//         <CardTitle className="flex items-center gap-2">
//           <Palette className="h-5 w-5" />
//           Appearance
//         </CardTitle>
//         <CardDescription>
//           Customize the look and feel of your application.
//         </CardDescription>
//       </CardHeader>
//       <CardContent>
//         <Form {...form}>
//           <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
//             {/* Theme Selector Layout */}
//             <FormField
//               control={form.control}
//               name="theme"
//               render={({ field }) => (
//                 <FormItem>
//                   <FormLabel>Theme</FormLabel>
//                   <Select
//                     onValueChange={field.onChange}
//                     defaultValue={field.value}
//                     value={field.value}
//                   >
//                     <FormControl>
//                       <SelectTrigger className="w-full md:w-48">
//                         <SelectValue placeholder="Select theme" />
//                       </SelectTrigger>
//                     </FormControl>
//                     <SelectContent>
//                       {themeOptions.map((option) => (
//                         <SelectItem key={option.value} value={option.value}>
//                           <div className="flex items-center gap-2">
//                             <option.icon className="h-4 w-4" />
//                             {option.label}
//                           </div>
//                         </SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                 </FormItem>
//               )}
//             />

//             {/* Dynamic Color Picker Field */}
//             <FormField
//               control={form.control}
//               name="accent_color"
//               render={({ field }) => (
//                 <FormItem className="max-w-xs">
//                   <FormLabel>Accent Color</FormLabel>
//                   <FormControl>
//                     <div className="flex items-center gap-3">
//                       <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-input shrink-0 shadow-sm">
//                         <input
//                           type="color"
//                           value={field.value}
//                           onChange={(e: ChangeEvent<HTMLInputElement>) =>
//                             field.onChange(e.target.value)
//                           }
//                           className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer p-0 m-0 border-0"
//                         />
//                       </div>
//                       <Input
//                         type="text"
//                         maxLength={7}
//                         value={field.value}
//                         onChange={(e: ChangeEvent<HTMLInputElement>) =>
//                           field.onChange(e.target.value)
//                         }
//                         className="font-mono text-sm uppercase"
//                       />
//                     </div>
//                   </FormControl>
//                 </FormItem>
//               )}
//             />

//             <Button type="submit" disabled={isSubmitting}>
//               {isSubmitting ? "Saving..." : "Save Appearance Settings"}
//             </Button>
//           </form>
//         </Form>
//       </CardContent>
//     </Card>
//   );
// }
