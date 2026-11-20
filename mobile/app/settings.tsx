import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Lock,
  Mail,
  MapPin,
  Monitor,
  Moon,
  Package,
  Palette,
  Percent,
  Phone,
  Printer,
  RotateCcw,
  Send,
  ShieldCheck,
  Sun,
  Volume2,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  SegmentedTabs,
  useToast,
} from "@/components/ui";
import {
  DEFAULT_ACCENT_COLOR,
  normalizeHexColor,
  useTheme,
  type ThemePreference,
} from "@/theme";
import {
  DEFAULT_WEEKLY_SCHEDULE,
  type DaySchedule,
  type PaperSize,
  type StockAudioTone,
} from "@/types/domain";

type SettingsTabValue = "business" | "alerts" | "hours" | "theme";

const CURRENCY_OPTIONS = [
  "GHS",
  "USD",
  "EUR",
  "GBP",
  "NGN",
  "KES",
  "ZAR",
] as const;

const AUDIO_TONE_OPTIONS: ReadonlyArray<{
  value: StockAudioTone;
  label: string;
}> = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "marimba", label: "Marimba" },
  { value: "ping", label: "Ping" },
];

const AUDIO_VOLUME_PRESETS: ReadonlyArray<{ label: string; value: number }> = [
  { label: "25%", value: 0.25 },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1.0 },
];

const PAPER_SIZE_OPTIONS: ReadonlyArray<{ value: PaperSize; label: string }> = [
  { value: "thermal_80mm", label: "Thermal 80mm" },
  { value: "a4", label: "A4 Sheet" },
];

const ACCENT_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: "Blue", hex: "#3B82F6" },
  { label: "Ocean", hex: "#196B94" },
  { label: "Emerald", hex: "#10B981" },
  { label: "Violet", hex: "#8B5CF6" },
  { label: "Amber", hex: "#F59E0B" },
  { label: "Rose", hex: "#E11D48" },
];

const THEME_CHOICES: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  { value: "light", label: "Light", description: "Bright daytime surfaces" },
  { value: "dark", label: "Dark", description: "Low-glare night theme" },
  { value: "system", label: "System", description: "Follow device setting" },
];

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function formatTaxPercentInput(taxRateDecimal: number | undefined): string {
  const pct = Number(((taxRateDecimal ?? 0) * 100).toFixed(2));
  return String(pct);
}

function normalizeSchedule(schedule?: DaySchedule[]): DaySchedule[] {
  if (!Array.isArray(schedule) || schedule.length !== 7) {
    return DEFAULT_WEEKLY_SCHEDULE.map((d) => ({ ...d }));
  }
  return schedule.map((item, idx) => ({
    day: item.day || DEFAULT_WEEKLY_SCHEDULE[idx].day,
    label: item.label || DEFAULT_WEEKLY_SCHEDULE[idx].label,
    closed: Boolean(item.closed),
    openTime: item.openTime || DEFAULT_WEEKLY_SCHEDULE[idx].openTime,
    closeTime: item.closeTime || DEFAULT_WEEKLY_SCHEDULE[idx].closeTime,
    is24Hours: Boolean(item.is24Hours),
  }));
}

function computeStoreOpenStatus(
  is247: boolean,
  schedule: DaySchedule[],
): { isOpen: boolean; label: string; detail: string } {
  if (is247) {
    return {
      isOpen: true,
      label: "Open 24/7",
      detail: "Store operates continuously every day",
    };
  }
  const now = new Date();
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const todayKey = dayNames[now.getDay()];
  const today = schedule.find((d) => d.day.toLowerCase() === todayKey);
  if (!today || today.closed) {
    return {
      isOpen: false,
      label: "Closed Today",
      detail: `${today?.label || "Today"} is marked closed`,
    };
  }
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const currentHHMM = `${hh}:${mm}`;
  const isWithin =
    currentHHMM >= today.openTime && currentHHMM < today.closeTime;
  return {
    isOpen: isWithin,
    label: isWithin ? "Open Now" : "Closed Now",
    detail: `${today.label}: ${today.openTime} – ${today.closeTime}`,
  };
}

function ThemePreviewMini({
  variant,
  accent,
}: {
  variant: ThemePreference;
  accent: string;
}) {
  if (variant === "system") {
    return (
      <View style={styles.previewFrame}>
        <View style={[styles.previewHalf, { backgroundColor: "#F5F5F5" }]}>
          <View style={[styles.previewCardMock, { backgroundColor: "#FFFFFF" }]}>
            <View style={[styles.previewDot, { backgroundColor: accent }]} />
            <View style={[styles.previewLine, { backgroundColor: "#CBD5E1" }]} />
          </View>
          <View style={[styles.previewLineShort, { backgroundColor: "#94A3B8" }]} />
        </View>
        <View style={[styles.previewHalf, { backgroundColor: "#070B13" }]}>
          <View style={[styles.previewCardMock, { backgroundColor: "#0F172A" }]}>
            <View style={[styles.previewDot, { backgroundColor: accent }]} />
            <View style={[styles.previewLine, { backgroundColor: "#334155" }]} />
          </View>
          <View style={[styles.previewLineShort, { backgroundColor: "#475569" }]} />
        </View>
      </View>
    );
  }

  const isDark = variant === "dark";
  return (
    <View
      style={[
        styles.previewFrame,
        { backgroundColor: isDark ? "#070B13" : "#F5F5F5", padding: 7 },
      ]}
    >
      <View
        style={[
          styles.previewSingleInner,
          { backgroundColor: isDark ? "#0F172A" : "#FFFFFF" },
        ]}
      >
        <View style={styles.previewMockRow}>
          <View style={[styles.previewDot, { backgroundColor: accent }]} />
          <View
            style={[
              styles.previewLine,
              { backgroundColor: isDark ? "#334155" : "#CBD5E1", flex: 1 },
            ]}
          />
        </View>
        <View
          style={[
            styles.previewLineShort,
            { backgroundColor: isDark ? "#1E293B" : "#E2E8F0", width: "70%" },
          ]}
        />
        <View style={[styles.previewPillMock, { backgroundColor: accent }]} />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const {
    theme,
    preference,
    accentColor,
    setPreference,
    setAccentColor,
  } = useTheme();
  const {
    store,
    user,
    workspaceMode,
    refreshStoreSettings,
    updateBusinessSettings,
    updateNotificationSettings,
    updateBusinessHours,
    sendDailyReportNow,
  } = useAuth();
  const toast = useToast();
  const { colors, spacing, typography, radii, fontFamilies } = theme;

  const [activeTab, setActiveTab] = useState<SettingsTabValue>("business");
  const isReadOnlyStoreAdmin =
    workspaceMode === "synced" && user?.role !== "admin";

  const settingsTabs = useMemo(
    () => [
      {
        value: "business" as const,
        label: "Business",
        icon: (active: boolean) => (
          <Building2
            size={15}
            color={active ? colors.primaryForeground : colors.mutedForeground}
          />
        ),
      },
      {
        value: "alerts" as const,
        label: "Alerts & EOD",
        icon: (active: boolean) => (
          <Bell
            size={15}
            color={active ? colors.primaryForeground : colors.mutedForeground}
          />
        ),
      },
      {
        value: "hours" as const,
        label: "Hours",
        icon: (active: boolean) => (
          <Clock
            size={15}
            color={active ? colors.primaryForeground : colors.mutedForeground}
          />
        ),
      },
      {
        value: "theme" as const,
        label: "Theme",
        icon: (active: boolean) => (
          <Palette
            size={15}
            color={active ? colors.primaryForeground : colors.mutedForeground}
          />
        ),
      },
    ],
    [colors.primaryForeground, colors.mutedForeground],
  );

  // Refresh full store settings on screen mount
  useEffect(() => {
    void refreshStoreSettings().catch(() => {});
  }, [refreshStoreSettings]);

  // --- Tab 1: Business Info + Threshold + Receipt Printing ---
  const [storeName, setStoreName] = useState(
    store?.storeName ?? "Inventory Pro",
  );
  const [storeAddress, setStoreAddress] = useState(
    store?.storeAddress ?? "AK-459-6364, Kumasi",
  );
  const [storePhone, setStorePhone] = useState(store?.storePhone ?? "");
  const [storeEmail, setStoreEmail] = useState(store?.storeEmail ?? "");
  const [currency, setCurrency] = useState(store?.currency ?? "GHS");
  const [taxPercentText, setTaxPercentText] = useState(
    formatTaxPercentInput(store?.taxRate ?? 0.01),
  );
  const [stockThresholdText, setStockThresholdText] = useState(
    String(store?.stockAlertThreshold ?? 5),
  );
  const [printAfterSale, setPrintAfterSale] = useState(
    Boolean(store?.printAfterSale),
  );
  const [paperSize, setPaperSize] = useState<PaperSize>(
    store?.paperSize ?? "thermal_80mm",
  );
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [businessSavedMsg, setBusinessSavedMsg] = useState<string | null>(null);

  // --- Tab 2: Alerts & EOD ---
  const [notificationEmail, setNotificationEmail] = useState(
    Boolean(store?.notificationEmail),
  );
  const [notificationPush, setNotificationPush] = useState(
    store?.notificationPush ?? true,
  );
  const [notificationSms, setNotificationSms] = useState(
    Boolean(store?.notificationSms),
  );
  const [stockAudioAlert, setStockAudioAlert] = useState(
    store?.stockAudioAlert ?? true,
  );
  const [stockAudioTone, setStockAudioTone] = useState<StockAudioTone>(
    store?.stockAudioTone ?? "chime",
  );
  const [stockAudioVolume, setStockAudioVolume] = useState<number>(
    store?.stockAudioVolume ?? 0.5,
  );
  const [eodReportEnabled, setEodReportEnabled] = useState(
    Boolean(store?.eodReportEnabled),
  );
  const [eodClosingTime, setEodClosingTime] = useState(
    store?.eodBusinessClosingTime ?? "18:00",
  );
  const [eodAdminEmail, setEodAdminEmail] = useState(
    store?.eodAdminEmail ?? "",
  );
  const [eodAdminPhone, setEodAdminPhone] = useState(
    store?.eodAdminPhone ?? "",
  );
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [sendingEodReport, setSendingEodReport] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertsSavedMsg, setAlertsSavedMsg] = useState<string | null>(null);

  // --- Tab 3: Business Hours ---
  const [business247, setBusiness247] = useState(Boolean(store?.business247));
  const [businessOpeningTime, setBusinessOpeningTime] = useState(
    store?.businessOpeningTime ?? "08:00",
  );
  const [businessClosingTime, setBusinessClosingTime] = useState(
    store?.businessClosingTime ?? "18:00",
  );
  const [weeklySchedule, setWeeklySchedule] = useState<DaySchedule[]>(() =>
    normalizeSchedule(store?.businessHoursSchedule),
  );
  const [businessHoursNotes, setBusinessHoursNotes] = useState(
    store?.businessHoursNotes ?? "",
  );
  const [savingHours, setSavingHours] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [hoursSavedMsg, setHoursSavedMsg] = useState<string | null>(null);

  // --- Tab 4: Theme & Accent ---
  const [hexInput, setHexInput] = useState(accentColor);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [appearanceSavedMsg, setAppearanceSavedMsg] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setHexInput(accentColor);
  }, [accentColor]);

  // Baseline snapshots for dirty detection
  const initialBusiness = useMemo(
    () => ({
      storeName: store?.storeName ?? "Inventory Pro",
      storeAddress: store?.storeAddress ?? "AK-459-6364, Kumasi",
      storePhone: store?.storePhone ?? "",
      storeEmail: store?.storeEmail ?? "",
      currency: store?.currency ?? "GHS",
      taxPercentText: formatTaxPercentInput(store?.taxRate ?? 0.01),
      stockThresholdText: String(store?.stockAlertThreshold ?? 5),
      printAfterSale: Boolean(store?.printAfterSale),
      paperSize: store?.paperSize ?? ("thermal_80mm" as PaperSize),
    }),
    [store],
  );

  const isBusinessDirty =
    storeName.trim() !== initialBusiness.storeName.trim() ||
    storeAddress.trim() !== initialBusiness.storeAddress.trim() ||
    storePhone.trim() !== initialBusiness.storePhone.trim() ||
    storeEmail.trim() !== initialBusiness.storeEmail.trim() ||
    currency !== initialBusiness.currency ||
    taxPercentText.trim() !== initialBusiness.taxPercentText.trim() ||
    stockThresholdText.trim() !== initialBusiness.stockThresholdText.trim() ||
    printAfterSale !== initialBusiness.printAfterSale ||
    paperSize !== initialBusiness.paperSize;

  const initialAlerts = useMemo(
    () => ({
      notificationEmail: Boolean(store?.notificationEmail),
      notificationPush: store?.notificationPush ?? true,
      notificationSms: Boolean(store?.notificationSms),
      stockAudioAlert: store?.stockAudioAlert ?? true,
      stockAudioTone: store?.stockAudioTone ?? ("chime" as StockAudioTone),
      stockAudioVolume: Number((store?.stockAudioVolume ?? 0.5).toFixed(2)),
      eodReportEnabled: Boolean(store?.eodReportEnabled),
      eodClosingTime: store?.eodBusinessClosingTime ?? "18:00",
      eodAdminEmail: store?.eodAdminEmail ?? "",
      eodAdminPhone: store?.eodAdminPhone ?? "",
    }),
    [store],
  );

  const isAlertsDirty =
    notificationEmail !== initialAlerts.notificationEmail ||
    notificationPush !== initialAlerts.notificationPush ||
    notificationSms !== initialAlerts.notificationSms ||
    stockAudioAlert !== initialAlerts.stockAudioAlert ||
    stockAudioTone !== initialAlerts.stockAudioTone ||
    Number(stockAudioVolume.toFixed(2)) !== initialAlerts.stockAudioVolume ||
    eodReportEnabled !== initialAlerts.eodReportEnabled ||
    eodClosingTime.trim() !== initialAlerts.eodClosingTime.trim() ||
    eodAdminEmail.trim() !== initialAlerts.eodAdminEmail.trim() ||
    eodAdminPhone.trim() !== initialAlerts.eodAdminPhone.trim();

  const initialHours = useMemo(
    () => ({
      business247: Boolean(store?.business247),
      businessOpeningTime: store?.businessOpeningTime ?? "08:00",
      businessClosingTime: store?.businessClosingTime ?? "18:00",
      weeklyScheduleJson: JSON.stringify(
        normalizeSchedule(store?.businessHoursSchedule),
      ),
      businessHoursNotes: store?.businessHoursNotes ?? "",
    }),
    [store],
  );

  const isHoursDirty =
    business247 !== initialHours.business247 ||
    businessOpeningTime.trim() !== initialHours.businessOpeningTime.trim() ||
    businessClosingTime.trim() !== initialHours.businessClosingTime.trim() ||
    JSON.stringify(weeklySchedule) !== initialHours.weeklyScheduleJson ||
    businessHoursNotes.trim() !== initialHours.businessHoursNotes.trim();

  // Keep clean tabs synchronized with external updates
  useEffect(() => {
    if (!store) return;
    if (!isBusinessDirty) {
      setStoreName(store.storeName);
      setStoreAddress(store.storeAddress);
      setStorePhone(store.storePhone);
      setStoreEmail(store.storeEmail);
      setCurrency(store.currency || "GHS");
      setTaxPercentText(formatTaxPercentInput(store.taxRate));
      setStockThresholdText(String(store.stockAlertThreshold ?? 5));
      setPrintAfterSale(Boolean(store.printAfterSale));
      setPaperSize(store.paperSize ?? "thermal_80mm");
    }
    if (!isAlertsDirty) {
      setNotificationEmail(Boolean(store.notificationEmail));
      setNotificationPush(store.notificationPush ?? true);
      setNotificationSms(Boolean(store.notificationSms));
      setStockAudioAlert(store.stockAudioAlert ?? true);
      setStockAudioTone(store.stockAudioTone ?? "chime");
      setStockAudioVolume(store.stockAudioVolume ?? 0.5);
      setEodReportEnabled(Boolean(store.eodReportEnabled));
      setEodClosingTime(store.eodBusinessClosingTime ?? "18:00");
      setEodAdminEmail(store.eodAdminEmail ?? "");
      setEodAdminPhone(store.eodAdminPhone ?? "");
    }
    if (!isHoursDirty) {
      setBusiness247(Boolean(store.business247));
      setBusinessOpeningTime(store.businessOpeningTime ?? "08:00");
      setBusinessClosingTime(store.businessClosingTime ?? "18:00");
      setWeeklySchedule(normalizeSchedule(store.businessHoursSchedule));
      setBusinessHoursNotes(store.businessHoursNotes ?? "");
    }
  }, [store, isBusinessDirty, isAlertsDirty, isHoursDirty]);

  const openStatus = useMemo(
    () => computeStoreOpenStatus(business247, weeklySchedule),
    [business247, weeklySchedule],
  );

  const handleSaveBusinessInfo = async () => {
    setBusinessError(null);
    setBusinessSavedMsg(null);

    const cleanName = storeName.trim();
    const cleanAddress = storeAddress.trim();
    const cleanPhone = storePhone.trim();
    const cleanEmail = storeEmail.trim();
    const parsedPercent = Number(taxPercentText.replace(/,/g, ".").trim());
    const parsedThreshold = Math.trunc(Number(stockThresholdText.trim()));

    if (cleanName.length < 2) {
      setBusinessError("Business name must be at least 2 characters.");
      return;
    }
    if (cleanAddress.length < 5) {
      setBusinessError("Address must be at least 5 characters.");
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setBusinessError("Please enter a valid email address or leave it blank.");
      return;
    }
    if (
      !Number.isFinite(parsedPercent) ||
      parsedPercent < 0 ||
      parsedPercent > 100
    ) {
      setBusinessError(
        "Default tax rate must be a percentage between 0 and 100.",
      );
      return;
    }
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1) {
      setBusinessError("Low-stock alert threshold must be at least 1 unit.");
      return;
    }

    setSavingBusiness(true);
    try {
      const updated = await updateBusinessSettings({
        storeName: cleanName,
        storeAddress: cleanAddress,
        storePhone: cleanPhone,
        storeEmail: cleanEmail,
        currency,
        taxRate: Number((parsedPercent / 100).toFixed(4)),
        stockAlertThreshold: parsedThreshold,
        printAfterSale,
        paperSize,
      });
      setStoreName(updated.storeName);
      setStoreAddress(updated.storeAddress);
      setStorePhone(updated.storePhone);
      setStoreEmail(updated.storeEmail);
      setCurrency(updated.currency);
      setTaxPercentText(formatTaxPercentInput(updated.taxRate));
      setStockThresholdText(String(updated.stockAlertThreshold));
      setPrintAfterSale(Boolean(updated.printAfterSale));
      setPaperSize(updated.paperSize ?? "thermal_80mm");
      setBusinessSavedMsg("Business settings & receipt defaults saved.");
      toast.success(
        "Business settings saved",
        `${updated.storeName} preferences updated.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save business info.";
      setBusinessError(msg);
      toast.error("Could not save settings", msg);
    } finally {
      setSavingBusiness(false);
    }
  };

  const handleSaveAlertsAndEod = async () => {
    setAlertsError(null);
    setAlertsSavedMsg(null);

    const cleanTime = eodClosingTime.trim();
    const cleanEmail = eodAdminEmail.trim();
    const cleanPhone = eodAdminPhone.trim();

    if (!HHMM_REGEX.test(cleanTime)) {
      setAlertsError("Closing time must use 24-hour HH:MM format (e.g. 18:00).");
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAlertsError("Please enter a valid EOD report email address.");
      return;
    }

    setSavingAlerts(true);
    try {
      const updated = await updateNotificationSettings({
        notificationEmail,
        notificationPush,
        notificationSms,
        stockAudioAlert,
        stockAudioTone,
        stockAudioVolume,
        eodReportEnabled,
        eodBusinessClosingTime: cleanTime,
        eodAdminEmail: cleanEmail,
        eodAdminPhone: cleanPhone,
      });
      setNotificationEmail(Boolean(updated.notificationEmail));
      setNotificationPush(updated.notificationPush ?? true);
      setNotificationSms(Boolean(updated.notificationSms));
      setStockAudioAlert(updated.stockAudioAlert ?? true);
      setStockAudioTone(updated.stockAudioTone ?? "chime");
      setStockAudioVolume(updated.stockAudioVolume ?? 0.5);
      setEodReportEnabled(Boolean(updated.eodReportEnabled));
      setEodClosingTime(updated.eodBusinessClosingTime ?? "18:00");
      setEodAdminEmail(updated.eodAdminEmail ?? "");
      setEodAdminPhone(updated.eodAdminPhone ?? "");
      setAlertsSavedMsg("Alerts, sound & EOD report preferences saved.");
      toast.success("Alerts & EOD saved", "Notification settings updated.");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to save alerts & EOD settings.";
      setAlertsError(msg);
      toast.error("Save failed", msg);
    } finally {
      setSavingAlerts(false);
    }
  };

  const handleSendDailyReportNow = async () => {
    setAlertsError(null);
    setSendingEodReport(true);
    try {
      const result = await sendDailyReportNow();
      toast.success(
        "EOD Report Dispatched",
        `Daily sales report for ${result.reportDate} sent.`,
      );
      setAlertsSavedMsg(`Daily report for ${result.reportDate} dispatched.`);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to dispatch daily sales report.";
      setAlertsError(msg);
      toast.error("Report dispatch failed", msg);
    } finally {
      setSendingEodReport(false);
    }
  };

  const handleApplyDefaultTimesToOpenDays = () => {
    setHoursError(null);
    setHoursSavedMsg(null);
    const open = businessOpeningTime.trim();
    const close = businessClosingTime.trim();
    if (!HHMM_REGEX.test(open) || !HHMM_REGEX.test(close)) {
      setHoursError("Default open and close times must use HH:MM format.");
      return;
    }
    setWeeklySchedule((prev) =>
      prev.map((d) => (d.closed ? d : { ...d, openTime: open, closeTime: close })),
    );
    toast.info("Times applied", `Set open days to ${open} – ${close}.`);
  };

  const handleSaveBusinessHours = async () => {
    setHoursError(null);
    setHoursSavedMsg(null);

    const open = businessOpeningTime.trim();
    const close = businessClosingTime.trim();
    if (!HHMM_REGEX.test(open) || !HHMM_REGEX.test(close)) {
      setHoursError("Default opening and closing times must use HH:MM format.");
      return;
    }
    for (const day of weeklySchedule) {
      if (
        !HHMM_REGEX.test(day.openTime.trim()) ||
        !HHMM_REGEX.test(day.closeTime.trim())
      ) {
        setHoursError(`Invalid HH:MM time entered for ${day.label}.`);
        return;
      }
    }

    setSavingHours(true);
    try {
      const updated = await updateBusinessHours({
        business247,
        businessOpeningTime: open,
        businessClosingTime: close,
        businessHoursSchedule: weeklySchedule.map((d) => ({
          ...d,
          openTime: d.openTime.trim(),
          closeTime: d.closeTime.trim(),
        })),
        businessHoursNotes: businessHoursNotes.trim(),
      });
      setBusiness247(Boolean(updated.business247));
      setBusinessOpeningTime(updated.businessOpeningTime ?? "08:00");
      setBusinessClosingTime(updated.businessClosingTime ?? "18:00");
      setWeeklySchedule(normalizeSchedule(updated.businessHoursSchedule));
      setBusinessHoursNotes(updated.businessHoursNotes ?? "");
      setHoursSavedMsg("Store operating hours saved.");
      toast.success("Business hours saved", "Weekly schedule updated.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save business hours.";
      setHoursError(msg);
      toast.error("Save failed", msg);
    } finally {
      setSavingHours(false);
    }
  };

  const handleSelectTheme = (pref: ThemePreference) => {
    setAppearanceError(null);
    setPreference(pref);
    const label = `${pref.charAt(0).toUpperCase() + pref.slice(1)}`;
    setAppearanceSavedMsg(`Theme set to ${label}.`);
    toast.info("Theme updated", `Switched to ${label} mode.`);
  };

  const handleSelectAccent = (hex: string) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) {
      setAppearanceError("Enter a valid 6-digit hex color (e.g. #3B82F6).");
      return;
    }
    setAppearanceError(null);
    setHexInput(normalized);
    setAccentColor(normalized);
    setAppearanceSavedMsg(`Accent color applied (${normalized}).`);
    toast.info("Accent color updated", `Applied ${normalized}.`);
  };

  const handleResetAppearance = () => {
    setAppearanceError(null);
    setPreference("system");
    setHexInput(DEFAULT_ACCENT_COLOR);
    setAccentColor(DEFAULT_ACCENT_COLOR);
    setAppearanceSavedMsg("Appearance reset to System theme & default blue.");
    toast.info("Appearance reset", "Restored System theme & default blue.");
  };

  const normalizedTypedHex = normalizeHexColor(hexInput);
  const canApplyTypedHex =
    normalizedTypedHex !== null && normalizedTypedHex !== accentColor;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: spacing.base,
            gap: spacing.base,
            paddingBottom: spacing["3xl"],
          }}
        >
          <SegmentedTabs
            options={settingsTabs}
            value={activeTab}
            onChange={setActiveTab}
            scrollable
          />

          {isReadOnlyStoreAdmin && activeTab !== "theme" ? (
            <View
              style={[
                styles.feedbackBanner,
                {
                  backgroundColor: colors.warningTint,
                  borderColor: colors.warningBorder,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <Lock size={15} color={colors.warningText} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.warningText, flex: 1 },
                ]}
              >
                View-only mode: Only workspace administrators can modify
                store-wide settings. Personal Theme & Security settings remain
                editable.
              </Text>
            </View>
          ) : null}

          {/* TAB 1: BUSINESS INFO */}
          {activeTab === "business" ? (
            <Card>
              <CardHeader bordered>
                <View style={styles.sectionTitleRow}>
                  <View
                    style={[
                      styles.sectionIconBox,
                      {
                        backgroundColor: colors.primaryTint,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <Building2 size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CardTitle>Business & Receipt Setup</CardTitle>
                    <CardDescription>
                      Store identity, currency, tax rate, stock threshold &
                      receipt printing.
                    </CardDescription>
                  </View>
                </View>
              </CardHeader>

              <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Business name *
                  </Text>
                  <Input
                    value={storeName}
                    editable={!isReadOnlyStoreAdmin}
                    onChangeText={(text) => {
                      setStoreName(text);
                      setBusinessError(null);
                      setBusinessSavedMsg(null);
                    }}
                    placeholder="Inventory Pro"
                    leftIcon={
                      <Building2 size={16} color={colors.mutedForeground} />
                    }
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Store address *
                  </Text>
                  <Input
                    value={storeAddress}
                    editable={!isReadOnlyStoreAdmin}
                    onChangeText={(text) => {
                      setStoreAddress(text);
                      setBusinessError(null);
                      setBusinessSavedMsg(null);
                    }}
                    placeholder="Street, digital address, city"
                    multiline
                    numberOfLines={3}
                    leftIcon={
                      <MapPin
                        size={16}
                        color={colors.mutedForeground}
                        style={{ marginTop: 3 }}
                      />
                    }
                    containerStyle={{
                      height: 84,
                      alignItems: "flex-start",
                      paddingVertical: 10,
                    }}
                    style={{ textAlignVertical: "top" }}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Phone number
                  </Text>
                  <Input
                    value={storePhone}
                    editable={!isReadOnlyStoreAdmin}
                    onChangeText={(text) => {
                      setStorePhone(text);
                      setBusinessError(null);
                      setBusinessSavedMsg(null);
                    }}
                    placeholder="+233 54 000 0000"
                    keyboardType="phone-pad"
                    leftIcon={<Phone size={16} color={colors.mutedForeground} />}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Email address
                  </Text>
                  <Input
                    value={storeEmail}
                    editable={!isReadOnlyStoreAdmin}
                    onChangeText={(text) => {
                      setStoreEmail(text);
                      setBusinessError(null);
                      setBusinessSavedMsg(null);
                    }}
                    placeholder="store@company.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    leftIcon={<Mail size={16} color={colors.mutedForeground} />}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Currency
                  </Text>
                  <View style={styles.currencyRow}>
                    {CURRENCY_OPTIONS.map((code) => {
                      const selected = currency === code;
                      return (
                        <Pressable
                          key={code}
                          disabled={isReadOnlyStoreAdmin}
                          onPress={() => {
                            setCurrency(code);
                            setBusinessError(null);
                            setBusinessSavedMsg(null);
                          }}
                          style={({ pressed }) => [
                            styles.currencyChip,
                            {
                              backgroundColor: selected
                                ? colors.primaryTint
                                : colors.cardMuted,
                              borderColor: selected
                                ? colors.primary
                                : colors.border,
                              borderRadius: radii.lg,
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              typography.caption,
                              {
                                color: selected
                                  ? colors.primary
                                  : colors.foreground,
                                fontFamily: selected
                                  ? fontFamilies.bold
                                  : fontFamilies.semibold,
                              },
                            ]}
                          >
                            {code}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.twoColRow}>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.foreground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      Tax rate (%)
                    </Text>
                    <Input
                      value={taxPercentText}
                      editable={!isReadOnlyStoreAdmin}
                      onChangeText={(text) => {
                        setTaxPercentText(text);
                        setBusinessError(null);
                        setBusinessSavedMsg(null);
                      }}
                      placeholder="1"
                      keyboardType="decimal-pad"
                      leftIcon={
                        <Percent size={15} color={colors.mutedForeground} />
                      }
                    />
                  </View>

                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.foreground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      Low-stock threshold
                    </Text>
                    <Input
                      value={stockThresholdText}
                      editable={!isReadOnlyStoreAdmin}
                      onChangeText={(text) => {
                        setStockThresholdText(text);
                        setBusinessError(null);
                        setBusinessSavedMsg(null);
                      }}
                      placeholder="5"
                      keyboardType="number-pad"
                      leftIcon={
                        <Package size={15} color={colors.mutedForeground} />
                      }
                    />
                  </View>
                </View>

                {/* Receipt Printing Preferences */}
                <View
                  style={[
                    styles.subSectionBox,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                    },
                  ]}
                >
                  <View style={styles.switchRow}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        flex: 1,
                      }}
                    >
                      <Printer size={16} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            typography.bodySemibold,
                            { color: colors.foreground },
                          ]}
                        >
                          Print Receipt After Sale
                        </Text>
                        <Text
                          style={[
                            typography.micro,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Prompt/open receipt print sheet after checkout
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={printAfterSale}
                      disabled={isReadOnlyStoreAdmin}
                      onValueChange={(val) => {
                        setPrintAfterSale(val);
                        setBusinessError(null);
                        setBusinessSavedMsg(null);
                      }}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={{ gap: 6, marginTop: 10 }}>
                    <Text
                      style={[
                        typography.micro,
                        {
                          color: colors.mutedForeground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      Receipt Paper Format
                    </Text>
                    <View style={styles.currencyRow}>
                      {PAPER_SIZE_OPTIONS.map((opt) => {
                        const selected = paperSize === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            disabled={isReadOnlyStoreAdmin}
                            onPress={() => {
                              setPaperSize(opt.value);
                              setBusinessError(null);
                              setBusinessSavedMsg(null);
                            }}
                            style={[
                              styles.currencyChip,
                              {
                                backgroundColor: selected
                                  ? colors.primaryTint
                                  : colors.card,
                                borderColor: selected
                                  ? colors.primary
                                  : colors.border,
                                borderRadius: radii.md,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                typography.caption,
                                {
                                  color: selected
                                    ? colors.primary
                                    : colors.foreground,
                                  fontFamily: selected
                                    ? fontFamilies.bold
                                    : fontFamilies.semibold,
                                },
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {businessError ? (
                  <View
                    style={[
                      styles.feedbackBanner,
                      {
                        backgroundColor: colors.dangerTint,
                        borderColor: colors.dangerBorder,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <AlertCircle size={15} color={colors.dangerText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.dangerText, flex: 1 },
                      ]}
                    >
                      {businessError}
                    </Text>
                  </View>
                ) : null}

                {businessSavedMsg ? (
                  <View
                    style={[
                      styles.feedbackBanner,
                      {
                        backgroundColor: colors.successTint,
                        borderColor: colors.successBorder,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <CheckCircle2 size={15} color={colors.successText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.successText, flex: 1 },
                      ]}
                    >
                      {businessSavedMsg}
                    </Text>
                  </View>
                ) : null}
              </CardContent>

              <CardFooter style={styles.footerRow}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, flex: 1 },
                  ]}
                >
                  {isBusinessDirty ? "Unsaved changes" : "Up to date"}
                </Text>
                <Button
                  title={savingBusiness ? "Saving..." : "Save Business Info"}
                  size="sm"
                  loading={savingBusiness}
                  disabled={
                    isReadOnlyStoreAdmin || !isBusinessDirty || savingBusiness
                  }
                  onPress={() => void handleSaveBusinessInfo()}
                />
              </CardFooter>
            </Card>
          ) : null}

          {/* TAB 2: ALERTS & EOD */}
          {activeTab === "alerts" ? (
            <Card>
              <CardHeader bordered>
                <View style={styles.sectionTitleRow}>
                  <View
                    style={[
                      styles.sectionIconBox,
                      {
                        backgroundColor: colors.primaryTint,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <Bell size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CardTitle>Alerts & End-of-Day Reports</CardTitle>
                    <CardDescription>
                      Configure alert channels, low-stock audio chime & EOD
                      report dispatch.
                    </CardDescription>
                  </View>
                </View>
              </CardHeader>

              <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
                {/* Notification Channels */}
                <View
                  style={[
                    styles.subSectionBox,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                      gap: 12,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.bold,
                      },
                    ]}
                  >
                    Notification Channels
                  </Text>

                  {(
                    [
                      {
                        label: "Email Alerts",
                        desc: "Stock warnings & security notices via email",
                        value: notificationEmail,
                        setter: setNotificationEmail,
                      },
                      {
                        label: "In-App & Push Alerts",
                        desc: "Real-time notifications inside Inventory Pro",
                        value: notificationPush,
                        setter: setNotificationPush,
                      },
                      {
                        label: "SMS Alerts",
                        desc: "Critical stock & EOD summaries via SMS",
                        value: notificationSms,
                        setter: setNotificationSms,
                      },
                    ] as const
                  ).map((row) => (
                    <View key={row.label} style={styles.switchRow}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            typography.bodyMedium,
                            { color: colors.foreground },
                          ]}
                        >
                          {row.label}
                        </Text>
                        <Text
                          style={[
                            typography.micro,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {row.desc}
                        </Text>
                      </View>
                      <Switch
                        value={row.value}
                        disabled={isReadOnlyStoreAdmin}
                        onValueChange={(next) => {
                          row.setter(next);
                          setAlertsError(null);
                          setAlertsSavedMsg(null);
                        }}
                        trackColor={{
                          false: colors.border,
                          true: colors.primary,
                        }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  ))}
                </View>

                {/* Low-Stock Audio Alert */}
                <View
                  style={[
                    styles.subSectionBox,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                      gap: 10,
                    },
                  ]}
                >
                  <View style={styles.switchRow}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        flex: 1,
                      }}
                    >
                      <Volume2 size={16} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            typography.bodySemibold,
                            { color: colors.foreground },
                          ]}
                        >
                          Low-Stock Sound Alert
                        </Text>
                        <Text
                          style={[
                            typography.micro,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Play chime when stock drops below threshold
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={stockAudioAlert}
                      disabled={isReadOnlyStoreAdmin}
                      onValueChange={(val) => {
                        setStockAudioAlert(val);
                        setAlertsError(null);
                        setAlertsSavedMsg(null);
                      }}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={{ gap: 6 }}>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Alert Tone
                    </Text>
                    <View style={styles.currencyRow}>
                      {AUDIO_TONE_OPTIONS.map((tone) => {
                        const selected = stockAudioTone === tone.value;
                        return (
                          <Pressable
                            key={tone.value}
                            disabled={isReadOnlyStoreAdmin}
                            onPress={() => {
                              setStockAudioTone(tone.value);
                              setAlertsError(null);
                              setAlertsSavedMsg(null);
                            }}
                            style={[
                              styles.currencyChip,
                              {
                                backgroundColor: selected
                                  ? colors.primaryTint
                                  : colors.card,
                                borderColor: selected
                                  ? colors.primary
                                  : colors.border,
                                borderRadius: radii.md,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                typography.caption,
                                {
                                  color: selected
                                    ? colors.primary
                                    : colors.foreground,
                                  fontFamily: selected
                                    ? fontFamilies.bold
                                    : fontFamilies.semibold,
                                },
                              ]}
                            >
                              {tone.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Volume Level ({Math.round(stockAudioVolume * 100)}%)
                    </Text>
                    <View style={styles.currencyRow}>
                      {AUDIO_VOLUME_PRESETS.map((vol) => {
                        const selected =
                          Math.abs(stockAudioVolume - vol.value) < 0.05;
                        return (
                          <Pressable
                            key={vol.label}
                            disabled={isReadOnlyStoreAdmin}
                            onPress={() => {
                              setStockAudioVolume(vol.value);
                              setAlertsError(null);
                              setAlertsSavedMsg(null);
                            }}
                            style={[
                              styles.currencyChip,
                              {
                                backgroundColor: selected
                                  ? colors.primaryTint
                                  : colors.card,
                                borderColor: selected
                                  ? colors.primary
                                  : colors.border,
                                borderRadius: radii.md,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                typography.caption,
                                {
                                  color: selected
                                    ? colors.primary
                                    : colors.foreground,
                                  fontFamily: selected
                                    ? fontFamilies.bold
                                    : fontFamilies.semibold,
                                },
                              ]}
                            >
                              {vol.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {/* Daily Sales Report (EOD) */}
                <View
                  style={[
                    styles.subSectionBox,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                      gap: 10,
                    },
                  ]}
                >
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          typography.bodySemibold,
                          { color: colors.foreground },
                        ]}
                      >
                        Automated Daily EOD Report
                      </Text>
                      <Text
                        style={[
                          typography.micro,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Send daily revenue & profit digest at store close
                      </Text>
                    </View>
                    <Switch
                      value={eodReportEnabled}
                      disabled={isReadOnlyStoreAdmin}
                      onValueChange={(val) => {
                        setEodReportEnabled(val);
                        setAlertsError(null);
                        setAlertsSavedMsg(null);
                      }}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Report Closing Time (24h HH:MM)
                    </Text>
                    <Input
                      value={eodClosingTime}
                      editable={!isReadOnlyStoreAdmin}
                      onChangeText={(t) => {
                        setEodClosingTime(t);
                        setAlertsError(null);
                        setAlertsSavedMsg(null);
                      }}
                      placeholder="18:00"
                      leftIcon={<Clock size={15} color={colors.mutedForeground} />}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Admin EOD Email
                    </Text>
                    <Input
                      value={eodAdminEmail}
                      editable={!isReadOnlyStoreAdmin}
                      onChangeText={(t) => {
                        setEodAdminEmail(t);
                        setAlertsError(null);
                        setAlertsSavedMsg(null);
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="owner@company.com"
                      leftIcon={<Mail size={15} color={colors.mutedForeground} />}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Admin EOD Phone (SMS)
                    </Text>
                    <Input
                      value={eodAdminPhone}
                      editable={!isReadOnlyStoreAdmin}
                      onChangeText={(t) => {
                        setEodAdminPhone(t);
                        setAlertsError(null);
                        setAlertsSavedMsg(null);
                      }}
                      keyboardType="phone-pad"
                      placeholder="+233..."
                      leftIcon={<Phone size={15} color={colors.mutedForeground} />}
                    />
                  </View>

                  <Button
                    title={
                      sendingEodReport
                        ? "Sending Report..."
                        : "Send Daily Report Now"
                    }
                    variant="outline"
                    size="sm"
                    loading={sendingEodReport}
                    disabled={
                      isReadOnlyStoreAdmin ||
                      isAlertsDirty ||
                      workspaceMode === "mobile_only" ||
                      sendingEodReport
                    }
                    leftIcon={<Send size={14} color={colors.foreground} />}
                    onPress={() => void handleSendDailyReportNow()}
                  />

                  {workspaceMode === "mobile_only" ? (
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Manual EOD dispatch requires a Synced Cloud Workspace
                      connection.
                    </Text>
                  ) : isAlertsDirty ? (
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.warningText },
                      ]}
                    >
                      Save your EOD changes first before sending a report now.
                    </Text>
                  ) : null}
                </View>

                {alertsError ? (
                  <View
                    style={[
                      styles.feedbackBanner,
                      {
                        backgroundColor: colors.dangerTint,
                        borderColor: colors.dangerBorder,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <AlertCircle size={15} color={colors.dangerText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.dangerText, flex: 1 },
                      ]}
                    >
                      {alertsError}
                    </Text>
                  </View>
                ) : null}

                {alertsSavedMsg ? (
                  <View
                    style={[
                      styles.feedbackBanner,
                      {
                        backgroundColor: colors.successTint,
                        borderColor: colors.successBorder,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <CheckCircle2 size={15} color={colors.successText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.successText, flex: 1 },
                      ]}
                    >
                      {alertsSavedMsg}
                    </Text>
                  </View>
                ) : null}
              </CardContent>

              <CardFooter style={styles.footerRow}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, flex: 1 },
                  ]}
                >
                  {isAlertsDirty ? "Unsaved changes" : "Up to date"}
                </Text>
                <Button
                  title={savingAlerts ? "Saving..." : "Save Alerts & EOD"}
                  size="sm"
                  loading={savingAlerts}
                  disabled={
                    isReadOnlyStoreAdmin || !isAlertsDirty || savingAlerts
                  }
                  onPress={() => void handleSaveAlertsAndEod()}
                />
              </CardFooter>
            </Card>
          ) : null}

          {/* TAB 3: BUSINESS HOURS */}
          {activeTab === "hours" ? (
            <Card>
              <CardHeader bordered>
                <View style={styles.sectionTitleRow}>
                  <View
                    style={[
                      styles.sectionIconBox,
                      {
                        backgroundColor: colors.primaryTint,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <Clock size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CardTitle>Business Hours</CardTitle>
                    <CardDescription>
                      Weekly operating schedule, 24/7 mode & special holiday
                      notes.
                    </CardDescription>
                  </View>
                  <Badge
                    label={openStatus.label}
                    variant={openStatus.isOpen ? "success" : "secondary"}
                    dotColor={
                      openStatus.isOpen
                        ? colors.successText
                        : colors.mutedForeground
                    }
                  />
                </View>
              </CardHeader>

              <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  {openStatus.detail}
                </Text>

                {/* Open 24/7 Toggle */}
                <View
                  style={[
                    styles.switchRow,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        typography.bodySemibold,
                        { color: colors.foreground },
                      ]}
                    >
                      Open 24/7
                    </Text>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Override daily schedule when store stays open all day
                    </Text>
                  </View>
                  <Switch
                    value={business247}
                    disabled={isReadOnlyStoreAdmin}
                    onValueChange={(val) => {
                      setBusiness247(val);
                      setHoursError(null);
                      setHoursSavedMsg(null);
                    }}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Default Open / Close Times + Quick Apply */}
                <View
                  style={[
                    styles.subSectionBox,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                      gap: 10,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Default Opening & Closing Times
                  </Text>
                  <View style={styles.twoColRow}>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text
                        style={[
                          typography.micro,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Open (HH:MM)
                      </Text>
                      <Input
                        value={businessOpeningTime}
                        editable={!isReadOnlyStoreAdmin && !business247}
                        onChangeText={(t) => {
                          setBusinessOpeningTime(t);
                          setHoursError(null);
                          setHoursSavedMsg(null);
                        }}
                        placeholder="08:00"
                      />
                    </View>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text
                        style={[
                          typography.micro,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Close (HH:MM)
                      </Text>
                      <Input
                        value={businessClosingTime}
                        editable={!isReadOnlyStoreAdmin && !business247}
                        onChangeText={(t) => {
                          setBusinessClosingTime(t);
                          setHoursError(null);
                          setHoursSavedMsg(null);
                        }}
                        placeholder="18:00"
                      />
                    </View>
                  </View>
                  <Button
                    title="Apply to All Open Days"
                    size="sm"
                    variant="outline"
                    disabled={isReadOnlyStoreAdmin || business247}
                    onPress={handleApplyDefaultTimesToOpenDays}
                  />
                </View>

                {/* 7-Day Weekly Schedule */}
                {!business247 ? (
                  <View style={{ gap: 8 }}>
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.foreground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      Weekly Schedule
                    </Text>
                    {weeklySchedule.map((day, index) => (
                      <View
                        key={day.day}
                        style={[
                          styles.dayRow,
                          {
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                            borderRadius: radii.lg,
                            padding: spacing.md,
                          },
                        ]}
                      >
                        <View style={styles.dayTopRow}>
                          <Text
                            style={[
                              typography.bodySemibold,
                              { color: colors.foreground, flex: 1 },
                            ]}
                          >
                            {day.label}
                          </Text>
                          <Badge
                            label={day.closed ? "Closed" : "Open"}
                            variant={day.closed ? "secondary" : "success"}
                          />
                          <Switch
                            value={!day.closed}
                            disabled={isReadOnlyStoreAdmin}
                            onValueChange={(isOpen) => {
                              setWeeklySchedule((prev) =>
                                prev.map((d, i) =>
                                  i === index ? { ...d, closed: !isOpen } : d,
                                ),
                              );
                              setHoursError(null);
                              setHoursSavedMsg(null);
                            }}
                            trackColor={{
                              false: colors.border,
                              true: colors.primary,
                            }}
                            thumbColor="#FFFFFF"
                          />
                        </View>

                        {!day.closed ? (
                          <View style={styles.twoColRow}>
                            <View style={{ flex: 1, gap: 4 }}>
                              <Text
                                style={[
                                  typography.micro,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                Opens
                              </Text>
                              <Input
                                value={day.openTime}
                                editable={!isReadOnlyStoreAdmin}
                                onChangeText={(t) => {
                                  setWeeklySchedule((prev) =>
                                    prev.map((d, i) =>
                                      i === index ? { ...d, openTime: t } : d,
                                    ),
                                  );
                                  setHoursError(null);
                                  setHoursSavedMsg(null);
                                }}
                                placeholder="08:00"
                              />
                            </View>
                            <View style={{ flex: 1, gap: 4 }}>
                              <Text
                                style={[
                                  typography.micro,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                Closes
                              </Text>
                              <Input
                                value={day.closeTime}
                                editable={!isReadOnlyStoreAdmin}
                                onChangeText={(t) => {
                                  setWeeklySchedule((prev) =>
                                    prev.map((d, i) =>
                                      i === index ? { ...d, closeTime: t } : d,
                                    ),
                                  );
                                  setHoursError(null);
                                  setHoursSavedMsg(null);
                                }}
                                placeholder="18:00"
                              />
                            </View>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Holiday & Special Hours Notes
                  </Text>
                  <Input
                    value={businessHoursNotes}
                    editable={!isReadOnlyStoreAdmin}
                    onChangeText={(t) => {
                      setBusinessHoursNotes(t);
                      setHoursError(null);
                      setHoursSavedMsg(null);
                    }}
                    placeholder="e.g. Closed on public holidays..."
                    multiline
                    numberOfLines={3}
                    containerStyle={{
                      height: 80,
                      alignItems: "flex-start",
                      paddingVertical: 10,
                    }}
                    style={{ textAlignVertical: "top" }}
                  />
                </View>

                {hoursError ? (
                  <View
                    style={[
                      styles.feedbackBanner,
                      {
                        backgroundColor: colors.dangerTint,
                        borderColor: colors.dangerBorder,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <AlertCircle size={15} color={colors.dangerText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.dangerText, flex: 1 },
                      ]}
                    >
                      {hoursError}
                    </Text>
                  </View>
                ) : null}

                {hoursSavedMsg ? (
                  <View
                    style={[
                      styles.feedbackBanner,
                      {
                        backgroundColor: colors.successTint,
                        borderColor: colors.successBorder,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <CheckCircle2 size={15} color={colors.successText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.successText, flex: 1 },
                      ]}
                    >
                      {hoursSavedMsg}
                    </Text>
                  </View>
                ) : null}
              </CardContent>

              <CardFooter style={styles.footerRow}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, flex: 1 },
                  ]}
                >
                  {isHoursDirty ? "Unsaved changes" : "Up to date"}
                </Text>
                <Button
                  title={savingHours ? "Saving..." : "Save Business Hours"}
                  size="sm"
                  loading={savingHours}
                  disabled={isReadOnlyStoreAdmin || !isHoursDirty || savingHours}
                  onPress={() => void handleSaveBusinessHours()}
                />
              </CardFooter>
            </Card>
          ) : null}

          {/* TAB 4: APPEARANCE / THEME + SECURITY LINK */}
          {activeTab === "theme" ? (
            <>
              <Card>
                <CardHeader bordered>
                  <View style={styles.sectionTitleRow}>
                    <View
                      style={[
                        styles.sectionIconBox,
                        {
                          backgroundColor: colors.primaryTint,
                          borderRadius: radii.lg,
                        },
                      ]}
                    >
                      <Palette size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CardTitle>Appearance</CardTitle>
                      <CardDescription>
                        Choose your theme mode and highlight accent color.
                      </CardDescription>
                    </View>
                  </View>
                </CardHeader>

                <CardContent style={{ paddingTop: spacing.base, gap: spacing.lg }}>
                  {/* Theme Mode 3-Tile Selector */}
                  <View style={styles.fieldGroup}>
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.foreground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      Theme
                    </Text>
                    <View style={styles.themeGrid}>
                      {THEME_CHOICES.map((item) => {
                        const selected = preference === item.value;
                        const Icon =
                          item.value === "light"
                            ? Sun
                            : item.value === "dark"
                              ? Moon
                              : Monitor;

                        return (
                          <Pressable
                            key={item.value}
                            onPress={() => handleSelectTheme(item.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            style={({ pressed }) => [
                              styles.themeTile,
                              {
                                borderRadius: radii.xl,
                                borderColor: selected
                                  ? colors.primary
                                  : colors.border,
                                borderWidth: selected ? 2 : 1,
                                backgroundColor: selected
                                  ? colors.primaryTint
                                  : colors.cardMuted,
                                opacity: pressed ? 0.85 : 1,
                              },
                            ]}
                          >
                            <ThemePreviewMini
                              variant={item.value}
                              accent={accentColor}
                            />
                            <View style={styles.themeTileFooter}>
                              <Icon
                                size={14}
                                color={
                                  selected
                                    ? colors.primary
                                    : colors.mutedForeground
                                }
                              />
                              <Text
                                style={[
                                  typography.caption,
                                  {
                                    color: selected
                                      ? colors.primary
                                      : colors.foreground,
                                    fontFamily: selected
                                      ? fontFamilies.bold
                                      : fontFamilies.semibold,
                                  },
                                ]}
                              >
                                {item.label}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Accent Color Picker */}
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <Text
                        style={[
                          typography.caption,
                          {
                            color: colors.foreground,
                            fontFamily: fontFamilies.semibold,
                          },
                        ]}
                      >
                        Accent color
                      </Text>
                      <View style={styles.activeColorPill}>
                        <View
                          style={[
                            styles.activeColorDot,
                            {
                              backgroundColor: accentColor,
                              borderColor: colors.border,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            typography.micro,
                            {
                              color: colors.mutedForeground,
                              fontFamily: fontFamilies.semibold,
                            },
                          ]}
                        >
                          {accentColor}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.swatchRow}>
                      {ACCENT_PRESETS.map((preset) => {
                        const selected = accentColor === preset.hex;
                        return (
                          <Pressable
                            key={preset.hex}
                            onPress={() => handleSelectAccent(preset.hex)}
                            accessibilityLabel={`${preset.label} accent color`}
                            style={({ pressed }) => [
                              styles.swatchButton,
                              {
                                backgroundColor: preset.hex,
                                borderColor: selected
                                  ? colors.foreground
                                  : "transparent",
                                transform: [{ scale: pressed ? 0.94 : 1 }],
                              },
                            ]}
                          >
                            {selected ? <Check size={16} color="#FFFFFF" /> : null}
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={styles.hexInputRow}>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={hexInput}
                          onChangeText={(text) => {
                            setHexInput(text.toUpperCase());
                            setAppearanceError(null);
                            setAppearanceSavedMsg(null);
                          }}
                          placeholder="#3B82F6"
                          autoCapitalize="characters"
                          autoCorrect={false}
                          maxLength={7}
                          leftIcon={
                            <View
                              style={[
                                styles.hexPreviewSquare,
                                {
                                  backgroundColor:
                                    normalizedTypedHex ?? accentColor,
                                  borderColor: colors.border,
                                },
                              ]}
                            />
                          }
                        />
                      </View>
                      <Button
                        title="Apply"
                        size="default"
                        variant="outline"
                        disabled={!canApplyTypedHex}
                        onPress={() => handleSelectAccent(hexInput)}
                      />
                    </View>
                  </View>

                  {appearanceError ? (
                    <View
                      style={[
                        styles.feedbackBanner,
                        {
                          backgroundColor: colors.dangerTint,
                          borderColor: colors.dangerBorder,
                          borderRadius: radii.lg,
                        },
                      ]}
                    >
                      <AlertCircle size={15} color={colors.dangerText} />
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.dangerText, flex: 1 },
                        ]}
                      >
                        {appearanceError}
                      </Text>
                    </View>
                  ) : null}

                  {appearanceSavedMsg ? (
                    <View
                      style={[
                        styles.feedbackBanner,
                        {
                          backgroundColor: colors.successTint,
                          borderColor: colors.successBorder,
                          borderRadius: radii.lg,
                        },
                      ]}
                    >
                      <CheckCircle2 size={15} color={colors.successText} />
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.successText, flex: 1 },
                        ]}
                      >
                        {appearanceSavedMsg}
                      </Text>
                    </View>
                  ) : null}
                </CardContent>

                <CardFooter style={styles.footerRow}>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground, flex: 1 },
                    ]}
                  >
                    Saved automatically on this device
                  </Text>
                  <Button
                    title="Reset"
                    size="sm"
                    variant="ghost"
                    leftIcon={<RotateCcw size={14} color={colors.foreground} />}
                    disabled={
                      preference === "system" &&
                      accentColor === DEFAULT_ACCENT_COLOR
                    }
                    onPress={handleResetAppearance}
                  />
                </CardFooter>
              </Card>

              {/* Direct Security & 2FA Link Card */}
              <Card>
                <Pressable
                  onPress={() => router.push("/security")}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.securityLinkRow,
                    {
                      padding: spacing.base,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.sectionIconBox,
                      {
                        backgroundColor: colors.primaryTint,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <ShieldCheck size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        typography.bodySemibold,
                        { color: colors.foreground },
                      ]}
                    >
                      Account Security & 2FA
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground, marginTop: 1 },
                      ]}
                    >
                      Password, two-factor auth, team policy & sessions
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.mutedForeground} />
                </Pressable>
              </Card>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionIconBox: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldGroup: {
    gap: 6,
  },
  twoColRow: {
    flexDirection: "row",
    gap: 10,
  },
  subSectionBox: {
    borderWidth: 1,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dayRow: {
    borderWidth: 1,
    gap: 10,
  },
  dayTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  currencyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  currencyChip: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  themeGrid: {
    flexDirection: "row",
    gap: 10,
  },
  themeTile: {
    flex: 1,
    padding: 8,
    gap: 8,
  },
  themeTileFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  previewFrame: {
    height: 54,
    borderRadius: 8,
    overflow: "hidden",
    flexDirection: "row",
  },
  previewHalf: {
    flex: 1,
    padding: 5,
    justifyContent: "space-between",
  },
  previewSingleInner: {
    flex: 1,
    borderRadius: 5,
    padding: 6,
    justifyContent: "space-between",
  },
  previewCardMock: {
    borderRadius: 4,
    padding: 4,
    gap: 3,
  },
  previewMockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
  },
  previewLine: {
    height: 4,
    borderRadius: 2,
  },
  previewLineShort: {
    height: 4,
    borderRadius: 2,
    width: "65%",
  },
  previewPillMock: {
    height: 6,
    width: 18,
    borderRadius: 9999,
    alignSelf: "flex-end",
  },
  activeColorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeColorDot: {
    width: 12,
    height: 12,
    borderRadius: 9999,
    borderWidth: 1,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 2,
  },
  swatchButton: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  hexInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  hexPreviewSquare: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
  },
  securityLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
