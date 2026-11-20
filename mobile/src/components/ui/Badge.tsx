import React from "react";
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "danger";

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  dotColor?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Badge({
  label,
  variant = "default",
  dotColor,
  style,
  textStyle,
}: BadgeProps) {
  const { theme } = useTheme();
  const { colors, radii, typography, spacing } = theme;

  const variantMap: Record<
    BadgeVariant,
    { bg: string; border: string; text: string }
  > = {
    default: {
      bg: colors.primary,
      border: "transparent",
      text: colors.primaryForeground,
    },
    secondary: {
      bg: colors.secondary,
      border: "transparent",
      text: colors.secondaryForeground,
    },
    destructive: {
      bg: colors.destructive,
      border: "transparent",
      text: colors.destructiveForeground,
    },
    outline: {
      bg: "transparent",
      border: colors.border,
      text: colors.foreground,
    },
    success: {
      bg: colors.successTint,
      border: colors.successBorder,
      text: colors.successText,
    },
    warning: {
      bg: colors.warningTint,
      border: colors.warningBorder,
      text: colors.warningText,
    },
    danger: {
      bg: colors.dangerTint,
      border: colors.dangerBorder,
      text: colors.dangerText,
    },
  };

  const palette = variantMap[variant] ?? variantMap.default;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: radii.md,
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: spacing.xxs + 1,
        },
        style,
      ]}
    >
      {dotColor ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: dotColor, marginRight: spacing.xs + 1 },
          ]}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          typography.caption,
          { color: palette.text, fontFamily: theme.fontFamilies.semibold },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
  },
});
