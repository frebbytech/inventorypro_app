import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/theme";

export type ButtonVariant =
  | "default"
  | "destructive"
  | "secondary"
  | "outline"
  | "ghost"
  | "link";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends Omit<PressableProps, "style"> {
  title?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  children?: React.ReactNode;
}

export function Button({
  title,
  variant = "default",
  size = "default",
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  children,
  ...rest
}: ButtonProps) {
  const { theme } = useTheme();
  const { colors, radii, spacing, fontFamilies } = theme;

  const isDisabled = disabled || loading;

  const variantStyles: Record<
    ButtonVariant,
    { bg: string; border: string; text: string }
  > = {
    default: {
      bg: colors.primary,
      border: colors.primary,
      text: colors.primaryForeground,
    },
    destructive: {
      bg: colors.destructive,
      border: colors.destructive,
      text: "#FFFFFF",
    },
    secondary: {
      bg: colors.secondary,
      border: colors.secondary,
      text: colors.secondaryForeground,
    },
    outline: {
      bg: colors.card,
      border: colors.border,
      text: colors.foreground,
    },
    ghost: {
      bg: "transparent",
      border: "transparent",
      text: colors.foreground,
    },
    link: {
      bg: "transparent",
      border: "transparent",
      text: colors.primary,
    },
  };

  const sizeStyles: Record<
    ButtonSize,
    { height: number; paddingHorizontal: number; fontSize: number; width?: number }
  > = {
    default: { height: 44, paddingHorizontal: spacing.lg, fontSize: 14 },
    sm: { height: 34, paddingHorizontal: spacing.md + 2, fontSize: 12 },
    lg: { height: 48, paddingHorizontal: spacing["2xl"], fontSize: 16 },
    icon: { height: 40, width: 40, paddingHorizontal: 0, fontSize: 14 },
  };

  const v = variantStyles[variant];
  const s = sizeStyles[size];

  return (
    <Pressable
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        {
          height: s.height,
          width: s.width,
          paddingHorizontal: s.paddingHorizontal,
          borderRadius: radii.md,
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: variant === "outline" ? 1 : 0,
          opacity: isDisabled ? 0.45 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <View style={styles.content}>
          {leftIcon}
          {children ? (
            children
          ) : title ? (
            <Text
              numberOfLines={1}
              style={[
                {
                  color: v.text,
                  fontSize: s.fontSize,
                  fontFamily: fontFamilies.semibold,
                  letterSpacing: size === "lg" ? 0.4 : 0.2,
                  textDecorationLine: variant === "link" ? "underline" : "none",
                },
                textStyle,
              ]}
            >
              {title}
            </Text>
          ) : null}
          {rightIcon}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
