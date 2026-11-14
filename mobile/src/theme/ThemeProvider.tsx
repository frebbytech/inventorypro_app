import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import {
  createTheme,
  type AppTheme,
  type ThemeMode,
  type ThemePreference,
} from "./tokens";

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>("system");

  const resolvedMode: ThemeMode =
    preference === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : preference;

  const toggleMode = useCallback(() => {
    setPreference((prev) => {
      const current: ThemeMode =
        prev === "system" ? (systemScheme === "dark" ? "dark" : "light") : prev;
      return current === "dark" ? "light" : "dark";
    });
  }, [systemScheme]);

  const theme = useMemo(() => createTheme(resolvedMode), [resolvedMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode: resolvedMode,
      preference,
      setPreference,
      toggleMode,
    }),
    [theme, resolvedMode, preference, toggleMode],
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
