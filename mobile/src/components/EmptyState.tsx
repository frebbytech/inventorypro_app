import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography } = theme;

  return (
    <View
      style={[
        styles.box,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: radii.xl,
          padding: spacing.xl,
          gap: spacing.sm,
        },
      ]}
    >
      {icon}
      <Text
        style={[
          typography.subtitle,
          { color: colors.foreground, textAlign: "center" },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.mutedForeground, textAlign: "center" },
        ]}
      >
        {description}
      </Text>
      {action ? <View style={{ marginTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
