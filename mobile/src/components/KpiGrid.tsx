import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Receipt,
  ShoppingCart,
} from "lucide-react-native";
import { useTheme } from "@/theme";
import type { TodayKpiSummary } from "@/types/domain";
import { formatCurrency, formatNumber } from "@/utils/formatters";

export function KpiGrid({ kpis }: { kpis: TodayKpiSummary }) {
  const { theme } = useTheme();
  const { colors, radii, spacing, typography, fontFamilies } = theme;

  const roundedDelta = Math.round(kpis.todayVsYesterdayRevenueDelta * 10) / 10;
  const isUp = roundedDelta > 0;
  const isDown = roundedDelta < 0;

  const needsAttention = kpis.outOfStockCount + kpis.lowStockCount;
  const hasOutOfStock = kpis.outOfStockCount > 0;

  return (
    <View
      style={[
        styles.gridContainer,
        {
          backgroundColor: colors.border, // Hairline divider background matching web gap-px bg-border
          borderColor: colors.border,
          borderRadius: radii.xl,
        },
      ]}
    >
      {/* Hero Cell: Today's Revenue */}
      <View
        style={[
          styles.cell,
          {
            backgroundColor: colors.card,
            padding: spacing.base + 2,
          },
        ]}
      >
        <View style={styles.labelRow}>
          <Text style={[typography.bodyMedium, { color: colors.mutedForeground }]}>
            Today&apos;s revenue
          </Text>
          <Banknote size={16} color={colors.mutedForeground} />
        </View>

        <Text
          style={[
            typography.titleXl,
            typography.tabular,
            { color: colors.foreground, marginTop: spacing.sm },
          ]}
        >
          {formatCurrency(kpis.todayRevenue)}
        </Text>

        <View style={[styles.footerRow, { marginTop: spacing.md }]}>
          <View style={styles.deltaWrap}>
            {isUp ? (
              <ArrowUpRight size={14} color={colors.successText} />
            ) : isDown ? (
              <ArrowDownRight size={14} color={colors.dangerText} />
            ) : null}
            <Text
              style={[
                typography.caption,
                typography.tabular,
                {
                  fontFamily: fontFamilies.semibold,
                  color: isUp
                    ? colors.successText
                    : isDown
                      ? colors.dangerText
                      : colors.mutedForeground,
                },
              ]}
            >
              {isUp ? "+" : isDown ? "-" : ""}
              {Math.abs(roundedDelta)}%
            </Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              vs yesterday
            </Text>
          </View>

          <Text style={[typography.caption, { color: colors.mutedForeground }]}>
            {formatNumber(kpis.todayOrders)}{" "}
            {kpis.todayOrders === 1 ? "order" : "orders"}
          </Text>
        </View>
      </View>

      {/* Row 2: Orders + Average Order Value */}
      <View style={styles.twoColRow}>
        <View
          style={[
            styles.halfCell,
            { backgroundColor: colors.card, padding: spacing.base },
          ]}
        >
          <View style={styles.labelRow}>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Completed orders
            </Text>
            <ShoppingCart size={15} color={colors.mutedForeground} />
          </View>
          <Text
            style={[
              typography.titleMd,
              typography.tabular,
              { color: colors.foreground, marginTop: spacing.sm },
            ]}
          >
            {formatNumber(kpis.todayOrders)}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.mutedForeground, marginTop: spacing.sm },
            ]}
          >
            Yesterday {formatCurrency(kpis.yesterdayRevenue)}
          </Text>
        </View>

        <View
          style={[
            styles.halfCell,
            { backgroundColor: colors.card, padding: spacing.base },
          ]}
        >
          <View style={styles.labelRow}>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Avg. order value
            </Text>
            <Receipt size={15} color={colors.mutedForeground} />
          </View>
          <Text
            style={[
              typography.titleMd,
              typography.tabular,
              { color: colors.foreground, marginTop: spacing.sm },
            ]}
          >
            {formatCurrency(kpis.todayAov)}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.mutedForeground, marginTop: spacing.sm },
            ]}
          >
            Today&apos;s ticket avg
          </Text>
        </View>
      </View>

      {/* Row 3: Inventory Value + Stock Alerts */}
      <View style={styles.twoColRow}>
        <View
          style={[
            styles.halfCell,
            { backgroundColor: colors.card, padding: spacing.base },
          ]}
        >
          <View style={styles.labelRow}>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Inventory value
            </Text>
            <Boxes size={15} color={colors.mutedForeground} />
          </View>
          <Text
            style={[
              typography.titleSm,
              typography.tabular,
              { color: colors.foreground, marginTop: spacing.sm },
            ]}
          >
            {formatCurrency(kpis.totalInventoryValuation)}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.mutedForeground, marginTop: spacing.sm },
            ]}
          >
            {formatNumber(kpis.totalProductsCount)} items ·{" "}
            {formatNumber(kpis.totalStockUnits)} units
          </Text>
        </View>

        <View
          style={[
            styles.halfCell,
            { backgroundColor: colors.card, padding: spacing.base },
          ]}
        >
          {needsAttention > 0 ? (
            <View
              style={[
                styles.alertStripe,
                {
                  backgroundColor: hasOutOfStock ? colors.danger : colors.warning,
                },
              ]}
            />
          ) : null}

          <View style={styles.labelRow}>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Stock alerts
            </Text>
            <AlertTriangle
              size={15}
              color={
                hasOutOfStock
                  ? colors.dangerText
                  : needsAttention > 0
                    ? colors.warningText
                    : colors.mutedForeground
              }
            />
          </View>

          <View style={[styles.attentionRow, { marginTop: spacing.sm }]}>
            <Text
              style={[
                typography.titleMd,
                typography.tabular,
                { color: colors.foreground },
              ]}
            >
              {formatNumber(needsAttention)}
            </Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              need restock
            </Text>
          </View>

          <View style={[styles.dotSummary, { marginTop: spacing.sm }]}>
            {needsAttention === 0 ? (
              <Text style={[typography.caption, { color: colors.successText }]}>
                All stock healthy
              </Text>
            ) : (
              <>
                {kpis.outOfStockCount > 0 ? (
                  <View style={styles.dotItem}>
                    <View
                      style={[styles.dot, { backgroundColor: colors.danger }]}
                    />
                    <Text
                      style={[typography.caption, { color: colors.mutedForeground }]}
                    >
                      {kpis.outOfStockCount} out
                    </Text>
                  </View>
                ) : null}
                {kpis.lowStockCount > 0 ? (
                  <View style={styles.dotItem}>
                    <View
                      style={[styles.dot, { backgroundColor: colors.warning }]}
                    />
                    <Text
                      style={[typography.caption, { color: colors.mutedForeground }]}
                    >
                      {kpis.lowStockCount} low
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gridContainer: {
    borderWidth: 1,
    overflow: "hidden",
    gap: 1,
  },
  cell: {
    width: "100%",
  },
  twoColRow: {
    flexDirection: "row",
    gap: 1,
  },
  halfCell: {
    flex: 1,
    position: "relative",
  },
  alertStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  deltaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  dotSummary: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  dotItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
  },
});
