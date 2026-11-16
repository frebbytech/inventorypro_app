import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import {
  Award,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Printer,
  Share2,
  UserCheck,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { LoadingState } from "@/components/LoadingState";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { useTheme } from "@/theme";
import type { DailyReportData } from "@/types/domain";
import { capitalizeLabel, formatCurrency } from "@/utils/formatters";

function isoDateOffset(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return isoDateOffset(0);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function formatReadableDate(dateStr: string): string {
  const today = isoDateOffset(0);
  const yesterday = isoDateOffset(1);
  if (dateStr === today) return `Today (${dateStr})`;
  if (dateStr === yesterday) return `Yesterday (${dateStr})`;
  return dateStr;
}

export default function DailyReportsScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [selectedDate, setSelectedDate] = useState<string>(() => isoDateOffset(0));
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [printing, setPrinting] = useState(false);

  const todayStr = isoDateOffset(0);

  const quickDates = useMemo(
    () => [
      { label: "Today", value: isoDateOffset(0) },
      { label: "Yesterday", value: isoDateOffset(1) },
      { label: "2d ago", value: isoDateOffset(2) },
      { label: "3d ago", value: isoDateOffset(3) },
    ],
    [],
  );

  const loadReport = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.getDailyReport(selectedDate);
        setReport(res);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, selectedDate],
  );

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleShareText = async () => {
    if (!report) return;
    const lines = [
      `${report.storeName} — Daily Sales Report`,
      `Date: ${report.date}`,
      `----------------------------------------`,
      `Gross Revenue: ${formatCurrency(report.grossRevenue, report.currency)}`,
      `Est. Gross Profit: ${formatCurrency(report.grossProfit, report.currency)} (${report.profitMarginPercent}%)`,
      `Completed Sales: ${report.completedCount}`,
      `Refunded Sales: ${report.refundedCount} (${formatCurrency(report.refundedAmount, report.currency)})`,
      `Units Sold: ${report.totalUnitsSold}`,
      `Average Order Value: ${formatCurrency(report.averageOrderValue, report.currency)}`,
      `Discounts: ${formatCurrency(report.totalDiscount, report.currency)} | Tax: ${formatCurrency(report.totalTax, report.currency)}`,
      ``,
      `Payment Mix:`,
      ...report.paymentBreakdown.map(
        (p) =>
          `- ${capitalizeLabel(p.paymentMode)}: ${formatCurrency(p.amount, report.currency)} (${p.count} orders, ${p.sharePercent}%)`,
      ),
    ];

    if (report.cashierBreakdown.length > 0) {
      lines.push(
        ``,
        `Cashiers:`,
        ...report.cashierBreakdown.map(
          (c) =>
            `- ${c.cashierName}: ${formatCurrency(c.revenue, report.currency)} (${c.salesCount} sales)`,
        ),
      );
    }

    await Share.share({
      title: `Daily Report ${report.date}`,
      message: lines.join("\n"),
    });
  };

  const handlePrintPdf = async () => {
    if (!report || printing) return;
    setPrinting(true);
    try {
      const paymentRows = report.paymentBreakdown
        .map(
          (p) =>
            `<tr><td>${capitalizeLabel(p.paymentMode)}</td><td>${p.count}</td><td style="text-align:right">${formatCurrency(p.amount, report.currency)}</td></tr>`,
        )
        .join("");
      const cashierRows = report.cashierBreakdown
        .map(
          (c) =>
            `<tr><td>${c.cashierName}</td><td>${c.salesCount}</td><td style="text-align:right">${formatCurrency(c.revenue, report.currency)}</td></tr>`,
        )
        .join("");

      const html = `
        <html>
          <body style="font-family: -apple-system, sans-serif; padding: 24px; color: #0f172a;">
            <h1 style="margin:0 0 4px 0; font-size:20px;">${report.storeName}</h1>
            <p style="margin:0 0 18px 0; color:#64748b; font-size:13px;">End-of-Day Sales Report · ${report.date}</p>
            <div style="display:flex; gap:16px; margin-bottom:18px;">
              <div style="flex:1; padding:12px; border:1px solid #cbd5e1; border-radius:8px;">
                <div style="font-size:11px; color:#64748b;">Gross Revenue</div>
                <div style="font-size:18px; font-weight:700;">${formatCurrency(report.grossRevenue, report.currency)}</div>
              </div>
              <div style="flex:1; padding:12px; border:1px solid #cbd5e1; border-radius:8px;">
                <div style="font-size:11px; color:#64748b;">Est. Profit</div>
                <div style="font-size:18px; font-weight:700;">${formatCurrency(report.grossProfit, report.currency)}</div>
              </div>
              <div style="flex:1; padding:12px; border:1px solid #cbd5e1; border-radius:8px;">
                <div style="font-size:11px; color:#64748b;">Completed Orders</div>
                <div style="font-size:18px; font-weight:700;">${report.completedCount}</div>
              </div>
            </div>
            <h3 style="margin:16px 0 6px;">Payment Methods</h3>
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
              <thead><tr style="border-bottom:1px solid #cbd5e1;"><th align="left">Method</th><th align="left">Count</th><th align="right">Total</th></tr></thead>
              <tbody>${paymentRows}</tbody>
            </table>
            ${
              report.cashierBreakdown.length > 0
                ? `<h3 style="margin:16px 0 6px;">Cashier Performance</h3>
                   <table style="width:100%; border-collapse:collapse; font-size:13px;">
                     <thead><tr style="border-bottom:1px solid #cbd5e1;"><th align="left">Staff</th><th align="left">Orders</th><th align="right">Revenue</th></tr></thead>
                     <tbody>${cashierRows}</tbody>
                   </table>`
                : ""
            }
          </body>
        </html>
      `;
      await Print.printAsync({ html });
    } finally {
      setPrinting(false);
    }
  };

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
      {/* Date Selector Card */}
      <Card>
        <CardContent style={{ paddingTop: spacing.md, gap: spacing.sm + 2 }}>
          <View style={styles.dateStepperRow}>
            <Pressable
              onPress={() =>
                setSelectedDate((prev) => shiftDateString(prev, -1))
              }
              style={[
                styles.stepBtn,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <ChevronLeft size={18} color={colors.foreground} />
            </Pressable>

            <View style={styles.dateCenter}>
              <Calendar size={15} color={colors.primary} />
              <Text
                style={[
                  typography.bodySemibold,
                  typography.tabular,
                  { color: colors.foreground },
                ]}
              >
                {formatReadableDate(selectedDate)}
              </Text>
            </View>

            <Pressable
              disabled={selectedDate >= todayStr}
              onPress={() =>
                setSelectedDate((prev) => {
                  const next = shiftDateString(prev, 1);
                  return next > todayStr ? todayStr : next;
                })
              }
              style={[
                styles.stepBtn,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  borderRadius: radii.lg,
                  opacity: selectedDate >= todayStr ? 0.38 : 1,
                },
              ]}
            >
              <ChevronRight size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.quickChipsRow}>
            {quickDates.map((item) => {
              const active = selectedDate === item.value;
              return (
                <Pressable
                  key={item.label}
                  onPress={() => setSelectedDate(item.value)}
                  style={[
                    styles.quickChip,
                    {
                      borderRadius: radii.md,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active
                        ? colors.primaryTint
                        : colors.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.micro,
                      {
                        fontFamily: fontFamilies.semibold,
                        color: active ? colors.primary : colors.mutedForeground,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </CardContent>
      </Card>

      {loading && !report ? (
        <LoadingState message="Generating daily report..." />
      ) : report ? (
        <>
          {/* Actions Bar */}
          <View style={styles.exportRow}>
            <Button
              title="Share Summary"
              variant="outline"
              size="sm"
              style={{ flex: 1 }}
              leftIcon={<Share2 size={14} color={colors.foreground} />}
              onPress={() => void handleShareText()}
            />
            <Button
              title="Print / PDF"
              size="sm"
              style={{ flex: 1 }}
              loading={printing}
              leftIcon={<Printer size={14} color="#FFFFFF" />}
              onPress={() => void handlePrintPdf()}
            />
          </View>

          {/* 2x2 Daily KPI Grid */}
          <View
            style={[
              styles.kpiGrid,
              {
                backgroundColor: colors.border,
                borderColor: colors.border,
                borderRadius: radii.xl,
              },
            ]}
          >
            <View style={styles.kpiRow}>
              <View
                style={[
                  styles.kpiCell,
                  { backgroundColor: colors.card, padding: spacing.base },
                ]}
              >
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Daily revenue
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    typography.titleSm,
                    typography.tabular,
                    {
                      color: colors.primary,
                      fontFamily: fontFamilies.bold,
                      marginTop: spacing.xs,
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
                  {report.completedCount} completed · {report.totalUnitsSold} units
                </Text>
              </View>

              <View
                style={[
                  styles.kpiCell,
                  { backgroundColor: colors.card, padding: spacing.base },
                ]}
              >
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Est. gross profit
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    typography.titleSm,
                    typography.tabular,
                    {
                      color: colors.successText,
                      fontFamily: fontFamilies.bold,
                      marginTop: spacing.xs,
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
                  Margin {report.profitMarginPercent}%
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
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Avg order value
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    typography.titleSm,
                    typography.tabular,
                    { color: colors.foreground, marginTop: spacing.xs },
                  ]}
                >
                  {formatCurrency(report.averageOrderValue, report.currency)}
                </Text>
              </View>

              <View
                style={[
                  styles.kpiCell,
                  { backgroundColor: colors.card, padding: spacing.base },
                ]}
              >
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Refunds
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    typography.titleSm,
                    typography.tabular,
                    {
                      color:
                        report.refundedCount > 0
                          ? colors.warningText
                          : colors.foreground,
                      marginTop: spacing.xs,
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
                  {report.refundedCount} refunded
                </Text>
              </View>
            </View>
          </View>

          {/* Payment Breakdown */}
          <Card>
            <CardHeader bordered>
              <CardTitle>Payment method mix</CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: spacing.md, gap: spacing.sm + 2 }}>
              {report.paymentBreakdown.map((item) => (
                <View key={item.paymentMode} style={{ gap: 4 }}>
                  <View style={styles.rowBetween}>
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: colors.foreground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      {capitalizeLabel(item.paymentMode)} ({item.count})
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        typography.tabular,
                        { color: colors.foreground },
                      ]}
                    >
                      {formatCurrency(item.amount, report.currency)} ·{" "}
                      {item.sharePercent}%
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.barTrack,
                      { backgroundColor: colors.muted, borderRadius: radii.full },
                    ]}
                  >
                    <View
                      style={[
                        styles.barFill,
                        {
                          backgroundColor: colors.primary,
                          borderRadius: radii.full,
                          width: `${Math.min(100, Math.max(0, item.sharePercent))}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </CardContent>
          </Card>

          {/* Cashier Breakdown */}
          <Card>
            <CardHeader bordered>
              <CardTitle>Cashier performance</CardTitle>
            </CardHeader>
            {report.cashierBreakdown.length === 0 ? (
              <CardContent style={{ paddingTop: spacing.md }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  No completed sales recorded on {report.date}.
                </Text>
              </CardContent>
            ) : (
              <View>
                {report.cashierBreakdown.map((cashier, idx) => (
                  <Pressable
                    key={cashier.userId}
                    onPress={() =>
                      router.push({
                        pathname: "/employee/[id]",
                        params: { id: cashier.userId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.listRow,
                      {
                        paddingHorizontal: spacing.base,
                        paddingVertical: spacing.md,
                        borderBottomWidth:
                          idx < report.cashierBreakdown.length - 1
                            ? StyleSheet.hairlineWidth
                            : 0,
                        borderBottomColor: colors.border,
                        backgroundColor: pressed ? colors.muted : colors.card,
                      },
                    ]}
                  >
                    <View style={styles.rowIconTitle}>
                      <UserCheck size={16} color={colors.primary} />
                      <View>
                        <Text
                          style={[
                            typography.bodySemibold,
                            { color: colors.foreground },
                          ]}
                        >
                          {cashier.cashierName}
                        </Text>
                        <Text
                          style={[
                            typography.caption,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {cashier.salesCount}{" "}
                          {cashier.salesCount === 1 ? "order" : "orders"}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        typography.bodySemibold,
                        typography.tabular,
                        { color: colors.foreground },
                      ]}
                    >
                      {formatCurrency(cashier.revenue, report.currency)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>

          {/* Top Products for Selected Day */}
          <Card>
            <CardHeader bordered>
              <CardTitle>Top products ({report.date})</CardTitle>
            </CardHeader>
            {report.topProducts.length === 0 ? (
              <CardContent style={{ paddingTop: spacing.md }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  No item sales recorded on this date.
                </Text>
              </CardContent>
            ) : (
              <View>
                {report.topProducts.map((prod, idx) => (
                  <Pressable
                    key={prod.productId}
                    onPress={() =>
                      router.push({
                        pathname: "/product/[id]",
                        params: { id: prod.productId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.listRow,
                      {
                        paddingHorizontal: spacing.base,
                        paddingVertical: spacing.md,
                        borderBottomWidth:
                          idx < report.topProducts.length - 1
                            ? StyleSheet.hairlineWidth
                            : 0,
                        borderBottomColor: colors.border,
                        backgroundColor: pressed ? colors.muted : colors.card,
                      },
                    ]}
                  >
                    <View style={[styles.rowIconTitle, { flex: 1 }]}>
                      <Badge label={`#${idx + 1}`} variant="secondary" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            typography.bodySemibold,
                            { color: colors.foreground },
                          ]}
                        >
                          {prod.productName}
                        </Text>
                        <Text
                          style={[
                            typography.caption,
                            typography.tabular,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {prod.unitsSold} units sold
                        </Text>
                      </View>
                    </View>
                    <View style={styles.revenueWrap}>
                      <Award size={14} color={colors.primary} />
                      <Text
                        style={[
                          typography.bodySemibold,
                          typography.tabular,
                          { color: colors.foreground },
                        ]}
                      >
                        {formatCurrency(prod.revenue, report.currency)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dateStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  quickChipsRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickChip: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  exportRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiGrid: {
    borderWidth: 1,
    overflow: "hidden",
    gap: 1,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 1,
  },
  kpiCell: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  barTrack: {
    height: 7,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rowIconTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  revenueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
