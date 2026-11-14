import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Receipt } from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { useTheme } from "@/theme";
import type { SaleReceiptDetail } from "@/types/domain";
import {
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
  formatNumber,
} from "@/utils/formatters";

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [receipt, setReceipt] = useState<SaleReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await api.getSaleReceiptById(String(id));
        if (active) setReceipt(res);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [api, id]);

  if (loading) {
    return <LoadingState message="Loading receipt details..." />;
  }

  if (!receipt) {
    return (
      <View
        style={[
          styles.notFoundWrap,
          { backgroundColor: colors.background, padding: spacing.base },
        ]}
      >
        <EmptyState
          icon={<Receipt size={36} color={colors.mutedForeground} />}
          title="Receipt not found"
          description="This transaction could not be found in the SQLite database."
          action={
            <Button
              title="Back to Sales"
              variant="outline"
              size="sm"
              onPress={() => router.back()}
            />
          }
        />
      </View>
    );
  }

  const isCompleted = receipt.status === "completed";
  const isRefunded = receipt.status === "refunded";
  const statusVariant = isCompleted
    ? "success"
    : isRefunded
      ? "warning"
      : "danger";

  const totalUnits = receipt.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.base,
        gap: spacing.base,
        paddingBottom: spacing["2xl"],
      }}
    >
      {/* Receipt Header & KPI Strip matching SalesDetailsPage.tsx */}
      <Card>
        <View
          style={{
            padding: spacing.base,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            gap: spacing.xs + 2,
          }}
        >
          <View style={styles.headerTop}>
            <Text
              style={[
                typography.titleXsm,
                typography.tabular,
                { color: colors.foreground, flex: 1 },
              ]}
            >
              {receipt.receiptNo}
            </Text>
            <Badge
              label={capitalizeLabel(receipt.status)}
              variant={statusVariant}
            />
          </View>

          <Text style={[typography.body, { color: colors.mutedForeground }]}>
            {receipt.customerName}
            {receipt.customerPhone ? ` · ${receipt.customerPhone}` : ""}
          </Text>
          <Text style={[typography.caption, { color: colors.mutedForeground }]}>
            {formatDateTime(receipt.saleDate)} · Served by {receipt.attendantName}
          </Text>
        </View>

        {/* 4-cell KPI strip */}
        <View
          style={[
            styles.kpiStrip,
            { backgroundColor: colors.border },
          ]}
        >
          <View style={styles.kpiRow}>
            <View
              style={[
                styles.kpiCell,
                { backgroundColor: colors.card, padding: spacing.md + 2 },
              ]}
            >
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                Total
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
                {formatCurrency(receipt.totalAmount, receipt.currency)}
              </Text>
            </View>

            <View
              style={[
                styles.kpiCell,
                { backgroundColor: colors.card, padding: spacing.md + 2 },
              ]}
            >
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                Items
              </Text>
              <Text
                style={[
                  typography.titleSm,
                  typography.tabular,
                  { color: colors.foreground, marginTop: 4 },
                ]}
              >
                {formatNumber(totalUnits)} ({receipt.items.length} lines)
              </Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View
              style={[
                styles.kpiCell,
                { backgroundColor: colors.card, padding: spacing.md + 2 },
              ]}
            >
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                Payment
              </Text>
              <Text
                style={[
                  typography.subtitle,
                  { color: colors.foreground, marginTop: 4 },
                ]}
              >
                {capitalizeLabel(receipt.paymentMode)}
              </Text>
            </View>

            <View
              style={[
                styles.kpiCell,
                { backgroundColor: colors.card, padding: spacing.md + 2 },
              ]}
            >
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                Amount paid
              </Text>
              <Text
                style={[
                  typography.subtitle,
                  typography.tabular,
                  { color: colors.foreground, marginTop: 4 },
                ]}
              >
                {formatCurrency(receipt.amountPaid, receipt.currency)}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Thermal-style Store Receipt & Itemized Breakdown */}
      <Card>
        <CardHeader bordered>
          <View style={styles.storeHeader}>
            <Text style={[typography.subtitle, { color: colors.foreground }]}>
              {receipt.storeName}
            </Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              {receipt.storeAddress} · {receipt.storePhone}
            </Text>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              {receipt.storeEmail}
            </Text>
          </View>
        </CardHeader>

        <CardContent style={{ paddingTop: spacing.md, paddingBottom: 0 }}>
          <View style={[styles.tableHead, { borderBottomColor: colors.border }]}>
            <Text
              style={[
                typography.micro,
                { color: colors.mutedForeground, flex: 2.2 },
              ]}
            >
              ITEM
            </Text>
            <Text
              style={[
                typography.micro,
                { color: colors.mutedForeground, width: 38, textAlign: "center" },
              ]}
            >
              QTY
            </Text>
            <Text
              style={[
                typography.micro,
                { color: colors.mutedForeground, flex: 1, textAlign: "right" },
              ]}
            >
              PRICE
            </Text>
            <Text
              style={[
                typography.micro,
                { color: colors.mutedForeground, flex: 1.1, textAlign: "right" },
              ]}
            >
              TOTAL
            </Text>
          </View>

          {receipt.items.map((item, idx) => (
            <View
              key={item.id}
              style={[
                styles.itemRow,
                {
                  borderBottomWidth:
                    idx < receipt.items.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: colors.border,
                  paddingVertical: spacing.md,
                },
              ]}
            >
              <Text
                style={[
                  typography.bodyMedium,
                  { color: colors.foreground, flex: 2.2, paddingRight: 8 },
                ]}
              >
                {item.productName}
              </Text>
              <Text
                style={[
                  typography.body,
                  typography.tabular,
                  { color: colors.foreground, width: 38, textAlign: "center" },
                ]}
              >
                {item.quantity}
              </Text>
              <Text
                style={[
                  typography.body,
                  typography.tabular,
                  {
                    color: colors.mutedForeground,
                    flex: 1,
                    textAlign: "right",
                  },
                ]}
              >
                {item.unitPrice.toFixed(2)}
              </Text>
              <Text
                style={[
                  typography.bodySemibold,
                  typography.tabular,
                  { color: colors.foreground, flex: 1.1, textAlign: "right" },
                ]}
              >
                {item.subtotal.toFixed(2)}
              </Text>
            </View>
          ))}
        </CardContent>

        <CardFooter style={{ gap: spacing.xs + 2 }}>
          <View style={styles.totalRow}>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              Subtotal
            </Text>
            <Text
              style={[
                typography.bodyMedium,
                typography.tabular,
                { color: colors.foreground },
              ]}
            >
              {formatCurrency(receipt.subtotal, receipt.currency)}
            </Text>
          </View>

          {receipt.discountAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={[typography.body, { color: colors.mutedForeground }]}>
                Discount
              </Text>
              <Text
                style={[
                  typography.bodyMedium,
                  typography.tabular,
                  { color: colors.successText },
                ]}
              >
                -{formatCurrency(receipt.discountAmount, receipt.currency)}
              </Text>
            </View>
          ) : null}

          {receipt.taxAmount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={[typography.body, { color: colors.mutedForeground }]}>
                Tax ({(receipt.taxRate * 100).toFixed(1)}%)
              </Text>
              <Text
                style={[
                  typography.bodyMedium,
                  typography.tabular,
                  { color: colors.foreground },
                ]}
              >
                {formatCurrency(receipt.taxAmount, receipt.currency)}
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.totalRow,
              {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
                paddingTop: spacing.sm,
                marginTop: spacing.xs,
              },
            ]}
          >
            <Text style={[typography.subtitle, { color: colors.foreground }]}>
              Total
            </Text>
            <Text
              style={[
                typography.titleSm,
                typography.tabular,
                { color: colors.foreground, fontFamily: fontFamilies.bold },
              ]}
            >
              {formatCurrency(receipt.totalAmount, receipt.currency)}
            </Text>
          </View>
        </CardFooter>
      </Card>

      {/* Deferred printing note */}
      <View
        style={[
          styles.noteBox,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: spacing.md,
          },
        ]}
      >
        <Text style={[typography.caption, { color: colors.mutedForeground }]}>
          Thank You! · By Frebbytech Solutions (+233 543 772 591). Thermal and
          PDF receipt printing are outside Phase 1 scope.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notFoundWrap: {
    flex: 1,
    justifyContent: "center",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kpiStrip: {
    gap: 1,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 1,
  },
  kpiCell: {
    flex: 1,
  },
  storeHeader: {
    alignItems: "center",
    gap: 2,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noteBox: {
    borderWidth: 1,
  },
});
