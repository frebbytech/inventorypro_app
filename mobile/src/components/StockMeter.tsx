import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/theme";
import { LOW_STOCK_THRESHOLD } from "@/types/domain";

/**
 * Visual stock meter scaled cleanly up to 8 pips regardless of how large
 * the user-configured low-stock threshold is.
 */
export function StockMeter({
  stock,
  threshold = LOW_STOCK_THRESHOLD,
}: {
  stock: number;
  threshold?: number;
}) {
  const { theme } = useTheme();
  const safeThreshold = Math.max(1, Math.trunc(threshold));
  const pipCount = Math.min(safeThreshold, 8);
  const clampedStock = Math.max(0, stock);
  const filledCount =
    clampedStock <= 0
      ? 0
      : clampedStock >= safeThreshold
        ? pipCount
        : Math.max(1, Math.round((clampedStock / safeThreshold) * pipCount));

  const isOut = stock <= 0;
  const activeColor = isOut
    ? theme.colors.danger
    : stock < safeThreshold
      ? theme.colors.warning
      : theme.colors.success;

  return (
    <View
      style={styles.row}
      accessibilityLabel={`${stock} of ${safeThreshold} threshold units`}
    >
      {Array.from({ length: pipCount }, (_, index) => {
        const filled = index < filledCount;
        return (
          <View
            key={index}
            style={[
              styles.pip,
              {
                backgroundColor: filled ? activeColor : theme.colors.muted,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  pip: {
    width: 6,
    height: 14,
    borderRadius: 1,
  },
});
