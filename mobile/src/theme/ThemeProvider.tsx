import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import {
  getStoredAppearance,
  setStoredAppearance,
} from "@/api/tokenStorage";
import {
  createTheme,
  DEFAULT_ACCENT_COLOR,
  normalizeHexColor,
  type AppTheme,
  type ThemeMode,
  type ThemePreference,
} from "./tokens";

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  preference: ThemePreference;
  accentColor: string;
  setPreference: (pref: ThemePreference) => void;
  setAccentColor: (hex: string) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [accentColor, setAccentColorState] = useState<string>(DEFAULT_ACCENT_COLOR);

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await getStoredAppearance();
      if (!active || !saved) return;
      if (
        saved.preference === "light" ||
        saved.preference === "dark" ||
        saved.preference === "system"
      ) {
        setPreferenceState(saved.preference);
      }
      if (saved.accentColor) {
        const valid = normalizeHexColor(saved.accentColor);
        if (valid) {
          setAccentColorState(valid);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      void setStoredAppearance({ preference: pref, accentColor });
    },
    [accentColor],
  );

  const setAccentColor = useCallback(
    (hex: string) => {
      const normalized = normalizeHexColor(hex);
      if (!normalized) return;
      setAccentColorState(normalized);
      void setStoredAppearance({ preference, accentColor: normalized });
    },
    [preference],
  );

  const resolvedMode: ThemeMode =
    preference === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : preference;

  const toggleMode = useCallback(() => {
    setPreferenceState((prev) => {
      const current: ThemeMode =
        prev === "system" ? (systemScheme === "dark" ? "dark" : "light") : prev;
      const next: ThemePreference = current === "dark" ? "light" : "dark";
      void setStoredAppearance({ preference: next, accentColor });
      return next;
    });
  }, [systemScheme, accentColor]);

  const theme = useMemo(
    () => createTheme(resolvedMode, accentColor),
    [resolvedMode, accentColor],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode: resolvedMode,
      preference,
      accentColor,
      setPreference,
      setAccentColor,
      toggleMode,
    }),
    [theme, resolvedMode, preference, accentColor, setPreference, setAccentColor, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return ctx;
}
