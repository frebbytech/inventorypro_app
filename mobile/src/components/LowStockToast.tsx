import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, Filter, X } from "lucide-react-native";
import { useTheme } from "@/theme";

export interface LowStockToastProps {
  visible: boolean;
  lowCount: number;
  outCount: number;
  threshold: number;
  isFiltered: boolean;
  onFilterLowStock: () => void;
  onDismiss: () => void;
}

export function LowStockToast({
  visible,
  lowCount,
  outCount,
  threshold,
  isFiltered,
  onFilterLowStock,
  onDismiss,
}: LowStockToastProps) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, fontFamilies, shadows } = theme;

  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 95,
      friction: 12,
    }).start();
  }, [anim, visible]);

  const totalFlagged = lowCount + outCount;
  if (!visible || totalFlagged <= 0) {
    return null;
  }

  const hasOnlyOut = lowCount === 0 && outCount > 0;
  const accentColor = hasOnlyOut ? colors.dangerText : colors.warningText;
  const badgeBg = hasOnlyOut ? colors.dangerTint : colors.warningTint;
  const borderColor = hasOnlyOut ? colors.dangerBorder : colors.warningBorder;

  const parts: string[] = [];
  if (lowCount > 0) parts.push(`${lowCount} low`);
  if (outCount > 0) parts.push(`${outCount} out`);
  const breakdown = parts.join(" · ");

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          bottom: spacing.base,
          left: spacing.base,
          right: spacing.base,
          opacity: anim,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.toast,
          shadows.card,
          {
            backgroundColor: colors.card,
            borderColor,
            borderRadius: radii.xl,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm + 3,
          },
        ]}
        accessibilityRole="alert"
      >
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: badgeBg,
              borderRadius: radii.lg,
            },
          ]}
        >
          <AlertTriangle size={17} color={accentColor} />
        </View>

        <View style={styles.textBlock}>
          <Text
            numberOfLines={1}
            style={[
              typography.bodySemibold,
              { color: colors.foreground },
            ]}
          >
            Low Stock: {totalFlagged} {totalFlagged === 1 ? "item" : "items"} &lt;{" "}
            {threshold} units
          </Text>
          <Text
            numberOfLines={1}
            style={[
              typography.caption,
              typography.tabular,
              { color: colors.mutedForeground, marginTop: 1 },
            ]}
          >
            {breakdown}
          </Text>
        </View>

        {!isFiltered ? (
          <Pressable
            onPress={onFilterLowStock}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: hasOnlyOut ? colors.danger : colors.warning,
                borderRadius: radii.md,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: spacing.xs + 3,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Filter size={12} color="#FFFFFF" />
            <Text
              style={[
                typography.caption,
                {
                  color: "#FFFFFF",
                  fontFamily: fontFamilies.semibold,
                },
              ]}
            >
              Filter
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityLabel="Dismiss low stock toast"
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
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    zIndex: 30,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
  },
  iconCircle: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
