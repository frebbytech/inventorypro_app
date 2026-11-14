import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";

export interface TabOption<T extends string> {
  value: T;
  label: string;
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
  const { colors, radii, spacing, typography, fontFamilies } = theme;

  const content = options.map((opt) => {
    const active = opt.value === value;
    return (
      <Pressable
        key={opt.value}
        onPress={() => onChange(opt.value)}
        style={({ pressed }) => [
          styles.trigger,
          !scrollable && styles.flexTrigger,
          {
            borderRadius: radii.lg,
            paddingHorizontal: spacing.md + 2,
            paddingVertical: spacing.sm - 1,
            backgroundColor: active ? colors.primary : "transparent",
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            typography.caption,
            {
              fontFamily: fontFamilies.semibold,
              color: active ? "#FFFFFF" : colors.mutedForeground,
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
        style={[
          styles.container,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: 5,
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
      style={[
        styles.container,
        styles.fullRow,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radii.xl,
          padding: 5,
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
    alignItems: "center",
    justifyContent: "center",
  },
  flexTrigger: {
    flex: 1,
  },
});
