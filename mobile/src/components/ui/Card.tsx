import React from "react";
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.xl,
        },
        theme.shadows.xs,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({
  children,
  bordered = false,
  style,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        {
          paddingHorizontal: theme.spacing.base,
          paddingVertical: theme.spacing.md + 2,
          borderBottomWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  const { theme } = useTheme();
  return (
    <Text
      style={[
        theme.typography.subtitle,
        { color: theme.colors.cardForeground },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function CardDescription({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  const { theme } = useTheme();
  return (
    <Text
      style={[
        theme.typography.body,
        { color: theme.colors.mutedForeground, marginTop: 2 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function CardContent({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        {
          paddingHorizontal: theme.spacing.base,
          paddingBottom: theme.spacing.base,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardFooter({
  children,
  bordered = true,
  style,
}: {
  children: React.ReactNode;
  bordered?: boolean;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        {
          paddingHorizontal: theme.spacing.base,
          paddingVertical: theme.spacing.md,
          borderTopWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.cardMuted,
          borderBottomLeftRadius: theme.radii.xl,
          borderBottomRightRadius: theme.radii.xl,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: "hidden",
  },
});
