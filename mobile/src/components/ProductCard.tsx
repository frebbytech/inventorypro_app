import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, Barcode, ChevronRight, Package } from "lucide-react-native";
import { useTheme } from "@/theme";
import type { ProductItem } from "@/types/domain";
import { LOW_STOCK_THRESHOLD } from "@/types/domain";
import { formatCurrency } from "@/utils/formatters";
import { StockMeter } from "./StockMeter";
import { Badge, Card } from "./ui";

export function ProductCard({
  product,
  alertThreshold,
  onPress,
}: {
  product: ProductItem;
  alertThreshold?: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, fontFamilies } = theme;

  const threshold =
    typeof alertThreshold === "number" && alertThreshold >= 1
      ? Math.trunc(alertThreshold)
      : product.lowStockThreshold || LOW_STOCK_THRESHOLD;

  const isOut = product.stockQuantity <= 0;
  const isLow = product.stockQuantity > 0 && product.stockQuantity < threshold;
  const isFlagged = isOut || isLow;

  const stockBadgeVariant = isOut ? "danger" : isLow ? "warning" : "success";
  const stockLabel = isOut
    ? "Out of Stock"
    : isLow
      ? `Low · ${product.stockQuantity} < ${threshold}`
      : `${product.stockQuantity} in stock`;

  const highlightBorderColor = isOut
    ? colors.dangerBorder
    : isLow
      ? colors.warningBorder
      : colors.border;

  const accentBarColor = isOut ? colors.danger : colors.warning;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <Card
        style={{
          borderColor: highlightBorderColor,
          borderWidth: isFlagged ? 1.5 : 1,
        }}
      >
        <View style={styles.cardWrap}>
          {isFlagged ? (
            <View
              style={[
                styles.accentRail,
                { backgroundColor: accentBarColor },
              ]}
            />
          ) : null}

          <View style={{ flex: 1, padding: spacing.base, gap: spacing.md }}>
            {/* Low-stock / out-of-stock highlight banner */}
            {isFlagged ? (
              <View
                style={[
                  styles.alertStrip,
                  {
                    backgroundColor: isOut ? colors.dangerTint : colors.warningTint,
                    borderColor: isOut ? colors.dangerBorder : colors.warningBorder,
                    borderRadius: radii.md,
                    paddingHorizontal: spacing.sm + 2,
                    paddingVertical: spacing.xs + 1,
                  },
                ]}
              >
                <AlertTriangle
                  size={13}
                  color={isOut ? colors.dangerText : colors.warningText}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    typography.micro,
                    {
                      color: isOut ? colors.dangerText : colors.warningText,
                      flex: 1,
                    },
                  ]}
                >
                  {isOut
                    ? `Out of stock — restock needed (limit < ${threshold})`
                    : `Below threshold: ${product.stockQuantity} left (limit < ${threshold})`}
                </Text>
                <StockMeter stock={product.stockQuantity} threshold={threshold} />
              </View>
            ) : null}

            {/* Top badges */}
            <View style={styles.topRow}>
              <View style={styles.badgePair}>
                <Badge
                  label={product.active ? "Active" : "Disabled"}
                  variant={product.active ? "success" : "danger"}
                />
                <Badge label={stockLabel} variant={stockBadgeVariant} />
              </View>
              <ChevronRight size={18} color={colors.mutedForeground} />
            </View>

            {/* Identity row */}
            <View style={styles.identityRow}>
              <View
                style={[
                  styles.thumb,
                  {
                    backgroundColor: isFlagged
                      ? isOut
                        ? colors.dangerTint
                        : colors.warningTint
                      : colors.muted,
                    borderColor: isFlagged ? highlightBorderColor : colors.border,
                    borderRadius: radii.lg,
                  },
                ]}
              >
                <Package
                  size={20}
                  color={
                    isOut
                      ? colors.dangerText
                      : isLow
                        ? colors.warningText
                        : colors.mutedForeground
                  }
                />
              </View>

              <View style={styles.nameBlock}>
                <Text
                  numberOfLines={1}
                  style={[typography.micro, { color: colors.mutedForeground }]}
                >
                  {product.categoryName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    typography.subtitle,
                    { color: colors.foreground, marginTop: 1 },
                  ]}
                >
                  {product.name}
                </Text>
                <View style={styles.barcodeRow}>
                  <Barcode size={12} color={colors.mutedForeground} />
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.caption,
                      typography.tabular,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {product.barcode || "No barcode assigned"}
                  </Text>
                </View>
              </View>
            </View>

            {/* 3-column pricing box */}
            <View
              style={[
                styles.priceBox,
                {
                  backgroundColor: colors.muted,
                  borderRadius: radii.lg,
                  padding: spacing.sm + 2,
                },
              ]}
            >
              <View style={styles.priceCol}>
                <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                  Unit Price
                </Text>
                <Text
                  style={[
                    typography.bodySemibold,
                    typography.tabular,
                    {
                      color: colors.foreground,
                      fontFamily: fontFamilies.bold,
                      marginTop: 2,
                    },
                  ]}
                >
                  {formatCurrency(product.unitPrice)}
                </Text>
              </View>

              <View style={styles.priceCol}>
                <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                  Cost Price
                </Text>
                <Text
                  style={[
                    typography.bodyMedium,
                    typography.tabular,
                    { color: colors.mutedForeground, marginTop: 2 },
                  ]}
                >
                  {formatCurrency(product.costPrice)}
                </Text>
              </View>

              <View style={[styles.priceCol, { alignItems: "flex-end" }]}>
                <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                  Stock Value
                </Text>
                <Text
                  style={[
                    typography.bodySemibold,
                    typography.tabular,
                    { color: colors.foreground, marginTop: 2 },
                  ]}
                >
                  {formatCurrency(product.stockValue)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    flexDirection: "row",
  },
  accentRail: {
    width: 4,
  },
  alertStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  badgePair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  barcodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  priceBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  priceCol: {
    flex: 1,
  },
});
