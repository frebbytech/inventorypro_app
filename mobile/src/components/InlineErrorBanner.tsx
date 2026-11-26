import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertCircle,
  LogIn,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react-native";
import { useTheme } from "@/theme";
import {
  normalizeError,
  type MobileErrorCategory,
} from "@/utils/errorHandler";

export interface InlineErrorBannerProps {
  message: string;
  title?: string;
  error?: unknown;
  category?: MobileErrorCategory;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  onSignIn?: () => void;
  signInLabel?: string;
  onDismiss?: () => void;
}

export function InlineErrorBanner({
  message,
  title,
  error,
  category,
  onRetry,
  retryLabel = "Retry",
  retrying = false,
  onSignIn,
  signInLabel = "Sign In",
  onDismiss,
}: InlineErrorBannerProps) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, fontFamilies } = theme;

  const normalized = error
    ? normalizeError(error, { fallback: message, silent: true })
    : normalizeError(message, { fallback: message, silent: true });

  const resolvedCategory = category ?? normalized.category;
  const displayMessage =
    normalized.userMessage || message || "Something went wrong. Please try again.";

  const isWarningTone =
    resolvedCategory === "network" ||
    resolvedCategory === "timeout" ||
    resolvedCategory === "session" ||
    resolvedCategory === "rate_limited";

  const bg = isWarningTone ? colors.warningTint : colors.dangerTint;
  const border = isWarningTone ? colors.warningBorder : colors.dangerBorder;
  const fg = isWarningTone ? colors.warningText : colors.dangerText;

  const resolvedTitle =
    title ||
    (resolvedCategory === "session"
      ? "Session expired"
      : resolvedCategory === "network" || resolvedCategory === "timeout"
        ? "Connection issue"
        : undefined);

  const IconComponent =
    resolvedCategory === "network" || resolvedCategory === "timeout"
      ? WifiOff
      : resolvedCategory === "session"
        ? LogIn
        : AlertCircle;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: radii.xl,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <IconComponent size={18} color={fg} />
        </View>

        <View style={styles.copyBlock}>
          {resolvedTitle ? (
            <Text
              style={[
                typography.bodySemibold,
                { color: fg, fontFamily: fontFamilies.semibold },
              ]}
            >
              {resolvedTitle}
            </Text>
          ) : null}
          <Text
            style={[
              typography.caption,
              {
                color: fg,
                marginTop: resolvedTitle ? 2 : 0,
              },
            ]}
          >
            {displayMessage}
          </Text>
        </View>

        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            accessibilityLabel="Dismiss error"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.dismissBtn,
              { opacity: pressed ? 0.65 : 1 },
            ]}
          >
            <X size={16} color={fg} />
          </Pressable>
        ) : null}
      </View>

      {onRetry || onSignIn ? (
        <View style={styles.actionsRow}>
          {onSignIn ? (
            <Pressable
              onPress={onSignIn}
              accessibilityRole="button"
              accessibilityLabel={signInLabel}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                  borderRadius: radii.lg,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <LogIn size={14} color={colors.primaryForeground} />
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.primaryForeground,
                    fontFamily: fontFamilies.semibold,
                  },
                ]}
              >
                {signInLabel}
              </Text>
            </Pressable>
          ) : null}

          {onRetry ? (
            <Pressable
              onPress={onRetry}
              disabled={retrying}
              accessibilityRole="button"
              accessibilityLabel={retryLabel}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: border,
                  borderRadius: radii.lg,
                  opacity: retrying ? 0.55 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <RefreshCw size={14} color={fg} />
              <Text
                style={[
                  typography.caption,
                  { color: fg, fontFamily: fontFamilies.semibold },
                ]}
              >
                {retrying ? "Retrying..." : retryLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconWrap: {
    marginTop: 1,
  },
  copyBlock: {
    flex: 1,
    minWidth: 0,
  },
  dismissBtn: {
    minWidth: 44,
    minHeight: 44,
    marginTop: -10,
    marginRight: -10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingLeft: 28,
  },
  actionBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
