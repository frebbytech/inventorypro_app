"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { getSettings } from "@/actions/settings";
import { hexToHslChannels } from "@/utils/color";
import { Settings } from "@/types/globals";
import { playStockAlertSound, SoundTone } from "@/utils/audioAlert";

// ── Constants ──

const DEFAULT_ACCENT = "#196b94";
const CACHE_KEY_BASE = "app:settings";
const CACHE_VERSION = 1; // bump when the Settings shape changes
const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const HUE_SHIFT = 45;

/** Exported so other code can invalidate / read the same cache entry. */
export const settingsQueryKey = (userId?: string) =>
  ["settings", userId ?? "current"] as const;

// ── Query function ──

async function fetchSettings(): Promise<Settings> {
  const result = await getSettings();
  if (!result.success || !result.data) {
    throw new Error("Failed to fetch settings");
  }
  return result.data;
}

// ── localStorage cache helpers ──
// Every access is guarded: SSR, private mode, disabled storage and quota
// errors must never break the provider.

interface CachedSettings {
  v: number;
  data: Settings;
}

const getCacheKey = (userId?: string) =>
  userId ? `${CACHE_KEY_BASE}:${userId}` : CACHE_KEY_BASE;

function readCache(key: string): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSettings;
    if (
      parsed?.v !== CACHE_VERSION ||
      typeof parsed.data !== "object" ||
      parsed.data === null ||
      Array.isArray(parsed.data)
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: Settings) {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedSettings = { v: CACHE_VERSION, data };
    window.localStorage.setItem(key, JSON.stringify(payload));
    window.localStorage.setItem(
      "old_business_name",
      payload?.data?.business_name || "Inventory Pro",
    );
  } catch {
    // Storage full or unavailable — the cache is best-effort.
  }
}

/** Call on logout so the next person on this browser doesn't see cached settings. */
export function clearCachedSettings(userId?: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getCacheKey(userId));
  } catch {
    /* ignore */
  }
}

// ── Theme styles (pure, lives outside the component) ──

function applyAccentStyles(hexColor: string, isDark: boolean) {
  if (typeof document === "undefined" || !hexColor?.startsWith("#")) return;

  const style = document.documentElement.style;
  const hsl = hexToHslChannels(hexColor);
  const { h, s } = hsl;

  // Primary
  style.setProperty("--primary", hsl.toString());
  style.setProperty("--ring", hsl.toString());

  // Accent
  style.setProperty("--accent", `${h} ${s}% ${isDark ? 15 : 95}%`);
  style.setProperty("--accent-foreground", `${h} ${s}% ${isDark ? 85 : 25}%`);

  // Charts
  const base = isDark ? 65 : 48;
  const chartColors = [
    `${h} ${s}% ${base}%`,
    `${(h + HUE_SHIFT) % 360} ${Math.max(s - 10, 40)}% ${base + (isDark ? -5 : 5)}%`,
    `${(h + HUE_SHIFT * 2) % 360} ${Math.max(s - 15, 35)}% ${base}%`,
    `${(h + HUE_SHIFT * 3) % 360} ${Math.max(s - 5, 45)}% ${base + (isDark ? 5 : -5)}%`,
    `${(h + 180) % 360} ${s}% ${base - 10}%`,
  ];
  chartColors.forEach((color, i) =>
    style.setProperty(`--chart-${i + 1}`, color),
  );
}

// ── Context ──

interface SettingsContextType {
  // Appearance
  accentColor: string;
  setAccentColor: (color: string) => void;
  theme: string | undefined;
  setTheme: (theme: string) => void;

  // Audio alerts
  isStockAudioAlertEnabled: boolean;
  stockAlertThreshold: number;
  playStockAlert: (customTone?: SoundTone, customVolume?: number) => void;

  // Full settings data
  settings: Settings | null;
  /** Merges into the query cache (and so the UI + localStorage). Returns false if nothing to update. */
  updateNewSettings: (data: Partial<Settings>) => boolean;
  /** True only until the first settings (cached or fetched) are available. */
  isLoading: boolean;
  refetchSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

function SettingsLoader() {
  return (
    <div className="container h-svh w-svw flex items-center justify-center">
      <div className="loader">
        <div className="loader__bar bg-primary" />
        <div className="loader__bar bg-primary" />
        <div className="loader__bar bg-primary" />
        <div className="loader__bar bg-primary" />
        <div className="loader__bar bg-primary" />
        <div className="loader__ball bg-accent" />
      </div>
    </div>
  );
}

// ── Provider ──
// Must be rendered inside <QueryClientProvider>.

interface SettingsProviderProps {
  children: React.ReactNode;
  /** Namespaces both the query key and the localStorage cache per user. */
  userId?: string;
}

export function SettingsProvider({ children, userId }: SettingsProviderProps) {
  const pathname = usePathname();
  const isSuperAdminRoute = Boolean(pathname?.startsWith("/super-admin"));
  const isAuthRoute = Boolean(pathname?.startsWith("/auth"));
  const skipTenantSettings = isSuperAdminRoute || isAuthRoute;
  const { setTheme: setNextTheme, resolvedTheme, theme } = useTheme();
  const queryClient = useQueryClient();

  const storageKey = getCacheKey(userId);
  const queryKey = useMemo(() => settingsQueryKey(userId), [userId]);

  const [accentColor, setAccentColor] = useState<string>(DEFAULT_ACCENT);
  const [mounted, setMounted] = useState<boolean>(false);

  // Keep the latest setTheme in a ref so effects below don't depend on it.
  const setNextThemeRef = useRef(setNextTheme);
  useEffect(() => {
    setNextThemeRef.current = setNextTheme;
  }, [setNextTheme]);

  // ── Fetch with React Query ──
  // initialData = the localStorage copy. initialDataUpdatedAt: 0 marks it as
  // stale, so it renders instantly and is then revalidated from the DB.
  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: fetchSettings,
    enabled: !skipTenantSettings,
    initialData: () => readCache(storageKey) ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: STALE_TIME,
    retry: 1,
  });

  const settings = data ?? null;

  const refetchSettings = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // ── Update settings locally (query cache → UI → localStorage) ──
  const updateNewSettings = useCallback(
    (updated: Partial<Settings>): boolean => {
      if (!updated || Object.keys(updated).length === 0) return false;
      queryClient.setQueryData<Settings>(
        queryKey,
        (prev) => ({ ...prev, ...updated }) as Settings,
      );

      if (data) writeCache(storageKey, data);
      return true;
    },
    [queryClient, queryKey],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Apply theme / accent from settings when those values change ──
  const settingsTheme = data?.theme;
  const settingsAccent = data?.accent_color;

  useEffect(() => {
    if (settingsTheme) setNextThemeRef.current(settingsTheme);
  }, [settingsTheme]);

  useEffect(() => {
    if (settingsAccent?.startsWith("#")) setAccentColor(settingsAccent);
  }, [settingsAccent]);

  // ── Persist a copy to localStorage whenever settings change ──
  useEffect(() => {
    // console.log(data)

    if (data) writeCache(storageKey, data);
  }, [data, storageKey]);

  // ── Keep other tabs in sync ──
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey || e.newValue === null) return;
      const next = readCache(storageKey);
      if (next) queryClient.setQueryData<Settings>(queryKey, next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, queryKey, queryClient]);

  // ── Apply CSS variables when accent or resolved theme changes ──
  useEffect(() => {
    if (!mounted) return;
    applyAccentStyles(accentColor, resolvedTheme === "dark");
  }, [accentColor, resolvedTheme, mounted]);

  // ── Audio alerts ──
  const isStockAudioAlertEnabled = data?.stock_audio_alert ?? true;
  const stockAlertThreshold = data?.stock_alert_threshold ?? 5;
  const stockAudioTone = data?.stock_audio_tone;
  const stockAudioVolume = data?.stock_audio_volume;

  const playStockAlert = useCallback(
    (customTone?: SoundTone, customVolume?: number) => {
      if (!isStockAudioAlertEnabled && !customTone) return;
      playStockAlertSound({
        tone: customTone || stockAudioTone || "chime",
        volume: customVolume ?? stockAudioVolume ?? 0.5,
      });
    },
    [isStockAudioAlertEnabled, stockAudioTone, stockAudioVolume],
  );

  // ── Memoized context value: consumers only re-render when something changes ──
  const value = useMemo<SettingsContextType>(
    () => ({
      accentColor,
      setAccentColor,
      theme,
      setTheme: setNextTheme,
      isStockAudioAlertEnabled,
      stockAlertThreshold,
      playStockAlert,
      settings,
      updateNewSettings,
      isLoading,
      refetchSettings,
    }),
    [
      accentColor,
      theme,
      setNextTheme,
      isStockAudioAlertEnabled,
      stockAlertThreshold,
      playStockAlert,
      settings,
      updateNewSettings,
      isLoading,
      refetchSettings,
    ],
  );

  if (!isSuperAdminRoute && !mounted) return null;
  if (!skipTenantSettings && isLoading && !settings) return <SettingsLoader />;

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// "use client";

// import React, {
//   createContext,
//   useContext,
//   useState,
//   useEffect,
//   useCallback,
// } from "react";
// import { useTheme } from "next-themes";
// import { getSettings } from "@/actions/settings";
// import { hexToHslChannels, HSLChannels } from "@/utils/color";
// import { Settings } from "@/types/globals";
// import { playStockAlertSound, SoundTone } from "@/utils/audioAlert";
// // ── Context Types ──

// interface SettingsContextType {
//   // Appearance
//   accentColor: string;
//   setAccentColor: (color: string) => void;
//   theme: string | undefined;
//   setTheme: (theme: string) => void;

//   // Audio Alerts
//   isStockAudioAlertEnabled: boolean;
//   stockAlertThreshold: number;
//   playStockAlert: (customTone?: SoundTone, customVolume?: number) => void;

//   // Full settings data
//   settings: Settings | null;
//   updateNewSettings: (data: Partial<Settings>) => void;
//   isLoading: boolean;
//   refetchSettings: () => Promise<void>;
// }

// const SettingsContext = createContext<SettingsContextType | undefined>(
//   undefined,
// );

// export function useSettings() {
//   const context = useContext(SettingsContext);
//   if (!context) {
//     throw new Error("useSettings must be used within a SettingsProvider");
//   }
//   return context;
// }

// // ── Provider ──
// export function SettingsProvider({ children }: { children: React.ReactNode }) {
//   const isLoaded = true;
//   const { setTheme: setNextTheme, resolvedTheme, theme } = useTheme();

//   const [accentColor, setAccentColor] = useState<string>("#3b82f6");
//   const [settings, setSettings] = useState<Settings | null>(null);
//   const [isLoading, setIsLoading] = useState<boolean>(true);
//   const [mounted, setMounted] = useState<boolean>(false);

//   // ── Apply theme styles to CSS variables ──
//   const applyGlobalThemeStyles = (hexColor: string, isDarkMode: boolean) => {
//     if (typeof window === "undefined" || !hexColor?.startsWith("#")) return;

//     const root = document.documentElement;
//     const hsl: HSLChannels = hexToHslChannels(hexColor);

//     // Primary
// root.style.setProperty("--primary", hsl.toString());
// root.style.setProperty("--ring", hsl.toString());

// // Primary foreground (Highly Visible & Accessible)
// // const foregroundText = isDarkMode
// //   ? hsl.l < 50
// //     ? "0 0% 98%"       // Bright text on dark backgrounds
// //     : "240 10% 3.9%"   // Dark text on bright backgrounds
// //   : hsl.l > 50
// //     ? "240 10% 3.9%"   // Dark text on bright backgrounds
// //     : "0 0% 98%";      // Bright text on dark backgrounds

// // root.style.setProperty("--primary-foreground", foregroundText);

//     // Accent
//     const accentBgLightness = isDarkMode ? 15 : 95;
//     const accentTextLightness = isDarkMode ? 85 : 25;
//     root.style.setProperty(
//       "--accent",
//       `${hsl.h} ${hsl.s}% ${accentBgLightness}%`,
//     );
//     root.style.setProperty(
//       "--accent-foreground",
//       `${hsl.h} ${hsl.s}% ${accentTextLightness}%`,
//     );

//     // Cards & Popovers
//     // if (isDarkMode) {
//       // const darkSaturation = Math.min(hsl.s, 15);
//     //   root.style.setProperty("--card", `${hsl.h} ${darkSaturation}% 10%`);
//     //   root.style.setProperty("--card-foreground", `${hsl.h} 10% 95%`);
//       // root.style.setProperty("--popover", `${hsl.h} ${darkSaturation}% 9%`);
//       // root.style.setProperty("--popover-foreground", `${hsl.h} 10% 95%`);
//     //   root.style.setProperty("--border", `${hsl.h} ${darkSaturation}% 16%`);
//     //   root.style.setProperty("--input", `${hsl.h} ${darkSaturation}% 16%`);
//     // } else {
//       // const lightSaturation = Math.min(hsl.s, 10);
//     //   root.style.setProperty("--card", `${hsl.h} ${lightSaturation}% 100%`);
//     //   root.style.setProperty("--card-foreground", `240 10% 3.9%`);
//       // root.style.setProperty("--popover", `${hsl.h} ${lightSaturation}% 100%`);
//       // root.style.setProperty("--popover-foreground", `240 10% 3.9%`);
//     //   root.style.setProperty("--border", `${hsl.h} ${lightSaturation}% 90%`);
//     //   root.style.setProperty("--input", `${hsl.h} ${lightSaturation}% 90%`);
//     // }

//     // Charts
//     const baseLightness = isDarkMode ? 65 : 48;
//     const hueShift = 45;
//     const chartColors = [
//       `${hsl.h} ${hsl.s}% ${baseLightness}%`,
//       `${(hsl.h + hueShift) % 360} ${Math.max(hsl.s - 10, 40)}% ${
//         baseLightness + (isDarkMode ? -5 : 5)
//       }%`,
//       `${(hsl.h + hueShift * 2) % 360} ${Math.max(hsl.s - 15, 35)}% ${baseLightness}%`,
//       `${(hsl.h + hueShift * 3) % 360} ${Math.max(hsl.s - 5, 45)}% ${
//         baseLightness + (isDarkMode ? 5 : -5)
//       }%`,
//       `${(hsl.h + 180) % 360} ${hsl.s}% ${baseLightness - 10}%`,
//     ];
//     chartColors.forEach((colorString, index) => {
//       root.style.setProperty(`--chart-${index + 1}`, colorString);
//     });
//   };

//   // ── Fetch settings from DB ──
//   const fetchSettings = async () => {
//     try {
//       const result = await getSettings();
//       if (result.success && result.data) {
//         setSettings(result.data);

//         // Apply theme
//         if (result.data.theme) {
//           setNextTheme(result.data.theme);
//         }

//         // Apply accent color
//         if (result.data.accent_color?.startsWith("#")) {
//           setAccentColor(result.data.accent_color);
//         }
//       }
//     } catch (error) {
//       console.warn("Failed to fetch settings:", error);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   //update a settings
//   const updateNewSettings = async (
//     updated: Partial<Settings>,
//   ): Promise<boolean> => {
//     // 1. Guard clause: Exit early if there is nothing to update
//     if (!updated || Object.keys(updated).length === 0) return false;

//     setIsLoading(true);
//     try {
//       // 2. State updates use modern nullish coalescing and clean functional merging
//       setSettings((prev) => ({ ...prev, ...updated }) as Settings);
//       return true;
//     } catch (error) {
//       console.warn("Error updating settings:", error);
//       return false;
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   // ── Lifecycle ──
//   useEffect(() => {
//     setMounted(true);
//   }, []);

//   useEffect(() => {
//     if (!mounted) return;
//     fetchSettings();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [mounted]);

//   // Apply styles whenever accent or theme changes
//   useEffect(() => {
//     if (!mounted) return;
//     const isDark = resolvedTheme === "dark";
//     applyGlobalThemeStyles(accentColor, isDark);
//   }, [accentColor, resolvedTheme, mounted]);

//   // ── Audio Alert trigger ──
//   const isStockAudioAlertEnabled = settings?.stock_audio_alert ?? true;
//   const stockAlertThreshold = settings?.stock_alert_threshold ?? 5;

//   const playStockAlert = useCallback(
//     (customTone?: SoundTone, customVolume?: number) => {
//       if (!isStockAudioAlertEnabled && !customTone) return;
//       playStockAlertSound({
//         tone: customTone || settings?.stock_audio_tone || "chime",
//         volume:
//           customVolume !== undefined
//             ? customVolume
//             : (settings?.stock_audio_volume ?? 0.5),
//       });
//     },
//     [
//       isStockAudioAlertEnabled,
//       settings?.stock_audio_tone,
//       settings?.stock_audio_volume,
//     ],
//   );

//   // ── Context value ──
//   const value: SettingsContextType = {
//     accentColor,
//     setAccentColor,
//     theme,
//     setTheme: setNextTheme,
//     isStockAudioAlertEnabled,
//     stockAlertThreshold,
//     playStockAlert,
//     settings,
//     updateNewSettings,
//     isLoading,
//     refetchSettings: fetchSettings,
//   };

//   if (!mounted) return null;

//   if (!isLoaded || isLoading) {
//     return (
//       <div className="container h-svh w-svw flex items-center justify-center">
//         <div className="loader">
//           <div className="loader__bar bg-primary"></div>
//           <div className="loader__bar bg-primary"></div>
//           <div className="loader__bar bg-primary"></div>
//           <div className="loader__bar bg-primary"></div>
//           <div className="loader__bar bg-primary"></div>
//           <div className="loader__ball bg-accent"></div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <SettingsContext.Provider value={value}>
//       {children}
//     </SettingsContext.Provider>
//   );
// }
