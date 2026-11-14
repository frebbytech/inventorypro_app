import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/theme";
import { LOW_STOCK_THRESHOLD } from "@/types/domain";

/**
 * 5-pip visual stock meter ported from src/components/admin/dashboard/AdminStockAlerts.tsx.
 */
export function StockMeter({
  stock,
  threshold = LOW_STOCK_THRESHOLD,
}: {
  stock: number;
  threshold?: number;
}) {
  const { theme } = useTheme();
  const isOut = stock <= 0;
  const activeColor = isOut
    ? theme.colors.danger
    : stock < threshold
      ? theme.colors.warning
      : theme.colors.success;

  return (
    <View style={styles.row} accessibilityLabel={`${stock} of ${threshold} threshold units`}>
      {Array.from({ length: threshold }, (_, index) => {
        const filled = index < stock;
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
