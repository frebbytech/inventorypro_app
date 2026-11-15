import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";

export interface TabOption<T extends string> {
  value: T;
  label: string;
  icon?: (active: boolean) => React.ReactNode;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (next: T) => void;
  scrollable?: boolean;
}) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, fontFamilies, shadows } = theme;

  const content = options.map((opt) => {
    const active = opt.value === value;
    return (
      <Pressable
        key={opt.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(opt.value)}
        style={({ pressed }) => [
          styles.trigger,
          !scrollable && styles.flexTrigger,
          {
            borderRadius: radii.lg,
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.sm + 1,
            backgroundColor: active ? colors.primary : "transparent",
            opacity: pressed ? 0.85 : active ? 1 : 0.85,
          },
          active ? shadows.xs : undefined,
        ]}
      >
        {opt.icon ? opt.icon(active) : null}
        <Text
          numberOfLines={1}
          style={[
            typography.caption,
            {
              fontFamily: fontFamilies.semibold,
              color: active ? colors.primaryForeground : colors.mutedForeground,
              letterSpacing: 0.2,
            },
          ]}
        >
          {opt.label}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <View
        accessibilityRole="tablist"
        style={[
          styles.container,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: 6,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollRow}
        >
          {content}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.container,
        styles.fullRow,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radii.xl,
          padding: 6,
        },
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
  },
  fullRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scrollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  flexTrigger: {
    flex: 1,
  },
});
