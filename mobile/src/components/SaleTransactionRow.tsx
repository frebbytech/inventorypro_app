import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Receipt } from "lucide-react-native";
import { useTheme } from "@/theme";
import type { SaleTransactionSummary } from "@/types/domain";
import {
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
} from "@/utils/formatters";
import { Badge, Card } from "./ui";

export function SaleTransactionRow({
  sale,
  onPress,
}: {
  sale: SaleTransactionSummary;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, fontFamilies } = theme;

  const isCompleted = sale.status === "completed";
  const isRefunded = sale.status === "refunded";

  const statusVariant = isCompleted
    ? "success"
    : isRefunded
      ? "warning"
      : "danger";
  const statusDot = isCompleted
    ? colors.success
    : isRefunded
      ? colors.warning
      : colors.danger;

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
        <View style={{ padding: spacing.base, gap: spacing.sm + 2 }}>
          <View style={styles.topRow}>
            <View style={styles.receiptLeft}>
              <View
                style={[
                  styles.iconBox,
                  {
                    backgroundColor: colors.primaryTint,
                    borderRadius: radii.lg,
                  },
                ]}
              >
                <Receipt size={16} color={colors.primary} />
              </View>
              <View style={styles.metaCol}>
                <Text
                  numberOfLines={1}
                  style={[
                    typography.bodySemibold,
                    typography.tabular,
                    { color: colors.foreground },
                  ]}
                >
                  {sale.receiptNo}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  {sale.customerName} · Cashier: {sale.cashierName}
                </Text>
              </View>
            </View>

            <View style={styles.amountCol}>
              <Text
                style={[
                  typography.subtitle,
                  typography.tabular,
                  { color: colors.foreground, fontFamily: fontFamilies.bold },
                ]}
              >
                {formatCurrency(sale.totalAmount)}
              </Text>
              <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                {sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.bottomRow,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
                paddingTop: spacing.sm + 2,
              },
            ]}
          >
            <View style={styles.badges}>
              <Badge
                label={capitalizeLabel(sale.status)}
                variant={statusVariant}
                dotColor={statusDot}
              />
              <Badge label={capitalizeLabel(sale.paymentMode)} variant="outline" />
            </View>

            <View style={styles.timeWrap}>
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                {formatDateTime(sale.saleDate)}
              </Text>
              <ChevronRight size={15} color={colors.mutedForeground} />
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
    gap: 10,
  },
  receiptLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  metaCol: {
    flex: 1,
    minWidth: 0,
  },
  amountCol: {
    alignItems: "flex-end",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
