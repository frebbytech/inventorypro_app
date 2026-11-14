"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { sendDailySalesReport } from "@/actions/daily-reports";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/providers/SettingsProvider";
import type { Settings } from "@/types/globals";
import { playStockAlertSound, type SoundTone } from "@/utils/audioAlert";

interface NotificationSettingsProps {
  settings: Settings | null;
}

interface FormValues {
  notification_email: boolean;
  notification_push: boolean;
  notification_sms: boolean;
  stock_audio_alert: boolean;
  stock_audio_volume: number;
  stock_audio_tone: SoundTone;
  stock_alert_threshold: number;
  eod_report_enabled: boolean;
  eod_business_closing_time: string;
  eod_admin_email: string;
  eod_admin_phone: string;
}

type ToggleName =
  | "notification_email"
  | "notification_push"
  | "notification_sms"
  | "stock_audio_alert"
  | "eod_report_enabled";

/* -------------------------------------------------------------------------- */
/*  Static config (module scope so it isn't rebuilt on every render)          */
/* -------------------------------------------------------------------------- */

const ROW_PADDING = "px-5 py-4 sm:px-6";

const CHANNELS: { name: ToggleName; label: string; description: string }[] = [
  {
    name: "notification_email",
    label: "Email",
    description: "Important system updates sent to your inbox.",
  },
  {
    name: "notification_push",
    label: "Push",
    description: "Real-time alerts in your browser.",
  },
  {
    name: "notification_sms",
    label: "SMS",
    description: "Text messages for urgent stock issues.",
  },
];

const TONE_OPTIONS: { value: SoundTone; label: string; description: string }[] =
  [
    {
      value: "chime",
      label: "Double chime",
      description: "Two soft tones, easy to ignore",
    },
    {
      value: "bell",
      label: "Bell",
      description: "Warm bell with a light shimmer",
    },
    {
      value: "marimba",
      label: "Marimba",
      description: "Wooden pluck, pleasant in a busy shop",
    },
    {
      value: "ping",
      label: "Register ping",
      description: "Short, crisp, high pitch",
    },
  ];

// Keys that change a range input, so tabbing onto the slider stays silent.
const SLIDER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return (
    /^[+\d\s()-]+$/.test(value) && digits.length >= 9 && digits.length <= 15
  );
}

/* -------------------------------------------------------------------------- */
/*  Hooks & building blocks                                                   */
/* -------------------------------------------------------------------------- */

/** Plays a sample and tracks "playing" briefly, cleaning up its timer on unmount. */
function useSoundSample() {
  const [isPlaying, setIsPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const play = useCallback((tone: SoundTone, volume: number) => {
    playStockAlertSound({ tone, volume });
    setIsPlaying(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setIsPlaying(false), 700);
  }, []);

  return { isPlaying, play };
}

function ToggleRow({
  control,
  name,
  label,
  description,
  onToggle,
}: {
  control: Control<FormValues>;
  name: ToggleName;
  label: string;
  description: string;
  onToggle?: (checked: boolean) => void;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={`flex items-center justify-between gap-6 space-y-0 ${ROW_PADDING}`}
        >
          <div className="space-y-1">
            <FormLabel className="text-sm font-medium">{label}</FormLabel>
            <FormDescription>{description}</FormDescription>
          </div>
          <FormControl>
            <Switch
              checked={field.value as boolean}
              onCheckedChange={(checked) => {
                field.onChange(checked);
                onToggle?.(checked);
              }}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function NotificationSettings({
  settings,
}: NotificationSettingsProps) {
  const { refetchSettings,updateNewSettings } = useSettings();
  const { isPlaying, play } = useSoundSample();
  const [isSendingReport, setIsSendingReport] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      notification_email: settings?.notification_email ?? true,
      notification_push: settings?.notification_push ?? true,
      notification_sms: settings?.notification_sms ?? false,
      stock_audio_alert: settings?.stock_audio_alert ?? true,
      stock_audio_volume: settings?.stock_audio_volume ?? 0.5,
      stock_audio_tone: (settings?.stock_audio_tone || "chime") as SoundTone,
      stock_alert_threshold: settings?.stock_alert_threshold ?? 5,
      eod_report_enabled: settings?.eod_report_enabled ?? true,
      eod_business_closing_time: settings?.eod_business_closing_time || "18:00",
      eod_admin_email: settings?.eod_admin_email || "",
      eod_admin_phone: settings?.eod_admin_phone || "",
    },
  });

  const { isSubmitting, isDirty } = form.formState;
  const [audioEnabled, tone, volume, reportEnabled] = useWatch({
    control: form.control,
    name: [
      "stock_audio_alert",
      "stock_audio_tone",
      "stock_audio_volume",
      "eod_report_enabled",
    ],
  });

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
      await refetchSettings();
      form.reset(values); // clears the dirty state against the saved values

      const toneLabel = TONE_OPTIONS.find(
        (o) => o.value === values.stock_audio_tone,
      )?.label;
      toast.success("Changes saved", {
        description: values.stock_audio_alert
          ? `Low stock sound is on (${toneLabel}).`
          : undefined,
        position: "top-right",
      });
    } catch {
      toast.error("Couldn't save changes", {
        description: "Check your connection and try again.",
        position: "top-right",
      });
    }
  }

  // The report is built on the server from your saved settings, so unsaved edits
  // can't be included. The button waits for a save instead of saving behind your back.
  async function handleSendReportNow() {
    setIsSendingReport(true);
    try {
      const res = await sendDailySalesReport({ force: true });

      if (res.success && res.data) {
        toast.success("Daily report sent", {
          description: "Sent using your saved report settings.",
          position: "top-right",
        });
      } else {
        toast.error("Couldn't send the report", {
          description: res.message || "Try again in a moment.",
          position: "top-right",
        });
      }
    } catch (err) {
      toast.error("Couldn't send the report", {
        description:
          err instanceof Error ? err.message : "Try again in a moment.",
        position: "top-right",
      });
    } finally {
      setIsSendingReport(false);
    }
  }

  return (
    <section
      className="rounded-xl border bg-card"
      aria-labelledby="notification-settings-title"
    >
      <header className="border-b px-5 py-4 sm:px-6">
        <h2
          id="notification-settings-title"
          className="text-base font-semibold tracking-tight"
        >
          Notifications
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose how you receive alerts, the low stock sound and the daily sales
          report.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="divide-y">
          {/* Low stock sound */}
          <div>
            <ToggleRow
              control={form.control}
              name="stock_audio_alert"
              label="Low stock sound"
              description="Plays during a sale when a product's stock reaches the threshold or lower."
              onToggle={(checked) => checked && play(tone, volume)}
            />

            {audioEnabled && (
              <div className="grid gap-6 border-t bg-muted/30 px-5 py-5 sm:px-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="stock_audio_tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sound</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value: SoundTone) => {
                          field.onChange(value);
                          play(value, volume);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full bg-background">
                            <SelectValue placeholder="Choose a sound">
                              {
                                TONE_OPTIONS.find(
                                  (o) => o.value === field.value,
                                )?.label
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TONE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <span className="flex flex-col py-0.5">
                                <span className="text-sm font-medium">
                                  {option.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {option.description}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="stock_alert_threshold"
                  rules={{
                    validate: (v) =>
                      (Number.isInteger(v) && v >= 1 && v <= 100) ||
                      "Enter a whole number from 1 to 100.",
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Low stock threshold</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={100}
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={Number.isNaN(field.value) ? "" : field.value}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value),
                              )
                            }
                            className="bg-background pr-14 tabular-nums"
                          />
                        </FormControl>
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                          units
                        </span>
                      </div>
                      <FormDescription>
                        Play the sound at this many units or fewer.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="stock_audio_volume"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <div className="flex items-center justify-between">
                        <FormLabel>Volume</FormLabel>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {Math.round(field.value * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <FormControl>
                          <input
                            type="range"
                            min={0.1}
                            max={1}
                            step={0.05}
                            value={field.value}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                            onPointerUp={() => play(tone, field.value)}
                            onKeyUp={(e) =>
                              SLIDER_KEYS.has(e.key) && play(tone, field.value)
                            }
                            className="h-1.5 w-full cursor-pointer accent-primary"
                          />
                        </FormControl>
                        <Button
                          id="test-audio-alert-btn"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => play(tone, field.value)}
                          className="shrink-0 gap-1.5"
                        >
                          <Play aria-hidden className="size-3.5" />
                          {isPlaying ? "Playing" : "Play sample"}
                        </Button>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>

          {/* Daily sales report */}
          <div>
            <ToggleRow
              control={form.control}
              name="eod_report_enabled"
              label="Daily sales report"
              description="Sends the admin a summary of the day's sales at closing time."
            />

            {reportEnabled && (
              <div className="space-y-5 border-t bg-muted/30 px-5 py-5 sm:px-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="eod_business_closing_time"
                    rules={{ required: "Choose a closing time." }}
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Closing time</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            className="w-40 bg-background tabular-nums"
                          />
                        </FormControl>
                        <FormDescription>
                          Sales are totalled up to this time each day.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="eod_admin_email"
                    rules={{
                      validate: (v) =>
                        !v.trim() ||
                        EMAIL_PATTERN.test(v.trim()) ||
                        "Enter a valid email address.",
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Report email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="email"
                            placeholder="admin@yourbusiness.com"
                            {...field}
                            className="bg-background"
                          />
                        </FormControl>
                        <FormDescription>
                          Leave blank to skip email.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="eod_admin_phone"
                    rules={{
                      validate: (v) =>
                        !v.trim() ||
                        isValidPhone(v.trim()) ||
                        "Enter a valid phone number.",
                    }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Report phone</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            autoComplete="tel"
                            placeholder="+233 24 000 0000"
                            {...field}
                            className="bg-background"
                          />
                        </FormControl>
                        <FormDescription>
                          Leave blank to skip SMS.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Includes revenue, orders, profit margin, top 5 items,
                      payment breakdown and cashier performance.
                    </p>
                    {isDirty && (
                      <p role="status">
                        Save your changes first. The report uses your saved
                        details.
                      </p>
                    )}
                  </div>

                  <Button
                    id="trigger-eod-report-btn"
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSendingReport || isSubmitting || isDirty}
                    onClick={handleSendReportNow}
                    className="shrink-0"
                  >
                    {isSendingReport ? "Sending…" : "Send report now"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Channels */}
          {CHANNELS.map((channel) => (
            <ToggleRow key={channel.name} control={form.control} {...channel} />
          ))}

          {/* Actions */}
          <div className={`flex items-center justify-end gap-4 ${ROW_PADDING}`}>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {isDirty ? "You have unsaved changes" : ""}
            </p>
            <Button
              id="save-notification-settings-btn"
              type="submit"
              disabled={isSubmitting || !isDirty}
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
