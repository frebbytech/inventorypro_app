import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileDown,
  Printer,
  Receipt,
  RotateCcw,
  Share2,
  X,
} from "lucide-react-native";
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
  Input,
  useToast,
} from "@/components/ui";
import { useTheme } from "@/theme";
import type { SaleReceiptDetail } from "@/types/domain";
import {
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
  formatNumber,
} from "@/utils/formatters";
import {
  exportReceiptPdf,
  printReceipt,
  shareReceiptText,
} from "@/utils/receiptExport";

const REFUND_REASONS = [
  "Customer return",
  "Wrong item",
  "Damaged item",
  "Duplicate charge",
] as const;

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [receipt, setReceipt] = useState<SaleReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"share" | "print" | "pdf" | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Refund modal state
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [restockItems, setRestockItems] = useState(true);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const loadReceipt = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getSaleReceiptById(String(id));
      setReceipt(res);
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    void loadReceipt();
  }, [loadReceipt]);

  const runExportAction = async (kind: "share" | "print" | "pdf") => {
    if (!receipt || busyAction) return;
    setBusyAction(kind);
    setFeedback(null);
    try {
      if (kind === "share") {
        await shareReceiptText(receipt);
      } else if (kind === "print") {
        await printReceipt(receipt);
      } else {
        await exportReceiptPdf(receipt);
      }
    } catch (err) {
      setFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Unable to complete receipt export action.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmRefund = async () => {
    if (!receipt || refunding) return;
    setRefunding(true);
    setRefundError(null);
    try {
      const updated = await api.refundSale(receipt.id, {
        reason: refundReason.trim() || undefined,
        restockItems,
      });
      setReceipt(updated);
      setRefundModalOpen(false);
      setRefundReason("");
      const refundMsg = restockItems
        ? "Sale refunded and items restored to inventory."
        : "Sale marked as refunded without restocking.";
      setFeedback({
        type: "success",
        text: refundMsg,
      });
      toast.success("Sale refunded", refundMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to process refund.";
      setRefundError(msg);
      toast.error("Refund failed", msg);
    } finally {
      setRefunding(false);
    }
  };

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
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: spacing["3xl"],
        }}
      >
        {feedback ? (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor:
                  feedback.type === "success"
                    ? colors.successTint
                    : colors.dangerTint,
                borderColor:
                  feedback.type === "success"
                    ? colors.successBorder
                    : colors.dangerBorder,
                borderRadius: radii.xl,
                padding: spacing.md,
              },
            ]}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 size={16} color={colors.successText} />
            ) : (
              <AlertCircle size={16} color={colors.dangerText} />
            )}
            <Text
              style={[
                typography.caption,
                {
                  color:
                    feedback.type === "success"
                      ? colors.successText
                      : colors.dangerText,
                  flex: 1,
                },
              ]}
            >
              {feedback.text}
            </Text>
          </View>
        ) : null}

        {/* Receipt Header & KPI Strip */}
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
              {formatDateTime(receipt.saleDate)} · Served by{" "}
              {receipt.attendantName}
            </Text>
          </View>

          {/* 4-cell KPI strip */}
          <View style={[styles.kpiStrip, { backgroundColor: colors.border }]}>
            <View style={styles.kpiRow}>
              <View
                style={[
                  styles.kpiCell,
                  { backgroundColor: colors.card, padding: spacing.md + 2 },
                ]}
              >
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
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
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
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
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
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
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Amount paid
                </Text>
                <Text
                  style={[
                    typography.subtitle,
                    typography.tabular,
                    {
                      color: isRefunded
                        ? colors.warningText
                        : colors.foreground,
                      marginTop: 4,
                    },
                  ]}
                >
                  {formatCurrency(receipt.amountPaid, receipt.currency)}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Quick Receipt Export Actions */}
        <View style={styles.actionRow}>
          <Button
            title="Share"
            variant="outline"
            size="default"
            loading={busyAction === "share"}
            disabled={busyAction !== null}
            leftIcon={<Share2 size={15} color={colors.foreground} />}
            style={{ flex: 1 }}
            onPress={() => void runExportAction("share")}
          />
          <Button
            title="Print"
            variant="outline"
            size="default"
            loading={busyAction === "print"}
            disabled={busyAction !== null}
            leftIcon={<Printer size={15} color={colors.foreground} />}
            style={{ flex: 1 }}
            onPress={() => void runExportAction("print")}
          />
          <Button
            title="PDF"
            variant="outline"
            size="default"
            loading={busyAction === "pdf"}
            disabled={busyAction !== null}
            leftIcon={<FileDown size={15} color={colors.foreground} />}
            style={{ flex: 1 }}
            onPress={() => void runExportAction("pdf")}
          />
        </View>

        {/* Thermal-style Store Receipt & Itemized Breakdown */}
        <Card>
          <CardHeader bordered>
            <View style={styles.storeHeader}>
              <Text style={[typography.subtitle, { color: colors.foreground }]}>
                {receipt.storeName}
              </Text>
              <Text
                style={[typography.caption, { color: colors.mutedForeground }]}
              >
                {receipt.storeAddress}
                {receipt.storePhone ? ` · ${receipt.storePhone}` : ""}
              </Text>
              {receipt.storeEmail ? (
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  {receipt.storeEmail}
                </Text>
              ) : null}
              {isRefunded ? (
                <View
                  style={[
                    styles.refundStamp,
                    {
                      backgroundColor: colors.warningTint,
                      borderColor: colors.warningBorder,
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.micro,
                      {
                        color: colors.warningText,
                        fontFamily: fontFamilies.bold,
                      },
                    ]}
                  >
                    REFUNDED TRANSACTION
                  </Text>
                </View>
              ) : null}
            </View>
          </CardHeader>

          <CardContent style={{ paddingTop: spacing.md, paddingBottom: 0 }}>
            <View
              style={[styles.tableHead, { borderBottomColor: colors.border }]}
            >
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
                  {
                    color: colors.mutedForeground,
                    width: 38,
                    textAlign: "center",
                  },
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
                  {
                    color: colors.mutedForeground,
                    flex: 1.1,
                    textAlign: "right",
                  },
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
                      idx < receipt.items.length - 1
                        ? StyleSheet.hairlineWidth
                        : 0,
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
                    {
                      color: colors.foreground,
                      width: 38,
                      textAlign: "center",
                    },
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
              <Text
                style={[typography.body, { color: colors.mutedForeground }]}
              >
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
                <Text
                  style={[typography.body, { color: colors.mutedForeground }]}
                >
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
                <Text
                  style={[typography.body, { color: colors.mutedForeground }]}
                >
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

        {receipt.notes ? (
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
            <Text style={[typography.micro, { color: colors.mutedForeground }]}>
              TRANSACTION NOTES
            </Text>
            <Text
              style={[
                typography.caption,
                { color: colors.foreground, marginTop: 4 },
              ]}
            >
              {receipt.notes}
            </Text>
          </View>
        ) : null}

        {/* Refund Sale Section */}
        {!isRefunded ? (
          <Card>
            <CardContent
              style={{
                paddingTop: spacing.base,
                gap: spacing.sm,
              }}
            >
              <View style={styles.refundCardHead}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      { color: colors.foreground },
                    ]}
                  >
                    Need to reverse this sale?
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Refunding marks the receipt as refunded and can restore{" "}
                    {totalUnits} {totalUnits === 1 ? "unit" : "units"} back to
                    stock.
                  </Text>
                </View>
              </View>
              <Button
                title="Process Refund"
                variant="destructive"
                leftIcon={<RotateCcw size={15} color="#FFFFFF" />}
                onPress={() => {
                  setRefundError(null);
                  setRestockItems(true);
                  setRefundModalOpen(true);
                }}
              />
            </CardContent>
          </Card>
        ) : null}
      </ScrollView>

      {/* Refund Confirmation Modal */}
      <Modal
        visible={refundModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!refunding) setRefundModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii["2xl"],
                padding: spacing.base,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[typography.titleXsm, { color: colors.foreground }]}>
                Refund {receipt.receiptNo}
              </Text>
              <Pressable
                onPress={() => !refunding && setRefundModalOpen(false)}
                hitSlop={8}
                accessibilityLabel="Close refund dialog"
              >
                <X size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text
              style={[
                typography.body,
                { color: colors.mutedForeground, marginTop: 4 },
              ]}
            >
              Total value:{" "}
              <Text
                style={[
                  typography.bodySemibold,
                  typography.tabular,
                  { color: colors.foreground },
                ]}
              >
                {formatCurrency(receipt.totalAmount, receipt.currency)}
              </Text>
            </Text>

            <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Refund reason (optional)
              </Text>
              <View style={styles.reasonChips}>
                {REFUND_REASONS.map((reason) => {
                  const selected = refundReason === reason;
                  return (
                    <Pressable
                      key={reason}
                      onPress={() =>
                        setRefundReason(selected ? "" : reason)
                      }
                      style={[
                        styles.reasonChip,
                        {
                          backgroundColor: selected
                            ? colors.primaryTint
                            : colors.cardMuted,
                          borderColor: selected
                            ? colors.primary
                            : colors.border,
                          borderRadius: radii.lg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.caption,
                          {
                            color: selected
                              ? colors.primary
                              : colors.foreground,
                          },
                        ]}
                      >
                        {reason}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Input
                value={refundReason}
                onChangeText={setRefundReason}
                placeholder="Or enter a custom reason..."
              />
            </View>

            <Pressable
              onPress={() => setRestockItems((v) => !v)}
              style={[
                styles.restockToggle,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.cardMuted,
                  borderRadius: radii.xl,
                  marginTop: spacing.md,
                  padding: spacing.md,
                },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: restockItems ? colors.primary : colors.border,
                    backgroundColor: restockItems
                      ? colors.primary
                      : "transparent",
                    borderRadius: radii.sm,
                  },
                ]}
              >
                {restockItems ? (
                  <Check size={12} color={colors.primaryForeground} />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    typography.bodyMedium,
                    { color: colors.foreground },
                  ]}
                >
                  Restock returned items
                </Text>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Add {totalUnits} {totalUnits === 1 ? "unit" : "units"} back
                  into product inventory
                </Text>
              </View>
            </Pressable>

            {refundError ? (
              <View
                style={[
                  styles.feedbackBanner,
                  {
                    backgroundColor: colors.dangerTint,
                    borderColor: colors.dangerBorder,
                    borderRadius: radii.lg,
                    padding: spacing.sm + 2,
                    marginTop: spacing.md,
                  },
                ]}
              >
                <AlertCircle size={15} color={colors.dangerText} />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.dangerText, flex: 1 },
                  ]}
                >
                  {refundError}
                </Text>
              </View>
            ) : null}

            <View style={[styles.modalActions, { marginTop: spacing.base }]}>
              <Button
                title="Cancel"
                variant="outline"
                style={{ flex: 1 }}
                disabled={refunding}
                onPress={() => setRefundModalOpen(false)}
              />
              <Button
                title={refunding ? "Refunding..." : "Confirm Refund"}
                variant="destructive"
                style={{ flex: 1.2 }}
                loading={refunding}
                onPress={() => void handleConfirmRefund()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  notFoundWrap: {
    flex: 1,
    justifyContent: "center",
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
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
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  storeHeader: {
    alignItems: "center",
    gap: 2,
  },
  refundStamp: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
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
  refundCardHead: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.60)",
    justifyContent: "center",
    padding: 20,
  },
  modalSheet: {
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reasonChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  reasonChip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  restockToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
});
