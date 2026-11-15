import type { TextStyle, ViewStyle } from "react-native";

/**
 * Design tokens extracted directly from the InventoryPro Next.js POS repository:
 * - src/app/globals.css (:root and .dark HSL CSS custom properties)
 * - tailwind.config.ts (radii, typography scale, semantic colors, shadows)
 * - src/components/ui/{button,badge,card,input,tabs}.tsx
 */

export type ThemeMode = "light" | "dark";
export type ThemePreference = "system" | ThemeMode;

export interface ColorTokens {
  mode: ThemeMode;
  background: string;
  foreground: string;
  card: string;
  cardMuted: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  primaryTint: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  destructiveTint: string;
  border: string;
  input: string;
  ring: string;
  // Brand & status tokens from tailwind.config.ts + dashboard components
  success: string;
  successText: string;
  successTint: string;
  successBorder: string;
  warning: string;
  warningText: string;
  warningTint: string;
  warningBorder: string;
  danger: string;
  dangerText: string;
  dangerTint: string;
  dangerBorder: string;
  // Navigation & tab bar surfaces (derived from --sidebar-* and --card)
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  headerBackground: string;
  // Demo mode banner accent
  demoBannerBg: string;
  demoBannerBorder: string;
  demoBannerText: string;
  // Chart palette (--chart-1 .. --chart-5)
  chart: readonly [string, string, string, string, string];
}

export const lightColors: ColorTokens = {
  mode: "light",
  background: "#F5F5F5", // hsl(0, 0%, 96%)
  foreground: "#041335", // hsl(222.2, 87.4%, 11.2%)
  card: "#FFFFFF", // hsl(0, 0%, 100%)
  cardMuted: "#F8FAFC",
  cardForeground: "#0F172A", // hsl(222.2, 47.4%, 11.2%)
  popover: "#FFFFFF",
  popoverForeground: "#0F172A",
  primary: "#3B82F6", // hsl(217.2, 91.2%, 59.8%)
  primaryHover: "#2563EB",
  primaryForeground: "#FFFFFF",
  primaryTint: "rgba(59, 130, 246, 0.10)",
  secondary: "#E2E8F0", // hsl(214.3, 31.8%, 91.4%)
  secondaryForeground: "#0F172A",
  muted: "#F1F5F9", // hsl(210, 40%, 96.1%)
  mutedForeground: "#64748B", // hsl(215.4, 16.3%, 46.9%)
  accent: "#F1F5F9",
  accentForeground: "#0F172A",
  destructive: "#DC2626", // hsl(0, 72.2%, 50.6%)
  destructiveForeground: "#FFFFFF",
  destructiveTint: "rgba(220, 38, 38, 0.10)",
  border: "#D7E2EA", // hsl(214.3, 31.8%, 88%)
  input: "#D7E2EA",
  ring: "#3B82F6",
  success: "#219653",
  successText: "#059669",
  successTint: "rgba(16, 185, 129, 0.12)",
  successBorder: "rgba(16, 185, 129, 0.30)",
  warning: "#FFA70B",
  warningText: "#D97706",
  warningTint: "rgba(245, 158, 11, 0.14)",
  warningBorder: "rgba(245, 158, 11, 0.35)",
  danger: "#D34053",
  dangerText: "#E11D48",
  dangerTint: "rgba(244, 63, 94, 0.12)",
  dangerBorder: "rgba(244, 63, 94, 0.30)",
  tabBarBackground: "#FFFFFF",
  tabBarBorder: "#D7E2EA",
  tabBarActive: "#3B82F6",
  tabBarInactive: "#64748B",
  headerBackground: "#FFFFFF",
  demoBannerBg: "rgba(59, 130, 246, 0.08)",
  demoBannerBorder: "rgba(59, 130, 246, 0.28)",
  demoBannerText: "#1D4ED8",
  chart: ["#3B82F6", "#2EB88A", "#E88C30", "#AF57DB", "#E23670"],
};

export const darkColors: ColorTokens = {
  mode: "dark",
  background: "#070B13", // hsl(222.2, 47.4%, 4.9%)
  foreground: "#F6FAFE", // hsl(210, 80%, 98%)
  card: "#0A101D", // hsl(222.2, 47.4%, 7.5%)
  cardMuted: "#0F172A",
  cardForeground: "#F8FAFC", // hsl(210, 40%, 98%)
  popover: "#0A101D",
  popoverForeground: "#F8FAFC",
  primary: "#3B82F6", // hsl(217.2, 91.2%, 59.8%)
  primaryHover: "#60A5FA",
  primaryForeground: "#FFFFFF",
  primaryTint: "rgba(59, 130, 246, 0.18)",
  secondary: "#1E293B", // hsl(217.2, 32.6%, 17.5%)
  secondaryForeground: "#F8FAFC",
  muted: "#1E293B",
  mutedForeground: "#94A3B8", // hsl(215, 20.2%, 65.1%)
  accent: "#1E293B",
  accentForeground: "#F8FAFC",
  destructive: "#7F1D1D", // hsl(0, 62.8%, 30.6%)
  destructiveForeground: "#F8FAFC",
  destructiveTint: "rgba(239, 68, 68, 0.16)",
  border: "#1E293B", // hsl(217.2, 32.6%, 17.5%)
  input: "#1E293B",
  ring: "#3B82F6",
  success: "#219653",
  successText: "#34D399",
  successTint: "rgba(16, 185, 129, 0.16)",
  successBorder: "rgba(52, 211, 153, 0.30)",
  warning: "#FFA70B",
  warningText: "#FBBF24",
  warningTint: "rgba(245, 158, 11, 0.16)",
  warningBorder: "rgba(251, 191, 36, 0.32)",
  danger: "#D34053",
  dangerText: "#FB7185",
  dangerTint: "rgba(244, 63, 94, 0.18)",
  dangerBorder: "rgba(251, 113, 133, 0.30)",
  tabBarBackground: "#0A101D",
  tabBarBorder: "#1E293B",
  tabBarActive: "#3B82F6",
  tabBarInactive: "#94A3B8",
  headerBackground: "#0A101D",
  demoBannerBg: "rgba(59, 130, 246, 0.15)",
  demoBannerBorder: "rgba(96, 165, 250, 0.35)",
  demoBannerText: "#93C5FD",
  chart: ["#3B82F6", "#2EB88A", "#E88C30", "#AF57DB", "#E23670"],
};

export const fontFamilies = {
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
} as const;

export const typography = {
  titleXl: {
    fontFamily: fontFamilies.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
  } satisfies TextStyle,
  titleLg: {
    fontFamily: fontFamilies.bold,
    fontSize: 28,
    lineHeight: 35,
    letterSpacing: -0.5,
  } satisfies TextStyle,
  titleMd: {
    fontFamily: fontFamilies.semibold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
  } satisfies TextStyle,
  titleSm: {
    fontFamily: fontFamilies.semibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.25,
  } satisfies TextStyle,
  titleXsm: {
    fontFamily: fontFamilies.semibold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
  } satisfies TextStyle,
  subtitle: {
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.15,
  } satisfies TextStyle,
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  bodyMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  bodySemibold: {
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 20,
  } satisfies TextStyle,
  caption: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  } satisfies TextStyle,
  micro: {
    fontFamily: fontFamilies.semibold,
    fontSize: 11,
    lineHeight: 14,
  } satisfies TextStyle,
  tabular: {
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,
} as const;

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
} as const;

export const radii = {
  xs: 2,
  sm: 4, // calc(var(--radius) - 4px)
  md: 6, // calc(var(--radius) - 2px)
  lg: 8, // var(--radius) = 0.5rem
  xl: 12, // rounded-xl used across cards, inputs, tabs, KPI grids
  "2xl": 16,
  full: 9999,
} as const;

export const shadows: Record<"none" | "xs" | "sm" | "card", ViewStyle> = {
  none: {},
  xs: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
};

export interface AppTheme {
  colors: ColorTokens;
  typography: typeof typography;
  fontFamilies: typeof fontFamilies;
  spacing: typeof spacing;
  radii: typeof radii;
  shadows: typeof shadows;
}

export const DEFAULT_ACCENT_COLOR = "#3B82F6";

export function isValidHexColor(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex.trim());
}

export function normalizeHexColor(hex: string): string | null {
  const trimmed = hex.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return isValidHexColor(withHash) ? withHash.toUpperCase() : null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(59, 130, 246, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function adjustHexBrightness(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp(factor >= 1 ? rgb.r + (255 - rgb.r) * (factor - 1) : rgb.r * factor);
  const g = clamp(factor >= 1 ? rgb.g + (255 - rgb.g) * (factor - 1) : rgb.g * factor);
  const b = clamp(factor >= 1 ? rgb.b + (255 - rgb.b) * (factor - 1) : rgb.b * factor);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function getContrastingForeground(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#FFFFFF";
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.68 ? "#0F172A" : "#FFFFFF";
}

export function createTheme(
  mode: ThemeMode,
  accentColor: string = DEFAULT_ACCENT_COLOR,
): AppTheme {
  const base = mode === "dark" ? darkColors : lightColors;
  const normalizedAccent = normalizeHexColor(accentColor) ?? DEFAULT_ACCENT_COLOR;
  const isDefault = normalizedAccent === DEFAULT_ACCENT_COLOR;

  const colors: ColorTokens = isDefault
    ? base
    : {
        ...base,
        primary: normalizedAccent,
        primaryHover:
          mode === "dark"
            ? adjustHexBrightness(normalizedAccent, 1.18)
            : adjustHexBrightness(normalizedAccent, 0.85),
        primaryForeground: getContrastingForeground(normalizedAccent),
        primaryTint: hexToRgba(normalizedAccent, mode === "dark" ? 0.18 : 0.1),
        ring: normalizedAccent,
        tabBarActive: normalizedAccent,
        demoBannerBg: hexToRgba(normalizedAccent, mode === "dark" ? 0.15 : 0.08),
        demoBannerBorder: hexToRgba(normalizedAccent, mode === "dark" ? 0.35 : 0.28),
        demoBannerText:
          mode === "dark"
            ? adjustHexBrightness(normalizedAccent, 1.35)
            : adjustHexBrightness(normalizedAccent, 0.78),
      };

  return {
    colors,
    typography,
    fontFamilies,
    spacing,
    radii,
    shadows,
  };
}
