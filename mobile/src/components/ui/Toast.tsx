import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react-native";
import { useTheme } from "@/theme";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ShowToastOptions {
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
}

interface ToastState {
  id: number;
  title: string;
  message?: string;
  type: ToastType;
  duration: number;
}

export interface ToastContextValue {
  show: (options: ShowToastOptions) => void;
  success: (title: string, message?: string, duration?: number) => void;
  error: (title: string, message?: string, duration?: number) => void;
  info: (title: string, message?: string, duration?: number) => void;
  warning: (title: string, message?: string, duration?: number) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3200;
const ERROR_DURATION_MS = 4200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, shadows } = theme;
  const insets = useSafeAreaInsets();

  const [toast, setToast] = useState<ToastState | null>(null);
  const [rendered, setRendered] = useState(false);

  const anim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCounterRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setToast(null);
        setRendered(false);
      }
    });
  }, [anim, clearTimer]);

  const show = useCallback(
    (options: ShowToastOptions) => {
      const cleanTitle = options.title.trim();
      if (!cleanTitle) return;

      const type: ToastType = options.type ?? "info";
      const duration =
        typeof options.duration === "number" && options.duration > 0
          ? options.duration
          : type === "error"
            ? ERROR_DURATION_MS
            : DEFAULT_DURATION_MS;

      clearTimer();
      idCounterRef.current += 1;
      setToast({
        id: idCounterRef.current,
        title: cleanTitle,
        message: options.message?.trim() || undefined,
        type,
        duration,
      });
      setRendered(true);

      anim.setValue(0);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 90,
        friction: 11,
      }).start();

      timerRef.current = setTimeout(() => {
        hide();
      }, duration);
    },
    [anim, clearTimer, hide],
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const success = useCallback(
    (title: string, message?: string, duration?: number) => {
      show({ title, message, type: "success", duration });
    },
    [show],
  );

  const error = useCallback(
    (title: string, message?: string, duration?: number) => {
      show({ title, message, type: "error", duration });
    },
    [show],
  );

  const info = useCallback(
    (title: string, message?: string, duration?: number) => {
      show({ title, message, type: "info", duration });
    },
    [show],
  );

  const warning = useCallback(
    (title: string, message?: string, duration?: number) => {
      show({ title, message, type: "warning", duration });
    },
    [show],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ show, success, error, info, warning, hide }),
    [show, success, error, info, warning, hide],
  );

  const visual = useMemo(() => {
    const type = toast?.type ?? "info";
    switch (type) {
      case "success":
        return {
          borderColor: colors.successBorder,
          badgeBg: colors.successTint,
          accentColor: colors.successText,
          Icon: CheckCircle2,
        };
      case "error":
        return {
          borderColor: colors.dangerBorder,
          badgeBg: colors.dangerTint,
          accentColor: colors.dangerText,
          Icon: AlertCircle,
        };
      case "warning":
        return {
          borderColor: colors.warningBorder,
          badgeBg: colors.warningTint,
          accentColor: colors.warningText,
          Icon: AlertTriangle,
        };
      case "info":
      default:
        return {
          borderColor: colors.primary,
          badgeBg: colors.primaryTint,
          accentColor: colors.primary,
          Icon: Info,
        };
    }
  }, [
    colors.dangerBorder,
    colors.dangerText,
    colors.dangerTint,
    colors.primary,
    colors.primaryTint,
    colors.successBorder,
    colors.successText,
    colors.successTint,
    colors.warningBorder,
    colors.warningText,
    colors.warningTint,
    toast?.type,
  ]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, 0],
  });

  const topOffset = Math.max(insets.top, Platform.OS === "web" ? 12 : 8) + 8;

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}

        {rendered && toast ? (
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.overlay,
              {
                top: topOffset,
                left: spacing.base,
                right: spacing.base,
                opacity: anim,
                transform: [{ translateY }],
              },
            ]}
          >
            <Pressable
              onPress={hide}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={({ pressed }) => [
                styles.toastCard,
                shadows.card,
                {
                  backgroundColor: colors.card,
                  borderColor: visual.borderColor,
                  borderRadius: radii.xl,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 3,
                  opacity: pressed ? 0.94 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.iconBadge,
                  {
                    backgroundColor: visual.badgeBg,
                    borderRadius: radii.lg,
                  },
                ]}
              >
                <visual.Icon size={18} color={visual.accentColor} />
              </View>

              <View style={styles.textBlock}>
                <Text
                  numberOfLines={2}
                  style={[
                    typography.bodySemibold,
                    { color: colors.foreground },
                  ]}
                >
                  {toast.title}
                </Text>
                {toast.message ? (
                  <Text
                    numberOfLines={2}
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground, marginTop: 2 },
                    ]}
                  >
                    {toast.message}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={hide}
                hitSlop={10}
                accessibilityLabel="Dismiss notification"
                style={({ pressed }) => [
                  styles.closeBtn,
                  {
                    backgroundColor: colors.muted,
                    borderRadius: radii.md,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <X size={14} color={colors.mutedForeground} />
              </Pressable>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    zIndex: 9999,
    elevation: 16,
    alignItems: "center",
  },
  toastCard: {
    width: "100%",
    maxWidth: 540,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
  },
  iconBadge: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
