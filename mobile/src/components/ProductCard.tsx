import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Barcode, ChevronRight, Package } from "lucide-react-native";
import { useTheme } from "@/theme";
import type { ProductItem } from "@/types/domain";
import { LOW_STOCK_THRESHOLD } from "@/types/domain";
import { formatCurrency } from "@/utils/formatters";
import { Badge, Card } from "./ui";

export function ProductCard({
  product,
  onPress,
}: {
  product: ProductItem;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, fontFamilies } = theme;

  const isOut = product.stockQuantity <= 0;
  const isLow =
    product.stockQuantity > 0 && product.stockQuantity < LOW_STOCK_THRESHOLD;

  const stockBadgeVariant = isOut ? "danger" : isLow ? "warning" : "success";
  const stockLabel = isOut
    ? "Out of Stock"
    : `${product.stockQuantity} in stock`;

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
      <Card>
        <View style={{ padding: spacing.base, gap: spacing.md }}>
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

          {/* Identity row matching ProductGridView.tsx */}
          <View style={styles.identityRow}>
            <View
              style={[
                styles.thumb,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <Package size={20} color={colors.mutedForeground} />
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
                  {product.barcode}
                </Text>
              </View>
            </View>
          </View>

          {/* 2-column pricing box matching ProductGridView bg-muted/40 */}
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
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
