import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useTheme } from "@/theme";
import type { StockAlertItem } from "@/types/domain";
import { formatCurrency } from "@/utils/formatters";
import { StockMeter } from "./StockMeter";

export function LowStockRow({
  item,
  onPress,
  showBorder = true,
}: {
  item: StockAlertItem;
  onPress: () => void;
  showBorder?: boolean;
}) {
  const { theme } = useTheme();
  const { colors, typography, spacing, fontFamilies } = theme;
  const isOut = item.stock <= 0;
  const statusColor = isOut ? colors.dangerText : colors.warningText;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: spacing.base,
          paddingVertical: spacing.md,
          borderBottomWidth: showBorder ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: colors.border,
          backgroundColor: pressed ? colors.muted : colors.card,
        },
      ]}
    >
      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[typography.bodySemibold, { color: colors.foreground }]}
        >
          {item.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]}
        >
          {item.categoryName}
        </Text>
      </View>

      <StockMeter stock={item.stock} threshold={item.threshold} />

      <View style={styles.right}>
        <Text
          style={[
            typography.caption,
            typography.tabular,
            { color: statusColor, fontFamily: fontFamilies.semibold },
          ]}
        >
          {isOut ? "Out of stock" : `${item.stock} left`}
        </Text>
        <Text
          style={[
            typography.caption,
            typography.tabular,
            { color: colors.mutedForeground, marginTop: 2 },
          ]}
        >
          {formatCurrency(item.sellingPrice)}
        </Text>
      </View>

      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  right: {
    alignItems: "flex-end",
    minWidth: 78,
  },
});
