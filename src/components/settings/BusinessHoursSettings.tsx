"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";
import {
  DEFAULT_WEEKLY_SCHEDULE,
  type DaySchedule,
  type Settings,
} from "@/types/globals";

interface BusinessHoursSettingsProps {
  settings: Settings | null;
}

interface HoursState {
  is247: boolean;
  defaultOpen: string;
  defaultClose: string;
  schedule: DaySchedule[];
  notes: string;
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers (module scope so they aren't re-created on every render)     */
/* -------------------------------------------------------------------------- */

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const ROW = "grid gap-4 px-5 py-5 sm:px-6 md:grid-cols-[14rem_1fr]";

function parseSchedule(raw?: string | null): DaySchedule[] {
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length === 7 &&
        parsed.every(
          (d) =>
            typeof d?.day === "string" &&
            typeof d?.openTime === "string" &&
            typeof d?.closeTime === "string",
        )
      ) {
        return parsed as DaySchedule[];
      }
    } catch (error) {
      console.warn(
        "Could not parse business_hours_schedule, using defaults",
        error,
      );
    }
  }
  return DEFAULT_WEEKLY_SCHEDULE;
}

const toState = (settings: Settings | null): HoursState => ({
  is247: settings?.business_24_7 ?? false,
  defaultOpen: settings?.business_opening_time || "08:00",
  defaultClose: settings?.business_closing_time || "18:00",
  schedule: parseSchedule(settings?.business_hours_schedule),
  notes: settings?.business_hours_notes || "",
});

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** "08:00" -> "8:00 AM" */
function formatTime(time: string) {
  if (!time) return "";
  const [hours, minutes = "00"] = time.split(":");
  const h = Number.parseInt(hours || "0", 10);
  return `${h % 12 || 12}:${minutes} ${h >= 12 ? "PM" : "AM"}`;
}

/** Closing at or before opening means the day runs past midnight. */
const runsPastMidnight = (day: DaySchedule) =>
  toMinutes(day.closeTime) <= toMinutes(day.openTime);

interface OpenStatus {
  tone: "open" | "soon" | "closed";
  text: string;
}

function getOpenStatus(
  { is247, schedule }: Pick<HoursState, "is247" | "schedule">,
  now: Date,
): OpenStatus {
  if (is247) return { tone: "open", text: "Open 24/7" };

  const dayIndex = now.getDay();
  const today = schedule.find((d) => d.day === DAY_KEYS[dayIndex]);
  const yesterday = schedule.find(
    (d) => d.day === DAY_KEYS[(dayIndex + 6) % 7],
  );
  const minutes = now.getHours() * 60 + now.getMinutes();

  // Hours that started yesterday and are still running after midnight.
  if (
    yesterday &&
    !yesterday.closed &&
    runsPastMidnight(yesterday) &&
    minutes < toMinutes(yesterday.closeTime)
  ) {
    return {
      tone: "open",
      text: `Open now, closes at ${formatTime(yesterday.closeTime)}`,
    };
  }

  if (!today || today.closed) return { tone: "closed", text: "Closed today" };

  const open = toMinutes(today.openTime);
  const close = toMinutes(today.closeTime);

  if (runsPastMidnight(today)) {
    if (minutes >= open) {
      return {
        tone: "open",
        text: `Open now, closes at ${formatTime(today.closeTime)} tomorrow`,
      };
    }
  } else if (minutes >= open && minutes < close) {
    return {
      tone: "open",
      text: `Open now, closes at ${formatTime(today.closeTime)}`,
    };
  }

  if (minutes < open) {
    return {
      tone: "soon",
      text: `Closed, opens today at ${formatTime(today.openTime)}`,
    };
  }
  return { tone: "closed", text: "Closed for the day" };
}

const STATUS_DOT: Record<OpenStatus["tone"], string> = {
  open: "bg-emerald-500",
  soon: "bg-amber-500",
  closed: "bg-rose-500",
};

/** Current time, or null until mounted, so server and client render the same HTML. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export default function BusinessHoursSettings({
  settings,
}: BusinessHoursSettingsProps) {
  const { updateNewSettings } = useSettings();
  const [isPending, startTransition] = useTransition();

  const [saved, setSaved] = useState<HoursState>(() => toState(settings));
  const [draft, setDraft] = useState<HoursState>(saved);

  const now = useNow();
  // The banner reports what's live (saved), not what's being edited.
  const status = useMemo(
    () => (now ? getOpenStatus(saved, now) : null),
    [saved, now],
  );
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );

  function update<K extends keyof HoursState>(key: K, value: HoursState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateDay(index: number, patch: Partial<DaySchedule>) {
    setDraft((prev) => ({
      ...prev,
      schedule: prev.schedule.map((day, i) =>
        i === index ? { ...day, ...patch } : day,
      ),
    }));
  }

  function applyDefaultsToOpenDays() {
    setDraft((prev) => ({
      ...prev,
      schedule: prev.schedule.map((day) =>
        day.closed
          ? day
          : {
              ...day,
              openTime: prev.defaultOpen,
              closeTime: prev.defaultClose,
            },
      ),
    }));
  }

  function handleSave() {
    startTransition(async () => {
      const values: Partial<Settings> = {
        business_name: settings?.business_name,
        business_24_7: draft.is247,
        business_opening_time: draft.defaultOpen,
        business_closing_time: draft.defaultClose,
        business_hours_schedule: JSON.stringify(draft.schedule),
        business_hours_notes: draft.notes,
      };

      try {
        const result = await updateSettings(values);

        if (!result.success) {
          toast.error("Couldn't save changes", {
            description: result.message,
            position: "top-right",
          });
          return;
        }

        updateNewSettings(values); // only share with the app once it's actually saved
        setSaved(draft);
        toast.success("Changes saved", { position: "top-right" });
      } catch {
        toast.error("Couldn't save changes", {
          description: "Check your connection and try again.",
          position: "top-right",
        });
      }
    });
  }

  return (
    <section
      className="rounded-xl border bg-card"
      aria-labelledby="business-hours-title"
    >
      <header className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-1">
          <h2
            id="business-hours-title"
            className="text-base font-semibold tracking-tight"
          >
            Business hours
          </h2>
          <p className="text-sm text-muted-foreground">
            Set when your store is open.
          </p>
        </div>

        <p
          aria-live="polite"
          className="flex min-h-5 items-center gap-2 text-sm text-foreground"
        >
          {status && (
            <>
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", STATUS_DOT[status.tone])}
              />
              {status.text}
            </>
          )}
        </p>
      </header>

      <div className="divide-y">
        {/* 24/7 */}
        <div className="flex items-center justify-between gap-6 px-5 py-4 sm:px-6">
          <div className="space-y-1">
            <Label
              htmlFor="business-24-7-switch"
              className="text-sm font-medium"
            >
              Open 24 hours, 7 days a week
            </Label>
            <p className="text-sm text-muted-foreground">
              Turn this on if you never close. Daily hours are ignored.
            </p>
          </div>
          <Switch
            id="business-24-7-switch"
            checked={draft.is247}
            onCheckedChange={(checked) => update("is247", checked)}
          />
        </div>

        {!draft.is247 && (
          <>
            {/* Default hours */}
            <div className={ROW}>
              <div className="space-y-1">
                <p className="text-sm font-medium">Default hours</p>
                <p className="text-sm text-muted-foreground">
                  A quick way to set every open day at once.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="default-opening-time">Opens</Label>
                    <Input
                      id="default-opening-time"
                      type="time"
                      value={draft.defaultOpen}
                      onChange={(e) => update("defaultOpen", e.target.value)}
                      className="w-36 tabular-nums"
                    />
                  </div>
                  <span
                    aria-hidden
                    className="pb-2 text-sm text-muted-foreground"
                  >
                    to
                  </span>
                  <div className="space-y-1.5">
                    <Label htmlFor="default-closing-time">Closes</Label>
                    <Input
                      id="default-closing-time"
                      type="time"
                      value={draft.defaultClose}
                      onChange={(e) => update("defaultClose", e.target.value)}
                      className="w-36 tabular-nums"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyDefaultsToOpenDays}
                >
                  Apply to open days
                </Button>
              </div>
            </div>

            {/* Weekly schedule */}
            <div>
              <div className="bg-muted/30 px-5 py-3 sm:px-6">
                <h3 className="text-sm font-medium">Weekly schedule</h3>
                <p className="text-sm text-muted-foreground">
                  Turn a day off to mark it closed.
                </p>
              </div>

              <ul className="divide-y border-t">
                {draft.schedule.map((day, index) => (
                  <li
                    key={day.day}
                    className="grid items-center gap-3 px-5 py-3 sm:grid-cols-[14rem_1fr] sm:px-6"
                  >
                    <div className="flex items-center gap-3">
                      <Switch
                        id={`day-switch-${day.day}`}
                        checked={!day.closed}
                        onCheckedChange={(open) =>
                          updateDay(index, { closed: !open })
                        }
                      />
                      <Label
                        htmlFor={`day-switch-${day.day}`}
                        className="text-sm font-medium"
                      >
                        {day.label}
                      </Label>
                    </div>

                    <div className="flex min-h-9 flex-wrap items-center gap-2">
                      {day.closed ? (
                        <p className="text-sm text-muted-foreground">Closed</p>
                      ) : (
                        <>
                          <Input
                            type="time"
                            aria-label={`${day.label} opening time`}
                            value={day.openTime}
                            onChange={(e) =>
                              updateDay(index, { openTime: e.target.value })
                            }
                            className="w-36 tabular-nums"
                          />
                          <span
                            aria-hidden
                            className="text-sm text-muted-foreground"
                          >
                            to
                          </span>
                          <Input
                            type="time"
                            aria-label={`${day.label} closing time`}
                            value={day.closeTime}
                            onChange={(e) =>
                              updateDay(index, { closeTime: e.target.value })
                            }
                            className="w-36 tabular-nums"
                          />
                          {runsPastMidnight(day) && (
                            <span className="text-sm text-muted-foreground">
                              Closes the next day
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Notes */}
        <div className={ROW}>
          <div className="space-y-1">
            <Label
              htmlFor="business-hours-notes"
              className="text-sm font-medium"
            >
              Notes
            </Label>
            <p className="text-sm text-muted-foreground">
              Holiday hours, breaks or temporary changes. Shown to staff, and on
              customer notices where used.
            </p>
          </div>
          <Textarea
            id="business-hours-notes"
            placeholder="e.g. Closed on Christmas Day and New Year's Day."
            value={draft.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="max-w-md"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4 px-5 py-4 sm:px-6">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {isDirty ? "You have unsaved changes" : ""}
          </p>
          <Button
            id="save-business-hours-btn"
            type="button"
            onClick={handleSave}
            disabled={isPending || !isDirty}
          >
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </section>
  );
}

// "use client";

// import { useState, useTransition } from "react";
// import { toast } from "sonner";
// import { Settings, DaySchedule, DEFAULT_WEEKLY_SCHEDULE } from "@/types/globals";
// import { updateSettings } from "@/actions/settings";
// import { useSettings } from "@/providers/SettingsProvider";
// import { Button } from "@/components/ui/button";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Switch } from "@/components/ui/switch";
// import { Textarea } from "@/components/ui/textarea";
// import { Badge } from "@/components/ui/badge";
// import { Separator } from "@/components/ui/separator";
// import {
//   Clock,
//   Sparkles,
//   CalendarDays,
//   CheckCircle2,
//   XCircle,
//   Copy,
//   Info,
//   Loader2,
//   AlertCircle,
// } from "lucide-react";

// interface BusinessHoursSettingsProps {
//   settings: Settings | null;
// }

// export default function BusinessHoursSettings({
//   settings,
// }: BusinessHoursSettingsProps) {
//   const { updateNewSettings } = useSettings();
//   const [isPending, startTransition] = useTransition();

//   // 1. Parse or initialize weekly schedule
//   const initialSchedule: DaySchedule[] = (() => {
//     if (settings?.business_hours_schedule) {
//       try {
//         const parsed = JSON.parse(settings.business_hours_schedule);
//         if (Array.isArray(parsed) && parsed.length === 7) {
//           return parsed;
//         }
//       } catch (e) {
//         console.warn("Could not parse business_hours_schedule, using defaults", e);
//       }
//     }
//     return DEFAULT_WEEKLY_SCHEDULE;
//   })();

//   const [is247, setIs247] = useState<boolean>(
//     settings?.business_24_7 ?? false
//   );
//   const [defaultOpen, setDefaultOpen] = useState<string>(
//     settings?.business_opening_time || "08:00"
//   );
//   const [defaultClose, setDefaultClose] = useState<string>(
//     settings?.business_closing_time || "18:00"
//   );
//   const [schedule, setSchedule] = useState<DaySchedule[]>(initialSchedule);
//   const [notes, setNotes] = useState<string>(
//     settings?.business_hours_notes || ""
//   );

//   // Helper to calculate current business status
//   const calculateCurrentStatus = () => {
//     if (is247) {
//       return { isOpen: true, text: "Open 24/7", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" };
//     }

//     const now = new Date();
//     const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
//     const currentDayName = dayNames[now.getDay()];
//     const todaySchedule = schedule.find((s) => s.day === currentDayName);

//     if (!todaySchedule || todaySchedule.closed) {
//       return { isOpen: false, text: "Currently Closed Today", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30" };
//     }

//     const currentMinutes = now.getHours() * 60 + now.getMinutes();

//     const [openH, openM] = todaySchedule.openTime.split(":").map(Number);
//     const [closeH, closeM] = todaySchedule.closeTime.split(":").map(Number);

//     const openMinutes = (openH || 0) * 60 + (openM || 0);
//     const closeMinutes = (closeH || 0) * 60 + (closeM || 0);

//     if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
//       return {
//         isOpen: true,
//         text: `Open Now • Closes at ${formatTimeDisplay(todaySchedule.closeTime)}`,
//         color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
//       };
//     } else if (currentMinutes < openMinutes) {
//       return {
//         isOpen: false,
//         text: `Closed • Opens today at ${formatTimeDisplay(todaySchedule.openTime)}`,
//         color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
//       };
//     } else {
//       return {
//         isOpen: false,
//         text: "Closed for the day",
//         color: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
//       };
//     }
//   };

//   const status = calculateCurrentStatus();

//   // Helper to format "08:00" -> "8:00 AM"
//   function formatTimeDisplay(timeStr: string) {
//     if (!timeStr) return "";
//     const [hStr, mStr] = timeStr.split(":");
//     let h = parseInt(hStr || "0", 10);
//     const m = mStr || "00";
//     const ampm = h >= 12 ? "PM" : "AM";
//     h = h % 12;
//     h = h ? h : 12;
//     return `${h}:${m} ${ampm}`;
//   }

//   // Day toggle
//   const handleToggleDayClosed = (index: number, closed: boolean) => {
//     setSchedule((prev) => {
//       const next = [...prev];
//       next[index] = { ...next[index], closed };
//       return next;
//     });
//   };

//   // Day time change
//   const handleTimeChange = (
//     index: number,
//     field: "openTime" | "closeTime",
//     value: string
//   ) => {
//     setSchedule((prev) => {
//       const next = [...prev];
//       next[index] = { ...next[index], [field]: value };
//       return next;
//     });
//   };

//   // Apply default hours to all open days
//   const handleApplyDefaultsToAll = () => {
//     setSchedule((prev) =>
//       prev.map((day) => ({
//         ...day,
//         openTime: defaultOpen,
//         closeTime: defaultClose,
//       }))
//     );
//     toast.success(`Applied ${formatTimeDisplay(defaultOpen)} - ${formatTimeDisplay(defaultClose)} to all open days`);
//   };

//   // Save submit
//   const handleSave = () => {
//     startTransition(async () => {
//       const updatedValues = {
//         business_24_7: is247,
//         business_opening_time: defaultOpen,
//         business_closing_time: defaultClose,
//         business_hours_schedule: JSON.stringify(schedule),
//         business_hours_notes: notes,
//       };

//       try {
//         updateNewSettings(updatedValues as any);
//         const res = await updateSettings(updatedValues);

//         if (res.success) {
//           toast.success("Business hours updated successfully!", {
//             position: "top-right",
//           });
//         } else {
//           toast.error("Failed to save business hours", {
//             description: res.message || "An unexpected error occurred.",
//             position: "top-right",
//           });
//         }
//       } catch (err: any) {
//         toast.error("Error updating settings", {
//           description: err?.message || "Something went wrong",
//           position: "top-right",
//         });
//       }
//     });
//   };

//   return (
//     <div className="space-y-6">
//       {/* Overview Status Banner */}
//       <Card className="border-l-4 border-l-primary shadow-sm overflow-hidden">
//         <CardContent className="p-6">
//           <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
//             <div className="space-y-1">
//               <div className="flex items-center gap-2">
//                 <Clock className="h-5 w-5 text-primary" />
//                 <h3 className="text-lg font-semibold text-foreground">
//                   Operating Status
//                 </h3>
//               </div>
//               <p className="text-sm text-muted-foreground">
//                 Set when your store is open for customer sales, order fulfillment, and service hours.
//               </p>
//             </div>
//             <div className="flex items-center gap-3">
//               <Badge variant="outline" className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${status.color}`}>
//                 {status.isOpen ? (
//                   <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
//                 ) : (
//                   <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
//                 )}
//                 {status.text}
//               </Badge>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* Global & Quick Defaults */}
//       <Card>
//         <CardHeader>
//           <div className="flex items-center justify-between">
//             <div>
//               <CardTitle className="flex items-center gap-2 text-base font-semibold">
//                 <Sparkles className="h-4 w-4 text-primary" />
//                 Default Business Hours & 24/7 Mode
//               </CardTitle>
//               <CardDescription>
//                 Define your primary opening and closing times or switch to 24/7 operating mode.
//               </CardDescription>
//             </div>
//           </div>
//         </CardHeader>
//         <CardContent className="space-y-6">
//           <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
//             <div className="space-y-0.5">
//               <Label className="text-base font-medium">Open 24 Hours, 7 Days a Week</Label>
//               <p className="text-xs text-muted-foreground">
//                 Enable if your business operates non-stop without daily opening and closing limits.
//               </p>
//             </div>
//             <Switch
//               id="business-24-7-switch"
//               checked={is247}
//               onCheckedChange={setIs247}
//             />
//           </div>

//           {!is247 && (
//             <div className="space-y-4 pt-2">
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <div className="space-y-2">
//                   <Label htmlFor="default-opening-time" className="text-sm font-medium">
//                     Default Opening Time
//                   </Label>
//                   <div className="relative">
//                     <Input
//                       id="default-opening-time"
//                       type="time"
//                       value={defaultOpen}
//                       onChange={(e) => setDefaultOpen(e.target.value)}
//                       className="pl-9 font-mono"
//                     />
//                     <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
//                   </div>
//                   <p className="text-xs text-muted-foreground">
//                     Formally displays as: <span className="font-semibold text-foreground">{formatTimeDisplay(defaultOpen)}</span>
//                   </p>
//                 </div>

//                 <div className="space-y-2">
//                   <Label htmlFor="default-closing-time" className="text-sm font-medium">
//                     Default Closing Time
//                   </Label>
//                   <div className="relative">
//                     <Input
//                       id="default-closing-time"
//                       type="time"
//                       value={defaultClose}
//                       onChange={(e) => setDefaultClose(e.target.value)}
//                       className="pl-9 font-mono"
//                     />
//                     <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
//                   </div>
//                   <p className="text-xs text-muted-foreground">
//                     Formally displays as: <span className="font-semibold text-foreground">{formatTimeDisplay(defaultClose)}</span>
//                   </p>
//                 </div>
//               </div>

//               <div className="flex justify-end pt-1">
//                 <Button
//                   type="button"
//                   variant="outline"
//                   size="sm"
//                   onClick={handleApplyDefaultsToAll}
//                   className="text-xs gap-1.5"
//                 >
//                   <Copy className="h-3.5 w-3.5" />
//                   Apply Default Times to All Open Days
//                 </Button>
//               </div>
//             </div>
//           )}
//         </CardContent>
//       </Card>

//       {/* Weekly Schedule Detail */}
//       {!is247 && (
//         <Card>
//           <CardHeader>
//             <CardTitle className="flex items-center gap-2 text-base font-semibold">
//               <CalendarDays className="h-4 w-4 text-primary" />
//               Weekly Business Schedule
//             </CardTitle>
//             <CardDescription>
//               Customized daily schedules for each day of the week.
//             </CardDescription>
//           </CardHeader>
//           <CardContent className="space-y-4">
//             <div className="divide-y rounded-lg border">
//               {schedule.map((dayItem, index) => (
//                 <div
//                   key={dayItem.day}
//                   className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
//                     dayItem.closed
//                       ? "bg-muted/40 text-muted-foreground"
//                       : "bg-card hover:bg-muted/10"
//                   }`}
//                 >
//                   {/* Day Info & Open Toggle */}
//                   <div className="flex items-center gap-4 min-w-[160px]">
//                     <Switch
//                       id={`day-switch-${dayItem.day}`}
//                       checked={!dayItem.closed}
//                       onCheckedChange={(checked) =>
//                         handleToggleDayClosed(index, !checked)
//                       }
//                     />
//                     <div>
//                       <Label
//                         htmlFor={`day-switch-${dayItem.day}`}
//                         className={`font-semibold text-sm cursor-pointer ${
//                           dayItem.closed ? "line-through text-muted-foreground" : "text-foreground"
//                         }`}
//                       >
//                         {dayItem.label}
//                       </Label>
//                       <p className="text-xs text-muted-foreground">
//                         {dayItem.closed ? "Closed" : "Open"}
//                       </p>
//                     </div>
//                   </div>

//                   {/* Open & Close Inputs */}
//                   {!dayItem.closed ? (
//                     <div className="flex items-center gap-3 sm:gap-4 flex-1 justify-start sm:justify-end">
//                       <div className="flex items-center gap-2">
//                         <span className="text-xs text-muted-foreground font-medium">Opens:</span>
//                         <Input
//                           type="time"
//                           value={dayItem.openTime}
//                           onChange={(e) =>
//                             handleTimeChange(index, "openTime", e.target.value)
//                           }
//                           className="w-32 h-9 text-xs font-mono"
//                         />
//                       </div>
//                       <span className="text-xs text-muted-foreground font-medium">to</span>
//                       <div className="flex items-center gap-2">
//                         <span className="text-xs text-muted-foreground font-medium font-mono">Closes:</span>
//                         <Input
//                           type="time"
//                           value={dayItem.closeTime}
//                           onChange={(e) =>
//                             handleTimeChange(index, "closeTime", e.target.value)
//                           }
//                           className="w-32 h-9 text-xs font-mono"
//                         />
//                       </div>
//                     </div>
//                   ) : (
//                     <div className="flex items-center gap-2 justify-start sm:justify-end flex-1">
//                       <Badge variant="secondary" className="text-xs font-normal">
//                         Closed All Day
//                       </Badge>
//                     </div>
//                   )}
//                 </div>
//               ))}
//             </div>
//           </CardContent>
//         </Card>
//       )}

//       {/* Business Hours Notes & Special Announcements */}
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center gap-2 text-base font-semibold">
//             <Info className="h-4 w-4 text-primary" />
//             Special Hours & Customer Announcements
//           </CardTitle>
//           <CardDescription>
//             Add notes about holiday schedules, break periods, or temporary store hours.
//           </CardDescription>
//         </CardHeader>
//         <CardContent className="space-y-4">
//           <div className="space-y-2">
//             <Label htmlFor="business-hours-notes" className="text-sm font-medium">
//               Notes & Holidays Policy
//             </Label>
//             <Textarea
//               id="business-hours-notes"
//               placeholder="e.g. Closed on Christmas Day and New Year's Day. Special deliveries available on request."
//               value={notes}
//               onChange={(e) => setNotes(e.target.value)}
//               rows={3}
//             />
//             <p className="text-xs text-muted-foreground">
//               This note will be visible to staff and included on customer notices if applicable.
//             </p>
//           </div>

//           <Separator />

//           <div className="flex justify-end pt-2">
//             <Button
//               id="save-business-hours-btn"
//               type="button"
//               onClick={handleSave}
//               disabled={isPending}
//               className="gap-2 min-w-[160px]"
//             >
//               {isPending ? (
//                 <>
//                   <Loader2 className="h-4 w-4 animate-spin" />
//                   Saving Hours...
//                 </>
//               ) : (
//                 <>
//                   <Clock className="h-4 w-4" />
//                   Save Business Hours
//                 </>
//               )}
//             </Button>
//           </div>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
