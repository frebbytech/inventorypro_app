import React, { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ChevronRight,
  CreditCard,
  Share2,
  TrendingUp,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SegmentedTabs,
} from "@/components/ui";
import { useTheme } from "@/theme";
import type { SalesDateRange, SalesReportData } from "@/types/domain";
import {
  capitalizeLabel,
  formatCurrency,
  formatNumber,
} from "@/utils/formatters";
import { shareSalesReportText } from "@/utils/receiptExport";

const RANGE_OPTIONS: { value: SalesDateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "all", label: "All Time" },
];

export default function SalesSummaryScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [range, setRange] = useState<SalesDateRange>("30d");
  const [report, setReport] = useState<SalesReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReport = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.getSalesReport(range);
        setReport(res);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, range],
  );

  useFocusEffect(
    useCallback(() => {
      void loadReport(Boolean(report));
    }, [loadReport]),
  );

  if (loading && !report) {
    return <LoadingState message="Calculating sales & profit report..." />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.base,
        gap: spacing.base,
        paddingBottom: spacing["3xl"],
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadReport(true)}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <SegmentedTabs
        options={RANGE_OPTIONS}
        value={range}
        onChange={setRange}
      />

      {!report ? (
        <EmptyState
          title="Unable to load report"
          description="Pull down to refresh or retry loading sales metrics."
          action={
            <Button
              title="Retry"
              size="sm"
              onPress={() => void loadReport()}
            />
          }
        />
      ) : (
        <>
          {/* Primary Financial KPIs */}
          <Card>
            <View style={[styles.kpiGrid, { backgroundColor: colors.border }]}>
              <View style={styles.kpiRow}>
                <View
                  style={[
                    styles.kpiCell,
                    { backgroundColor: colors.card, padding: spacing.base },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Completed Revenue
                  </Text>
                  <Text
                    style={[
                      typography.titleSm,
                      typography.tabular,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.bold,
                        marginTop: 4,
                      },
                    ]}
                  >
                    {formatCurrency(report.grossRevenue, report.currency)}
                  </Text>
                  <Text
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground, marginTop: 2 },
                    ]}
                  >
                    {formatNumber(report.completedCount)} orders ·{" "}
                    {formatNumber(report.totalUnitsSold)} units
                  </Text>
                </View>

                <View
                  style={[
                    styles.kpiCell,
                    { backgroundColor: colors.card, padding: spacing.base },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Est. Gross Profit
                  </Text>
                  <Text
                    style={[
                      typography.titleSm,
                      typography.tabular,
                      {
                        color:
                          report.grossProfit >= 0
                            ? colors.successText
                            : colors.dangerText,
                        fontFamily: fontFamilies.bold,
                        marginTop: 4,
                      },
                    ]}
                  >
                    {formatCurrency(report.grossProfit, report.currency)}
                  </Text>
                  <Text
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground, marginTop: 2 },
                    ]}
                  >
                    {report.profitMarginPercent.toFixed(1)}% margin
                  </Text>
                </View>
              </View>

              <View style={styles.kpiRow}>
                <View
                  style={[
                    styles.kpiCell,
                    { backgroundColor: colors.card, padding: spacing.base },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Average Order Value
                  </Text>
                  <Text
                    style={[
                      typography.subtitle,
                      typography.tabular,
                      { color: colors.foreground, marginTop: 4 },
                    ]}
                  >
                    {formatCurrency(report.averageOrderValue, report.currency)}
                  </Text>
                  <Text
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground, marginTop: 2 },
                    ]}
                  >
                    Tax: {formatCurrency(report.totalTax, report.currency)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.kpiCell,
                    { backgroundColor: colors.card, padding: spacing.base },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Refunds Issued
                  </Text>
                  <Text
                    style={[
                      typography.subtitle,
                      typography.tabular,
                      {
                        color:
                          report.refundedCount > 0
                            ? colors.warningText
                            : colors.foreground,
                        marginTop: 4,
                      },
                    ]}
                  >
                    {formatCurrency(report.refundedAmount, report.currency)}
                  </Text>
                  <Text
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground, marginTop: 2 },
                    ]}
                  >
                    {formatNumber(report.refundedCount)} refunded · Disc:{" "}
                    {formatCurrency(report.totalDiscount, report.currency)}
                  </Text>
                </View>
              </View>
            </View>
          </Card>

          {/* Payment Tender Breakdown */}
          <Card>
            <CardHeader bordered>
              <View style={styles.cardHeadRow}>
                <CreditCard size={16} color={colors.primary} />
                <CardTitle>Payment Breakdown</CardTitle>
              </View>
            </CardHeader>

            <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
              {report.paymentBreakdown.map((item) => (
                <View key={item.paymentMode} style={{ gap: 6 }}>
                  <View style={styles.breakdownHeader}>
                    <View style={styles.breakdownLabel}>
                      <Text
                        style={[
                          typography.bodyMedium,
                          { color: colors.foreground },
                        ]}
                      >
                        {capitalizeLabel(item.paymentMode)}
                      </Text>
                      <Badge
                        label={`${item.count} tx`}
                        variant="secondary"
                      />
                    </View>
                    <Text
                      style={[
                        typography.bodySemibold,
                        typography.tabular,
                        { color: colors.foreground },
                      ]}
                    >
                      {formatCurrency(item.amount, report.currency)}{" "}
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        ({item.sharePercent.toFixed(0)}%)
                      </Text>
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.progressTrack,
                      {
                        backgroundColor: colors.muted,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(100, Math.max(item.amount > 0 ? 4 : 0, item.sharePercent))}%`,
                          backgroundColor: colors.primary,
                          borderRadius: radii.full,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </CardContent>
          </Card>

          {/* Top Selling Products */}
          <Card>
            <CardHeader bordered>
              <View style={styles.cardHeadRow}>
                <TrendingUp size={16} color={colors.primary} />
                <CardTitle>Top Selling Products</CardTitle>
              </View>
            </CardHeader>

            {report.topProducts.length === 0 ? (
              <CardContent style={{ paddingTop: spacing.base }}>
                <Text
                  style={[typography.body, { color: colors.mutedForeground }]}
                >
                  No completed product sales recorded in this period yet.
                </Text>
              </CardContent>
            ) : (
              <View>
                {report.topProducts.map((item, idx) => (
                  <Pressable
                    key={item.productId}
                    onPress={() =>
                      router.push({
                        pathname: "/product/[id]",
                        params: { id: item.productId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.topProductRow,
                      {
                        paddingHorizontal: spacing.base,
                        paddingVertical: spacing.md,
                        borderBottomWidth:
                          idx < report.topProducts.length - 1
                            ? StyleSheet.hairlineWidth
                            : 0,
                        borderBottomColor: colors.border,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.rankBadge,
                        {
                          backgroundColor: colors.primaryTint,
                          borderRadius: radii.md,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.caption,
                          typography.tabular,
                          {
                            color: colors.primary,
                            fontFamily: fontFamilies.bold,
                          },
                        ]}
                      >
                        #{idx + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.bodyMedium,
                          { color: colors.foreground },
                        ]}
                      >
                        {item.productName}
                      </Text>
                      <Text
                        style={[
                          typography.caption,
                          typography.tabular,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {formatNumber(item.unitsSold)} units sold
                      </Text>
                    </View>
                    <Text
                      style={[
                        typography.bodySemibold,
                        typography.tabular,
                        { color: colors.foreground },
                      ]}
                    >
                      {formatCurrency(item.revenue, report.currency)}
                    </Text>
                    <ChevronRight size={15} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            )}
          </Card>

          <Button
            title="Share Report Summary"
            variant="outline"
            leftIcon={<Share2 size={16} color={colors.foreground} />}
            onPress={() =>
              void shareSalesReportText(
                report,
                store?.storeName || "Inventory Pro",
              )
            }
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    gap: 1,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 1,
  },
  kpiCell: {
    flex: 1,
  },
  cardHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  breakdownLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    height: 7,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  topProductRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rankBadge: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});
