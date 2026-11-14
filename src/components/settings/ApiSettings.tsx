"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import {
  testEmailConnection,
  testSmsConnection,
  updateApiSettings,
} from "@/actions/api-settings";
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
import { Switch } from "@/components/ui/switch";
import type { ApiSettings as ApiSettingsType } from "@/types/globals";

interface ApiSettingsProps {
  apiSettings: ApiSettingsType | null;
  settings: {
    business_name: string;
    business_email: string;
  };
}

/* -------------------------------------------------------------------------- */
/*  Schemas (module scope)                                                    */
/* -------------------------------------------------------------------------- */

const smsSchema = z.object({
  arkessel_api_key: z.string(),
  arkessel_sender_id: z
    .string()
    .max(11, "11 characters or fewer.")
    .regex(/^[A-Za-z0-9]*$/, "Letters and numbers only.")
    .optional()
    .or(z.literal("")),
  arkessel_base_url: z
    .string()
    .url("Enter a valid URL.")
    .optional()
    .or(z.literal("")),
});
type SmsFormValues = z.infer<typeof smsSchema>;

const emailSchema = z.object({
  smtp_host: z.string().min(1, "Enter the SMTP host."),
  smtp_port: z.coerce.number().min(1).max(65535),
  smtp_secure: z.boolean(),
  smtp_user: z
    .string()
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
  smtp_password: z.string(),
  smtp_from_name: z.string().optional().or(z.literal("")),
  smtp_from_email: z
    .string()
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
});

// `smtp_port` goes through `z.coerce.number()`, so the schema's *input* type
// (what the form field holds before validation, e.g. a raw string/number)
// differs from its *output* type (`number`, after parsing). Using a single
// `z.infer<...>` for both sides of `useForm` is what produced the type error
// — the zodResolver's input type is `unknown`/`string | number` for a
// coerced field, which isn't assignable to `useForm<EmailFormValues>`'s
// stricter `number`. Splitting input vs. output and passing both as
// `useForm`'s 1st/3rd generics resolves it.
type EmailFormInput = z.input<typeof emailSchema>;
type EmailFormValues = z.output<typeof emailSchema>;

const ROW = "grid gap-4 px-5 py-5 sm:px-6 md:grid-cols-[14rem_1fr]";

/* -------------------------------------------------------------------------- */
/*  Shared secret-field helper                                                */
/* -------------------------------------------------------------------------- */

/**
 * A secret never round-trips to the browser: the form always starts blank,
 * whatever the server has stored. Submitting blank means "leave it as is" —
 * `omitUnchangedSecret` drops the field from the payload so an empty string
 * can never overwrite a working credential. Typing a new value is the only
 * way to change it.
 */
function omitUnchangedSecret<T extends Record<string, unknown>>(
  payload: T,
  field: keyof T,
): T {
  if (!payload[field]) {
    const next = { ...payload };
    delete next[field];
    return next;
  }
  return payload;
}

function SecretField({
  id,
  label,
  description,
  hasSavedValue,
  visible,
  onToggleVisible,
  value,
  onChange,
  onBlur,
  name,
  ref,
  placeholder,
}: {
  id: string;
  label: string;
  description?: React.ReactNode;
  hasSavedValue: boolean;
  visible: boolean;
  onToggleVisible: () => void;
  value?: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  name: string;
  ref?: React.Ref<HTMLInputElement>;
  placeholder: string;
}) {
  const safeValue = value ?? "";

  return (
    <FormItem>
      <FormLabel htmlFor={id}>{label}</FormLabel>

      <div className="flex gap-2">
        <FormControl>
          <Input
            id={id}
            name={name}
            ref={ref}
            type={visible ? "text" : "password"}
            placeholder={
              hasSavedValue
                ? "Already set — leave blank to keep it"
                : placeholder
            }
            value={safeValue}
            onChange={onChange}
            onBlur={onBlur}
            autoComplete="off"
          />
        </FormControl>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onToggleVisible}
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}

          <span className="sr-only">
            {visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`}
          </span>
        </Button>
      </div>

      {description && <FormDescription>{description}</FormDescription>}

      <FormMessage />
    </FormItem>
  );
}

/* -------------------------------------------------------------------------- */
/*  SMS section                                                               */
/* -------------------------------------------------------------------------- */

function SmsSettingsSection({
  settings,
}: {
  settings: ApiSettingsType | null;
}) {
  const [showKey, setShowKey] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const hasSavedKey = Boolean(settings?.arkessel_api_key);

  const form = useForm<SmsFormValues>({
    resolver: zodResolver(smsSchema),
    defaultValues: {
      arkessel_api_key: "", // never pre-filled with the real secret — see SecretField
      arkessel_sender_id: settings?.arkessel_sender_id || "",
      arkessel_base_url:
        settings?.arkessel_base_url ||
        "https://sms.arkesel.com/api/v2/sms/send",
    },
  });
  const { isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: SmsFormValues) {
    try {
      const payload = omitUnchangedSecret(values, "arkessel_api_key");
      const result = await updateApiSettings(payload);

      if (!result.success) {
        toast.error("Couldn't save SMS settings", {
          description: result.message,
        });
        return;
      }

      form.reset({ ...values, arkessel_api_key: "" });
      toast.success("SMS settings saved");
    } catch (error) {
      toast.error("Couldn't save SMS settings", {
        description:
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
      });
    }
  }

  async function handleTestSms() {
    const phone = testPhone.trim();
    if (!phone) {
      toast.error("Enter a phone number to test.");
      return;
    }

    setIsTesting(true);
    try {
      const result = await testSmsConnection(phone);
      if (result.success) toast.success("Test SMS sent");
      else toast.error("Test SMS failed", { description: result.message });
    } catch (error) {
      toast.error("Test SMS failed", {
        description:
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
      });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <section
      className="rounded-xl border bg-card"
      aria-labelledby="sms-settings-title"
    >
      <header className="border-b px-5 py-4 sm:px-6">
        <h2
          id="sms-settings-title"
          className="text-base font-semibold tracking-tight"
        >
          SMS (Arkessel)
        </h2>
        <p className="text-sm text-muted-foreground">
          Credentials for sending SMS through Arkessel.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
          <div className={ROW}>
            <div />
            <FormField
              control={form.control}
              name="arkessel_api_key"
              render={({ field }) => (
                <SecretField
                  id="arkessel-api-key"
                  label="API key"
                  description="Never sent back to your browser once saved. Leave blank to keep the current key."
                  hasSavedValue={hasSavedKey}
                  visible={showKey}
                  onToggleVisible={() => setShowKey((s) => !s)}
                  placeholder="Paste your Arkessel API key"
                  {...field}
                />
              )}
            />
          </div>

          <div className={ROW}>
            <div className="space-y-1">
              <p className="text-sm font-medium">Sender details</p>
              <p className="text-sm text-muted-foreground">
                Where messages appear to come from.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="arkessel_sender_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sender ID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. MyShop" {...field} />
                    </FormControl>
                    <FormDescription>
                      Up to 11 letters or numbers.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="arkessel_base_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endpoint URL</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="space-y-3 bg-muted/30 px-5 py-5 sm:px-6">
            <p className="text-sm font-medium">Send a test message</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Phone number, e.g. 024 000 0000"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="bg-background sm:max-w-xs"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isTesting || isDirty}
                onClick={handleTestSms}
              >
                {isTesting ? "Sending…" : "Send test SMS"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {isDirty
                ? "Save your changes first — the test uses your saved settings."
                : "Uses your saved settings."}
            </p>
          </div>

          <div className="flex items-center justify-end gap-4 px-5 py-4 sm:px-6">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {isDirty ? "You have unsaved changes" : ""}
            </p>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? "Saving…" : "Save SMS settings"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Email section                                                             */
/* -------------------------------------------------------------------------- */

function EmailSettingsSection({ apiSettings, settings }: ApiSettingsProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const hasSavedPassword = Boolean(apiSettings?.smtp_password);

  // Two generics: `EmailFormInput` is what the fields hold pre-validation
  // (smtp_port can be a string/number before z.coerce runs); `EmailFormValues`
  // (3rd generic) is the parsed output `handleSubmit` hands to `onSubmit`,
  // where smtp_port is guaranteed to be a `number`. This is what the single-
  // generic `useForm<EmailFormValues>` version got wrong.
  const form = useForm<EmailFormInput, unknown, EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      smtp_host: apiSettings?.smtp_host || "smtp.gmail.com",
      smtp_port: apiSettings?.smtp_port || 587,
      smtp_secure: apiSettings?.smtp_secure ?? false,
      smtp_user: apiSettings?.smtp_user || "",
      smtp_password: "", // never pre-filled with the real secret — see SecretField
      smtp_from_name:
        apiSettings?.smtp_from_name || settings.business_name || "",
      smtp_from_email:
        apiSettings?.smtp_from_email || settings.business_email || "",
    },
  });
  const { isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: EmailFormValues) {
    try {
      const payload = omitUnchangedSecret(values, "smtp_password");
      const result = await updateApiSettings(payload);

      if (!result.success) {
        toast.error("Couldn't save email settings", {
          description: result.message,
        });
        return;
      }

      form.reset({ ...values, smtp_password: "" });
      toast.success("Email settings saved");
    } catch (error) {
      toast.error("Couldn't save email settings", {
        description:
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
      });
    }
  }

  async function handleTestEmail() {
    setIsTesting(true);
    try {
      const result = await testEmailConnection();
      if (result.success) toast.success("SMTP connection verified");
      else toast.error("Verification failed", { description: result.message });
    } catch (error) {
      toast.error("Verification failed", {
        description:
          error instanceof Error
            ? error.message
            : "Check your connection and try again.",
      });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <section
      className="rounded-xl border bg-card"
      aria-labelledby="email-settings-title"
    >
      <header className="border-b px-5 py-4 sm:px-6">
        <h2
          id="email-settings-title"
          className="text-base font-semibold tracking-tight"
        >
          Email (SMTP)
        </h2>
        <p className="text-sm text-muted-foreground">
          For Gmail, use an{" "}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            app password
          </a>
          , not your regular password.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
          <div className={ROW}>
            <div className="space-y-1">
              <p className="text-sm font-medium">Server</p>
              <p className="text-sm text-muted-foreground">
                Your SMTP provider's connection details.
              </p>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <FormField
                  control={form.control}
                  name="smtp_host"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Host</FormLabel>
                      <FormControl>
                        <Input placeholder="smtp.gmail.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="smtp_port"
                  render={({ field }) => {
                    const portValue =
                      typeof field.value === "number" &&
                      Number.isFinite(field.value)
                        ? field.value
                        : "";

                    return (
                      <FormItem>
                        <FormLabel>Port</FormLabel>

                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={portValue}
                            onChange={(e) => {
                              const value = e.target.value;

                              field.onChange(
                                value === "" ? undefined : Number(value),
                              );
                            }}
                            className="tabular-nums"
                          />
                        </FormControl>

                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <FormField
                control={form.control}
                name="smtp_secure"
                render={({ field }) => (
                  /* Added "relative" and "w-full" to lock absolute-positioned child nodes to this exact element boundary */
                  <FormItem className="relative flex w-full flex-row items-center justify-between gap-6 rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Use TLS/SSL</FormLabel>
                      <FormDescription>
                        On for port 465. Off for port 587 (STARTTLS).
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    {/* Explicitly omitting FormMessage here as Switch inputs generally do not throw layout validation strings, 
          but if you need it, it will now stay contained inside the FormItem bounds due to the "relative" class above */}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className={ROW}>
            <div className="space-y-1">
              <p className="text-sm font-medium">Account</p>
              <p className="text-sm text-muted-foreground">
                Signs in and sends as this address.
              </p>
            </div>
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="smtp_user"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="off"
                        placeholder="you@gmail.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="smtp_password"
                render={({ field }) => (
                  <SecretField
                    id="smtp-password"
                    label="Password"
                    hasSavedValue={hasSavedPassword}
                    visible={showPassword}
                    onToggleVisible={() => setShowPassword((s) => !s)}
                    placeholder="16-character app password"
                    {...field}
                  />
                )}
              />
            </div>
          </div>

          <div className={ROW}>
            <div className="space-y-1">
              <p className="text-sm font-medium">From line</p>
              <p className="text-sm text-muted-foreground">
                How recipients see the sender. Optional.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="smtp_from_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Business" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="smtp_from_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="noreply@yourbusiness.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="space-y-3 bg-muted/30 px-5 py-5 sm:px-6">
            <p className="text-sm font-medium">Verify the connection</p>
            <Button
              type="button"
              variant="outline"
              disabled={isTesting || isDirty}
              onClick={handleTestEmail}
            >
              {isTesting ? "Verifying…" : "Verify SMTP connection"}
            </Button>
            <p className="text-sm text-muted-foreground">
              {isDirty
                ? "Save your changes first — verification uses your saved settings."
                : "Uses your saved settings."}
            </p>
          </div>

          <div className="flex items-center justify-end gap-4 px-5 py-4 sm:px-6">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {isDirty ? "You have unsaved changes" : ""}
            </p>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? "Saving…" : "Save email settings"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function ApiSettings({
  settings,
  apiSettings,
}: ApiSettingsProps) {
  return (
    <div className="space-y-6">
      <SmsSettingsSection settings={apiSettings} />
      <EmailSettingsSection apiSettings={apiSettings} settings={settings} />
    </div>
  );
}

// "use client";

// import { useState } from "react";
// import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import * as z from "zod";
// import { Eye, EyeOff } from "lucide-react";
// import { toast } from "sonner";

// import {
//   testEmailConnection,
//   testSmsConnection,
//   updateApiSettings,
// } from "@/actions/api-settings";
// import { Button } from "@/components/ui/button";
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
// import { Switch } from "@/components/ui/switch";
// import type { ApiSettings as ApiSettingsType } from "@/types/globals";

// interface ApiSettingsProps {
//   apiSettings: ApiSettingsType | null;
//   settings: {
//     business_name: string;
//     business_email: string;
//   };
// }

// /* -------------------------------------------------------------------------- */
// /*  Schemas (module scope)                                                    */
// /* -------------------------------------------------------------------------- */

// const smsSchema = z.object({
//   arkessel_api_key: z.string(),
//   arkessel_sender_id: z
//     .string()
//     .max(11, "11 characters or fewer.")
//     .regex(/^[A-Za-z0-9]*$/, "Letters and numbers only.")
//     .optional()
//     .or(z.literal("")),
//   arkessel_base_url: z
//     .string()
//     .url("Enter a valid URL.")
//     .optional()
//     .or(z.literal("")),
// });
// type SmsFormValues = z.infer<typeof smsSchema>;

// const emailSchema = z.object({
//   smtp_host: z.string().min(1, "Enter the SMTP host."),
//   smtp_port: z.coerce.number().min(1).max(65535),
//   smtp_secure: z.boolean(),
//   smtp_user: z
//     .email("Enter a valid email address.")
//     .optional()
//     .or(z.literal("")),
//   smtp_password: z.string(),
//   smtp_from_name: z.string().optional().or(z.literal("")),
//   smtp_from_email: z
//     .string()
//     .email("Enter a valid email address.")
//     .optional()
//     .or(z.literal("")),
// });
// type EmailFormValues = z.infer<typeof emailSchema>;

// const ROW = "grid gap-4 px-5 py-5 sm:px-6 md:grid-cols-[14rem_1fr]";

// /* -------------------------------------------------------------------------- */
// /*  Shared secret-field helper                                                */
// /* -------------------------------------------------------------------------- */

// /**
//  * A secret never round-trips to the browser: the form always starts blank,
//  * whatever the server has stored. Submitting blank means "leave it as is" —
//  * `omitUnchangedSecret` drops the field from the payload so an empty string
//  * can never overwrite a working credential. Typing a new value is the only
//  * way to change it.
//  */
// function omitUnchangedSecret<T extends Record<string, unknown>>(
//   payload: T,
//   field: keyof T,
// ): T {
//   if (!payload[field]) {
//     const next = { ...payload };
//     delete next[field];
//     return next;
//   }
//   return payload;
// }

// function SecretField({
//   id,
//   label,
//   description,
//   hasSavedValue,
//   visible,
//   onToggleVisible,
//   value,
//   onChange,
//   onBlur,
//   name,
//   inputRef,
//   placeholder,
// }: {
//   id: string;
//   label: string;
//   description?: React.ReactNode;
//   hasSavedValue: boolean;
//   visible: boolean;
//   onToggleVisible: () => void;
//   value: string;
//   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
//   onBlur: () => void;
//   name: string;
//   inputRef: React.Ref<HTMLInputElement>;
//   placeholder: string;
// }) {
//   return (
//     <FormItem>
//       <FormLabel htmlFor={id}>{label}</FormLabel>
//       <div className="flex gap-2">
//         <FormControl>
//           <Input
//             id={id}
//             name={name}
//             ref={inputRef}
//             type={visible ? "text" : "password"}
//             placeholder={
//               hasSavedValue
//                 ? "Already set — leave blank to keep it"
//                 : placeholder
//             }
//             value={value}
//             onChange={onChange}
//             onBlur={onBlur}
//             autoComplete="off"
//           />
//         </FormControl>
//         <Button
//           type="button"
//           variant="outline"
//           size="icon"
//           onClick={onToggleVisible}
//         >
//           {visible ? (
//             <EyeOff aria-hidden className="size-4" />
//           ) : (
//             <Eye aria-hidden className="size-4" />
//           )}
//           <span className="sr-only">
//             {visible
//               ? `Hide ${label.toLowerCase()}`
//               : `Show ${label.toLowerCase()}`}
//           </span>
//         </Button>
//       </div>
//       {description && <FormDescription>{description}</FormDescription>}
//       <FormMessage />
//     </FormItem>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /*  SMS section                                                               */
// /* -------------------------------------------------------------------------- */

// function SmsSettingsSection({
//   settings,
// }: {
//   settings: ApiSettingsType | null;
// }) {
//   const [showKey, setShowKey] = useState(false);
//   const [testPhone, setTestPhone] = useState("");
//   const [isTesting, setIsTesting] = useState(false);
//   const hasSavedKey = Boolean(settings?.arkessel_api_key);

//   const form = useForm<SmsFormValues>({
//     resolver: zodResolver(smsSchema),
//     defaultValues: {
//       arkessel_api_key: "", // never pre-filled with the real secret — see SecretField
//       arkessel_sender_id: settings?.arkessel_sender_id || "",
//       arkessel_base_url:
//         settings?.arkessel_base_url ||
//         "https://sms.arkesel.com/api/v2/sms/send",
//     },
//   });
//   const { isSubmitting, isDirty } = form.formState;

//   async function onSubmit(values: SmsFormValues) {
//     try {
//       const payload = omitUnchangedSecret(values, "arkessel_api_key");
//       const result = await updateApiSettings(payload);

//       if (!result.success) {
//         toast.error("Couldn't save SMS settings", {
//           description: result.message,
//         });
//         return;
//       }

//       form.reset({ ...values, arkessel_api_key: "" });
//       toast.success("SMS settings saved");
//     } catch (error) {
//       toast.error("Couldn't save SMS settings", {
//         description:
//           error instanceof Error
//             ? error.message
//             : "Check your connection and try again.",
//       });
//     }
//   }

//   async function handleTestSms() {
//     const phone = testPhone.trim();
//     if (!phone) {
//       toast.error("Enter a phone number to test.");
//       return;
//     }

//     setIsTesting(true);
//     try {
//       const result = await testSmsConnection(phone);
//       if (result.success) toast.success("Test SMS sent");
//       else toast.error("Test SMS failed", { description: result.message });
//     } catch (error) {
//       toast.error("Test SMS failed", {
//         description:
//           error instanceof Error
//             ? error.message
//             : "Check your connection and try again.",
//       });
//     } finally {
//       setIsTesting(false);
//     }
//   }

//   return (
//     <section
//       className="rounded-xl border bg-card"
//       aria-labelledby="sms-settings-title"
//     >
//       <header className="border-b px-5 py-4 sm:px-6">
//         <h2
//           id="sms-settings-title"
//           className="text-base font-semibold tracking-tight"
//         >
//           SMS (Arkessel)
//         </h2>
//         <p className="text-sm text-muted-foreground">
//           Credentials for sending SMS through Arkessel.
//         </p>
//       </header>

//       <Form {...form}>
//         <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
//           <div className={ROW}>
//             <div />
//             <FormField
//               control={form.control}
//               name="arkessel_api_key"
//               render={({ field }) => (
//                 <SecretField
//                   id="arkessel-api-key"
//                   label="API key"
//                   description="Never sent back to your browser once saved. Leave blank to keep the current key."
//                   hasSavedValue={hasSavedKey}
//                   visible={showKey}
//                   onToggleVisible={() => setShowKey((s) => !s)}
//                   placeholder="Paste your Arkessel API key"
//                   {...field}
//                 />
//               )}
//             />
//           </div>

//           <div className={ROW}>
//             <div className="space-y-1">
//               <p className="text-sm font-medium">Sender details</p>
//               <p className="text-sm text-muted-foreground">
//                 Where messages appear to come from.
//               </p>
//             </div>
//             <div className="grid gap-4 sm:grid-cols-2">
//               <FormField
//                 control={form.control}
//                 name="arkessel_sender_id"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Sender ID</FormLabel>
//                     <FormControl>
//                       <Input placeholder="e.g. MyShop" {...field} />
//                     </FormControl>
//                     <FormDescription>
//                       Up to 11 letters or numbers.
//                     </FormDescription>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />
//               <FormField
//                 control={form.control}
//                 name="arkessel_base_url"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Endpoint URL</FormLabel>
//                     <FormControl>
//                       <Input {...field} />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />
//             </div>
//           </div>

//           <div className="space-y-3 bg-muted/30 px-5 py-5 sm:px-6">
//             <p className="text-sm font-medium">Send a test message</p>
//             <div className="flex flex-col gap-2 sm:flex-row">
//               <Input
//                 placeholder="Phone number, e.g. 024 000 0000"
//                 value={testPhone}
//                 onChange={(e) => setTestPhone(e.target.value)}
//                 className="bg-background sm:max-w-xs"
//               />
//               <Button
//                 type="button"
//                 variant="outline"
//                 disabled={isTesting || isDirty}
//                 onClick={handleTestSms}
//               >
//                 {isTesting ? "Sending…" : "Send test SMS"}
//               </Button>
//             </div>
//             <p className="text-sm text-muted-foreground">
//               {isDirty
//                 ? "Save your changes first — the test uses your saved settings."
//                 : "Uses your saved settings."}
//             </p>
//           </div>

//           <div className="flex items-center justify-end gap-4 px-5 py-4 sm:px-6">
//             <p aria-live="polite" className="text-sm text-muted-foreground">
//               {isDirty ? "You have unsaved changes" : ""}
//             </p>
//             <Button type="submit" disabled={isSubmitting || !isDirty}>
//               {isSubmitting ? "Saving…" : "Save SMS settings"}
//             </Button>
//           </div>
//         </form>
//       </Form>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /*  Email section                                                             */
// /* -------------------------------------------------------------------------- */

// function EmailSettingsSection({ apiSettings, settings }: ApiSettingsProps) {
//   const [showPassword, setShowPassword] = useState(false);
//   const [isTesting, setIsTesting] = useState(false);
//   const hasSavedPassword = Boolean(apiSettings?.smtp_password);

//   const form = useForm<EmailFormValues>({
//     resolver: zodResolver(emailSchema),
//     defaultValues: {
//       smtp_host: apiSettings?.smtp_host || "smtp.gmail.com",
//       smtp_port: apiSettings?.smtp_port || 587,
//       smtp_secure: apiSettings?.smtp_secure ?? false,
//       smtp_user: apiSettings?.smtp_user || "",
//       smtp_password: "", // never pre-filled with the real secret — see SecretField
//       smtp_from_name:
//         apiSettings?.smtp_from_name || settings.business_name || "",
//       smtp_from_email:
//         apiSettings?.smtp_from_email || settings.business_email || "",
//     },
//   });
//   const { isSubmitting, isDirty } = form.formState;

//   async function onSubmit(values: EmailFormValues) {
//     try {
//       const payload = omitUnchangedSecret(values, "smtp_password");
//       const result = await updateApiSettings(payload);

//       if (!result.success) {
//         toast.error("Couldn't save email settings", {
//           description: result.message,
//         });
//         return;
//       }

//       form.reset({ ...values, smtp_password: "" });
//       toast.success("Email settings saved");
//     } catch (error) {
//       toast.error("Couldn't save email settings", {
//         description:
//           error instanceof Error
//             ? error.message
//             : "Check your connection and try again.",
//       });
//     }
//   }

//   async function handleTestEmail() {
//     setIsTesting(true);
//     try {
//       const result = await testEmailConnection();
//       if (result.success) toast.success("SMTP connection verified");
//       else toast.error("Verification failed", { description: result.message });
//     } catch (error) {
//       toast.error("Verification failed", {
//         description:
//           error instanceof Error
//             ? error.message
//             : "Check your connection and try again.",
//       });
//     } finally {
//       setIsTesting(false);
//     }
//   }

//   return (
//     <section
//       className="rounded-xl border bg-card"
//       aria-labelledby="email-settings-title"
//     >
//       <header className="border-b px-5 py-4 sm:px-6">
//         <h2
//           id="email-settings-title"
//           className="text-base font-semibold tracking-tight"
//         >
//           Email (SMTP)
//         </h2>
//         <p className="text-sm text-muted-foreground">
//           For Gmail, use an{" "}
//           <a
//             href="https://myaccount.google.com/apppasswords"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="underline underline-offset-2"
//           >
//             app password
//           </a>
//           , not your regular password.
//         </p>
//       </header>

//       <Form {...form}>
//         <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
//           <div className={ROW}>
//             <div className="space-y-1">
//               <p className="text-sm font-medium">Server</p>
//               <p className="text-sm text-muted-foreground">
//                 Your SMTP provider's connection details.
//               </p>
//             </div>
//             <div className="space-y-4">
//               <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
//                 <FormField
//                   control={form.control}
//                   name="smtp_host"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>Host</FormLabel>
//                       <FormControl>
//                         <Input placeholder="smtp.gmail.com" {...field} />
//                       </FormControl>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//                 <FormField
//                   control={form.control}
//                   name="smtp_port"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>Port</FormLabel>
//                       <FormControl>
//                         <Input
//                           type="number"
//                           inputMode="numeric"
//                           name={field.name}
//                           ref={field.ref}
//                           onBlur={field.onBlur}
//                           value={Number.isNaN(field.value) ? "" : field.value}
//                           onChange={(e) =>
//                             field.onChange(
//                               e.target.value === ""
//                                 ? NaN
//                                 : Number(e.target.value),
//                             )
//                           }
//                           className="tabular-nums"
//                         />
//                       </FormControl>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//               </div>

//               <FormField
//                 control={form.control}
//                 name="smtp_secure"
//                 render={({ field }) => (
//                   <FormItem className="flex items-center justify-between gap-6 space-y-0 rounded-lg border px-4 py-3">
//                     <div className="space-y-1">
//                       <FormLabel className="text-sm font-medium">
//                         Use TLS/SSL
//                       </FormLabel>
//                       <FormDescription>
//                         On for port 465. Off for port 587 (STARTTLS).
//                       </FormDescription>
//                     </div>
//                     <FormControl>
//                       <Switch
//                         checked={field.value}
//                         onCheckedChange={field.onChange}
//                       />
//                     </FormControl>
//                   </FormItem>
//                 )}
//               />
//             </div>
//           </div>

//           <div className={ROW}>
//             <div className="space-y-1">
//               <p className="text-sm font-medium">Account</p>
//               <p className="text-sm text-muted-foreground">
//                 Signs in and sends as this address.
//               </p>
//             </div>
//             <div className="space-y-4">
//               <FormField
//                 control={form.control}
//                 name="smtp_user"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Email address</FormLabel>
//                     <FormControl>
//                       <Input
//                         type="email"
//                         autoComplete="off"
//                         placeholder="you@gmail.com"
//                         {...field}
//                       />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />
//               <FormField
//                 control={form.control}
//                 name="smtp_password"
//                 render={({ field }) => (
//                   <SecretField
//                     id="smtp-password"
//                     label="Password"
//                     hasSavedValue={hasSavedPassword}
//                     visible={showPassword}
//                     onToggleVisible={() => setShowPassword((s) => !s)}
//                     placeholder="16-character app password"
//                     {...field}
//                   />
//                 )}
//               />
//             </div>
//           </div>

//           <div className={ROW}>
//             <div className="space-y-1">
//               <p className="text-sm font-medium">From line</p>
//               <p className="text-sm text-muted-foreground">
//                 How recipients see the sender. Optional.
//               </p>
//             </div>
//             <div className="grid gap-4 sm:grid-cols-2">
//               <FormField
//                 control={form.control}
//                 name="smtp_from_name"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>From name</FormLabel>
//                     <FormControl>
//                       <Input placeholder="My Business" {...field} />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />
//               <FormField
//                 control={form.control}
//                 name="smtp_from_email"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>From email</FormLabel>
//                     <FormControl>
//                       <Input
//                         type="email"
//                         placeholder="noreply@yourbusiness.com"
//                         {...field}
//                       />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />
//             </div>
//           </div>

//           <div className="space-y-3 bg-muted/30 px-5 py-5 sm:px-6">
//             <p className="text-sm font-medium">Verify the connection</p>
//             <Button
//               type="button"
//               variant="outline"
//               disabled={isTesting || isDirty}
//               onClick={handleTestEmail}
//             >
//               {isTesting ? "Verifying…" : "Verify SMTP connection"}
//             </Button>
//             <p className="text-sm text-muted-foreground">
//               {isDirty
//                 ? "Save your changes first — verification uses your saved settings."
//                 : "Uses your saved settings."}
//             </p>
//           </div>

//           <div className="flex items-center justify-end gap-4 px-5 py-4 sm:px-6">
//             <p aria-live="polite" className="text-sm text-muted-foreground">
//               {isDirty ? "You have unsaved changes" : ""}
//             </p>
//             <Button type="submit" disabled={isSubmitting || !isDirty}>
//               {isSubmitting ? "Saving…" : "Save email settings"}
//             </Button>
//           </div>
//         </form>
//       </Form>
//     </section>
//   );
// }

// /* -------------------------------------------------------------------------- */
// /*  Page                                                                      */
// /* -------------------------------------------------------------------------- */

// export default function ApiSettings({
//   settings,
//   apiSettings,
// }: ApiSettingsProps) {
//   return (
//     <div className="space-y-6">
//       <SmsSettingsSection settings={apiSettings} />
//       <EmailSettingsSection apiSettings={apiSettings} settings={settings} />
//     </div>
//   );
// }

// "use client";

// import { useState } from "react";
// import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import * as z from "zod";
// import { toast } from "sonner";
// import {
//   ApiSettings as ApiSettingsType,
//   UpdateApiSettingsInput,
// } from "@/types/globals";
// import {
//   updateApiSettings,
//   testSmsConnection,
//   testEmailConnection,
// } from "@/actions/api-settings";
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
// import { Switch } from "@/components/ui/switch";
// import { Separator } from "@/components/ui/separator";
// import { MessageSquare, Mail, Eye, EyeOff, Zap, Loader2 } from "lucide-react";
// import LoadingSpinner from "@/components/custom/spinner/LoadingSpinner";

// // ── Zod Schemas ──
// const smsSchema = z.object({
//   arkessel_api_key: z.string().optional(),
//   arkessel_sender_id: z
//     .string()
//     .max(11, "Sender ID must be 11 chars or fewer")
//     .optional()
//     .or(z.literal("")),
//   arkessel_base_url: z.string().url("Invalid URL").optional().or(z.literal("")),
// });

// const emailSchema = z.object({
//   smtp_host: z.string().min(1, "SMTP host is required"),
//   smtp_port: z.coerce.number().min(1).max(65535),
//   smtp_secure: z.boolean(),
//   smtp_user: z.string().email("Invalid email").optional().or(z.literal("")),
//   smtp_password: z.string().optional(),
//   smtp_from_name: z.string().optional().or(z.literal("")),
//   smtp_from_email: z
//     .string()
//     .email("Invalid email")
//     .optional()
//     .or(z.literal("")),
// });

// interface ApiSettingsProps {
//   settings: ApiSettingsType | null;
// }

// export default function ApiSettings({ settings }: ApiSettingsProps) {
//   const [isSubmittingSms, setIsSubmittingSms] = useState(false);
//   const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
//   const [isTestingSms, setIsTestingSms] = useState(false);
//   const [isTestingEmail, setIsTestingEmail] = useState(false);
//   const [showSmsKey, setShowSmsKey] = useState(false);
//   const [showSmtpPass, setShowSmtpPass] = useState(false);
//   const [testPhone, setTestPhone] = useState("");

//   // ── SMS Form ──
//   const smsForm = useForm<z.infer<typeof smsSchema>>({
//     resolver: zodResolver(smsSchema),
//     defaultValues: {
//       arkessel_api_key: settings?.arkessel_api_key || "",
//       arkessel_sender_id: settings?.arkessel_sender_id || "",
//       arkessel_base_url:
//         settings?.arkessel_base_url ||
//         "https://sms.arkesel.com/api/v2/sms/send",
//     },
//   });

//   async function onSubmitSms(values: z.infer<typeof smsSchema>) {
//     setIsSubmittingSms(true);
//     try {
//       const result = await updateApiSettings(values);
//       if (result.success) {
//         toast.success("SMS settings saved!");
//       } else {
//         toast.error("Failed to save", { description: result.message });
//       }
//     } finally {
//       setIsSubmittingSms(false);
//     }
//   }

//   // ── Email Form ──
//   const emailForm = useForm<z.infer<typeof emailSchema>>({
//     resolver: zodResolver(emailSchema),
//     defaultValues: {
//       smtp_host: settings?.smtp_host || "smtp.gmail.com",
//       smtp_port: settings?.smtp_port || 587,
//       smtp_secure: settings?.smtp_secure || false,
//       smtp_user: settings?.smtp_user || "",
//       smtp_password: settings?.smtp_password || "",
//       smtp_from_name: settings?.smtp_from_name || "",
//       smtp_from_email: settings?.smtp_from_email || "",
//     },
//   });

//   async function onSubmitEmail(values: z.infer<typeof emailSchema>) {
//     setIsSubmittingEmail(true);
//     try {
//       const result = await updateApiSettings(values);
//       if (result.success) {
//         toast.success("Email settings saved!");
//       } else {
//         toast.error("Failed to save", { description: result.message });
//       }
//     } finally {
//       setIsSubmittingEmail(false);
//     }
//   }

//   // ── Test SMS ──
//   async function handleTestSms() {
//     if (!testPhone) {
//       toast.error("Please enter a phone number to test.");
//       return;
//     }
//     setIsTestingSms(true);
//     try {
//       const result = await testSmsConnection(testPhone);
//       if (result.success) {
//         toast.success("Test SMS sent successfully!");
//       } else {
//         toast.error("Test SMS failed", { description: result.message });
//       }
//     } finally {
//       setIsTestingSms(false);
//     }
//   }

//   // ── Test Email ──
//   async function handleTestEmail() {
//     setIsTestingEmail(true);
//     try {
//       const result = await testEmailConnection();
//       if (result.success) {
//         toast.success("SMTP connection verified!");
//       } else {
//         toast.error("SMTP verification failed", {
//           description: result.message,
//         });
//       }
//     } finally {
//       setIsTestingEmail(false);
//     }
//   }

//   return (
//     <div className="space-y-6">
//       {/* ── SMS Settings ── */}
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2">
//             <MessageSquare className="h-5 w-5" />
//             Arkessel SMS API
//           </CardTitle>
//           <CardDescription>
//             Configure your Arkessel SMS credentials to send transactional
//             messages.
//           </CardDescription>
//         </CardHeader>
//         <CardContent>
//           <Form {...smsForm}>
//             <form
//               onSubmit={smsForm.handleSubmit(onSubmitSms)}
//               className="space-y-4"
//             >
//               {/* API Key */}
//               <FormField
//                 control={smsForm.control}
//                 name="arkessel_api_key"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>API Key</FormLabel>
//                     <div className="flex gap-2">
//                       <FormControl>
//                         <Input
//                           type={showSmsKey ? "text" : "password"}
//                           placeholder="Enter your Arkessel API key"
//                           {...field}
//                         />
//                       </FormControl>
//                       <Button
//                         type="button"
//                         variant="outline"
//                         size="icon"
//                         onClick={() => setShowSmsKey((s) => !s)}
//                       >
//                         {showSmsKey ? (
//                           <EyeOff className="h-4 w-4" />
//                         ) : (
//                           <Eye className="h-4 w-4" />
//                         )}
//                       </Button>
//                     </div>
//                     <FormDescription>
//                       Stored encrypted. Leave unchanged to keep the current key.
//                     </FormDescription>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <FormField
//                   control={smsForm.control}
//                   name="arkessel_sender_id"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>Sender ID</FormLabel>
//                       <FormControl>
//                         <Input placeholder="e.g., MyShop" {...field} />
//                       </FormControl>
//                       <FormDescription>
//                         Max 11 characters (alphanumeric).
//                       </FormDescription>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />

//                 <FormField
//                   control={smsForm.control}
//                   name="arkessel_base_url"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>Base URL</FormLabel>
//                       <FormControl>
//                         <Input {...field} />
//                       </FormControl>
//                       <FormDescription>
//                         Default Arkessel SMS endpoint.
//                       </FormDescription>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//               </div>

//               {/* Test SMS */}
//               <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
//                 <div className="flex items-center gap-2">
//                   <Zap className="h-4 w-4 text-primary" />
//                   <span className="font-medium text-sm">Test Connection</span>
//                 </div>
//                 <div className="flex gap-2">
//                   <Input
//                     placeholder="Phone number (e.g., 024XXXXXXX)"
//                     value={testPhone}
//                     onChange={(e) => setTestPhone(e.target.value)}
//                   />
//                   <Button
//                     type="button"
//                     variant="outline"
//                     onClick={handleTestSms}
//                     disabled={isTestingSms}
//                   >
//                     {isTestingSms ? (
//                       <Loader2 className="h-4 w-4 animate-spin" />
//                     ) : (
//                       "Send Test"
//                     )}
//                   </Button>
//                 </div>
//                 <p className="text-xs text-muted-foreground">
//                   Save settings first, then send a test SMS.
//                 </p>
//               </div>

//               <Button type="submit" disabled={isSubmittingSms}>
//                 {isSubmittingSms ? "Saving..." : "Save SMS Settings"}
//               </Button>
//             </form>
//           </Form>
//         </CardContent>
//       </Card>

//       {/* ── Email Settings ── */}
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2">
//             <Mail className="h-5 w-5" />
//             Gmail SMTP (Nodemailer)
//           </CardTitle>
//           <CardDescription>
//             Configure Gmail SMTP for sending email notifications and receipts.
//             Use a Gmail <strong>App Password</strong> (not your regular
//             password).
//           </CardDescription>
//         </CardHeader>
//         <CardContent>
//           <Form {...emailForm}>
//             <form
//               onSubmit={emailForm.handleSubmit(onSubmitEmail)}
//               className="space-y-4"
//             >
//               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//                 <div className="md:col-span-2">
//                   <FormField
//                     control={emailForm.control}
//                     name="smtp_host"
//                     render={({ field }) => (
//                       <FormItem>
//                         <FormLabel>SMTP Host</FormLabel>
//                         <FormControl>
//                           <Input placeholder="smtp.gmail.com" {...field} />
//                         </FormControl>
//                         <FormMessage />
//                       </FormItem>
//                     )}
//                   />
//                 </div>
//                 <FormField
//                   control={emailForm.control}
//                   name="smtp_port"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>Port</FormLabel>
//                       <FormControl>
//                         <Input type="number" {...field} />
//                       </FormControl>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//               </div>

//               <FormField
//                 control={emailForm.control}
//                 name="smtp_secure"
//                 render={({ field }) => (
//                   <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
//                     <div className="space-y-0.5">
//                       <FormLabel className="text-base">Use TLS/SSL</FormLabel>
//                       <FormDescription>
//                         Enable for port 465. Leave off for port 587 (STARTTLS).
//                       </FormDescription>
//                     </div>
//                     <FormControl>
//                       <Switch
//                         checked={field.value}
//                         onCheckedChange={field.onChange}
//                       />
//                     </FormControl>
//                   </FormItem>
//                 )}
//               />

//               <FormField
//                 control={emailForm.control}
//                 name="smtp_user"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>Gmail Address</FormLabel>
//                     <FormControl>
//                       <Input
//                         type="email"
//                         placeholder="you@gmail.com"
//                         {...field}
//                       />
//                     </FormControl>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               <FormField
//                 control={emailForm.control}
//                 name="smtp_password"
//                 render={({ field }) => (
//                   <FormItem>
//                     <FormLabel>App Password</FormLabel>
//                     <div className="flex gap-2">
//                       <FormControl>
//                         <Input
//                           type={showSmtpPass ? "text" : "password"}
//                           placeholder="16-character app password"
//                           {...field}
//                         />
//                       </FormControl>
//                       <Button
//                         type="button"
//                         variant="outline"
//                         size="icon"
//                         onClick={() => setShowSmtpPass((s) => !s)}
//                       >
//                         {showSmtpPass ? (
//                           <EyeOff className="h-4 w-4" />
//                         ) : (
//                           <Eye className="h-4 w-4" />
//                         )}
//                       </Button>
//                     </div>
//                     <FormDescription>
//                       Generate at{" "}
//                       <a
//                         href="https://myaccount.google.com/apppasswords"
//                         target="_blank"
//                         rel="noopener noreferrer"
//                         className="underline"
//                       >
//                         Google App Passwords
//                       </a>
//                       . Stored encrypted.
//                     </FormDescription>
//                     <FormMessage />
//                   </FormItem>
//                 )}
//               />

//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <FormField
//                   control={emailForm.control}
//                   name="smtp_from_name"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>From Name</FormLabel>
//                       <FormControl>
//                         <Input placeholder="My Business" {...field} />
//                       </FormControl>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//                 <FormField
//                   control={emailForm.control}
//                   name="smtp_from_email"
//                   render={({ field }) => (
//                     <FormItem>
//                       <FormLabel>From Email</FormLabel>
//                       <FormControl>
//                         <Input
//                           type="email"
//                           placeholder="noreply@yourbusiness.com"
//                           {...field}
//                         />
//                       </FormControl>
//                       <FormMessage />
//                     </FormItem>
//                   )}
//                 />
//               </div>

//               {/* Test Email */}
//               <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
//                 <div className="flex items-center gap-2">
//                   <Zap className="h-4 w-4 text-primary" />
//                   <span className="font-medium text-sm">Test Connection</span>
//                 </div>
//                 <Button
//                   type="button"
//                   variant="outline"
//                   onClick={handleTestEmail}
//                   disabled={isTestingEmail}
//                 >
//                   {isTestingEmail ? (
//                     <>
//                       <Loader2 className="h-4 w-4 mr-2 animate-spin" />
//                       Verifying...
//                     </>
//                   ) : (
//                     "Verify SMTP Connection"
//                   )}
//                 </Button>
//                 <p className="text-xs text-muted-foreground">
//                   Save settings first, then verify.
//                 </p>
//               </div>

//               <Button type="submit" disabled={isSubmittingEmail}>
//                 {isSubmittingEmail ? "Saving..." : "Save Email Settings"}
//               </Button>
//             </form>
//           </Form>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
