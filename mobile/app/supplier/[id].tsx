import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Building2,
  Edit3,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Truck,
  User,
  X,
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
  Input,
  useToast,
} from "@/components/ui";
import { useTheme } from "@/theme";
import type {
  PaymentMode,
  SupplierDetailResponse,
  SupplierTransactionSummary,
} from "@/types/domain";
import {
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
} from "@/utils/formatters";

const PAYMENT_MODES: ReadonlyArray<{ label: string; value: PaymentMode }> = [
  { label: "Cash", value: "cash" },
  { label: "MoMo", value: "momo" },
  { label: "Bank", value: "bank" },
  { label: "Cheque", value: "cheque" },
];

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;
  const currency = store?.currency || "GHS";

  const [detail, setDetail] = useState<SupplierDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Edit Supplier modal state
  const [editOpen, setEditOpen] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [contactInput, setContactInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [activeInput, setActiveInput] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Record Delivery modal state
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [deliveredByInput, setDeliveredByInput] = useState("");
  const [totalAmountInput, setTotalAmountInput] = useState("");
  const [amountPaidInput, setAmountPaidInput] = useState("");
  const [paymentModeInput, setPaymentModeInput] = useState<PaymentMode>("bank");
  const [notesInput, setNotesInput] = useState("");
  const [savingTx, setSavingTx] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Pay Balance modal state
  const [payTx, setPayTx] = useState<SupplierTransactionSummary | null>(null);
  const [payAmountInput, setPayAmountInput] = useState("");
  const [payModeInput, setPayModeInput] = useState<PaymentMode>("bank");
  const [payNotesInput, setPayNotesInput] = useState("");
  const [savingPay, setSavingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (silent = false) => {
      if (!id) {
        setLoading(false);
        return;
      }
      if (silent) setRefreshing(true);
      else setLoading(true);
      setActionError(null);
      try {
        const res = await api.getSupplierById(String(id));
        setDetail(res);
        hasLoadedRef.current = true;
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to load supplier.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, id],
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    void loadDetail();
  }, [loadDetail]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        void loadDetail(true);
      }
    }, [loadDetail]),
  );

  const openEditModal = () => {
    if (!detail) return;
    setCompanyInput(detail.supplier.companyName);
    setContactInput(detail.supplier.name);
    setPhoneInput(detail.supplier.phonenumber ?? "");
    setEmailInput(detail.supplier.email ?? "");
    setAddressInput(detail.supplier.address ?? "");
    setActiveInput(detail.supplier.isActive);
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!detail) return;
    const cleanCompany = companyInput.trim();
    const cleanContact = contactInput.trim();
    if (!cleanCompany) {
      setEditError("Company name is required.");
      return;
    }
    if (!cleanContact) {
      setEditError("Contact person name is required.");
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await api.updateSupplier(detail.supplier.id, {
        companyName: cleanCompany,
        name: cleanContact,
        phonenumber: phoneInput.trim(),
        email: emailInput.trim(),
        address: addressInput.trim(),
        isActive: activeInput,
      });
      setDetail({ ...detail, supplier: updated });
      setEditOpen(false);
      toast.success("Supplier updated", `${updated.companyName} details saved.`);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update supplier.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async () => {
    if (!detail || togglingActive) return;
    setTogglingActive(true);
    setActionError(null);
    try {
      const updated = await api.updateSupplier(detail.supplier.id, {
        isActive: !detail.supplier.isActive,
      });
      setDetail({ ...detail, supplier: updated });
      toast.success(
        updated.isActive ? "Supplier activated" : "Supplier deactivated",
        `${updated.companyName} status updated.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update status.";
      setActionError(msg);
      toast.error("Status update failed", msg);
    } finally {
      setTogglingActive(false);
    }
  };

  const openRecordDeliveryModal = () => {
    setDeliveredByInput("");
    setTotalAmountInput("");
    setAmountPaidInput("");
    setPaymentModeInput("bank");
    setNotesInput("");
    setTxError(null);
    setTxModalOpen(true);
  };

  const handleRecordDelivery = async () => {
    if (!detail) return;
    const parsedTotal = Number.parseFloat(totalAmountInput.trim());
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) {
      setTxError("Enter a valid positive delivery total amount.");
      return;
    }
    const parsedPaid = amountPaidInput.trim()
      ? Number.parseFloat(amountPaidInput.trim())
      : parsedTotal;
    if (!Number.isFinite(parsedPaid) || parsedPaid < 0) {
      setTxError("Amount paid cannot be negative.");
      return;
    }

    setSavingTx(true);
    setTxError(null);
    try {
      await api.recordSupplierTransaction({
        supplierId: detail.supplier.id,
        deliveredBy: deliveredByInput.trim() || undefined,
        totalAmount: parsedTotal,
        amountPaid: parsedPaid,
        paymentMode: paymentModeInput,
        notes: notesInput.trim() || undefined,
      });
      setTxModalOpen(false);
      toast.success(
        "Delivery recorded",
        `${formatCurrency(parsedTotal, currency)} logged for ${detail.supplier.companyName}.`,
      );
      await loadDetail(true);
    } catch (err) {
      setTxError(
        err instanceof Error ? err.message : "Failed to record delivery.",
      );
    } finally {
      setSavingTx(false);
    }
  };

  const openPayBalanceModal = (tx: SupplierTransactionSummary) => {
    setPayTx(tx);
    setPayAmountInput(tx.balance.toFixed(2));
    setPayModeInput(tx.paymentMode);
    setPayNotesInput("");
    setPayError(null);
  };

  const handlePayBalance = async () => {
    if (!payTx) return;
    const parsedAmount = Number.parseFloat(payAmountInput.trim());
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setPayError("Enter a valid positive payment amount.");
      return;
    }

    setSavingPay(true);
    setPayError(null);
    try {
      await api.paySupplierTransactionBalance({
        transactionId: payTx.id,
        paymentAmount: parsedAmount,
        paymentMode: payModeInput,
        notes: payNotesInput.trim() || undefined,
      });
      const paidTxNo = payTx.transactionNo;
      setPayTx(null);
      toast.success(
        "Payment recorded",
        `${formatCurrency(parsedAmount, currency)} applied to ${paidTxNo}.`,
      );
      await loadDetail(true);
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : "Failed to record payment.",
      );
    } finally {
      setSavingPay(false);
    }
  };

  if (loading && !detail) {
    return <LoadingState message="Loading supplier details..." />;
  }

  if (!detail) {
    return (
      <View
        style={[
          styles.notFoundWrap,
          { backgroundColor: colors.background, padding: spacing.base },
        ]}
      >
        <EmptyState
          icon={<Building2 size={36} color={colors.mutedForeground} />}
          title="Supplier not found"
          description="This supplier could not be found in the database."
          action={
            <Button
              title="Back to Suppliers"
              variant="outline"
              size="sm"
              onPress={() => router.back()}
            />
          }
        />
      </View>
    );
  }

  const { supplier, transactions } = detail;

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
          onRefresh={() => void loadDetail(true)}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {actionError ? (
        <View
          style={[
            styles.alertBox,
            {
              backgroundColor: colors.dangerTint,
              borderColor: colors.dangerBorder,
              borderRadius: radii.lg,
              padding: spacing.sm + 2,
            },
          ]}
        >
          <AlertCircle size={15} color={colors.dangerText} />
          <Text style={[typography.caption, { color: colors.dangerText, flex: 1 }]}>
            {actionError}
          </Text>
        </View>
      ) : null}

      {/* Supplier Identity Card */}
      <Card>
        <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
          <View style={styles.profileTop}>
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: supplier.isActive
                    ? colors.primaryTint
                    : colors.muted,
                  borderRadius: radii.xl,
                },
              ]}
            >
              <Building2
                size={24}
                color={
                  supplier.isActive ? colors.primary : colors.mutedForeground
                }
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={2}
                style={[typography.titleSm, { color: colors.foreground }]}
              >
                {supplier.companyName}
              </Text>
              <View style={{ marginTop: 4 }}>
                <Badge
                  label={supplier.isActive ? "Active Supplier" : "Inactive"}
                  variant={supplier.isActive ? "success" : "danger"}
                />
              </View>
            </View>
          </View>

          <View
            style={[styles.divider, { backgroundColor: colors.border }]}
          />

          <View style={{ gap: 8 }}>
            <View style={styles.metaRow}>
              <User size={15} color={colors.mutedForeground} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, width: 70 },
                ]}
              >
                Contact
              </Text>
              <Text
                style={[
                  typography.bodyMedium,
                  { color: colors.foreground, flex: 1 },
                ]}
              >
                {supplier.name}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Phone size={15} color={colors.mutedForeground} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, width: 70 },
                ]}
              >
                Phone
              </Text>
              <Text
                style={[
                  typography.bodyMedium,
                  typography.tabular,
                  { color: colors.foreground, flex: 1 },
                ]}
              >
                {supplier.phonenumber || "—"}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Mail size={15} color={colors.mutedForeground} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, width: 70 },
                ]}
              >
                Email
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  typography.bodyMedium,
                  { color: colors.foreground, flex: 1 },
                ]}
              >
                {supplier.email || "—"}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <MapPin size={15} color={colors.mutedForeground} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, width: 70 },
                ]}
              >
                Address
              </Text>
              <Text
                style={[
                  typography.bodyMedium,
                  { color: colors.foreground, flex: 1 },
                ]}
              >
                {supplier.address || "—"}
              </Text>
            </View>
          </View>

          <View style={styles.identityActions}>
            <Button
              title="Edit"
              variant="outline"
              size="sm"
              style={{ flex: 1 }}
              leftIcon={<Edit3 size={14} color={colors.foreground} />}
              onPress={openEditModal}
            />
            <Button
              title={supplier.isActive ? "Disable" : "Activate"}
              variant={supplier.isActive ? "secondary" : "default"}
              size="sm"
              loading={togglingActive}
              leftIcon={
                <Power
                  size={14}
                  color={supplier.isActive ? colors.foreground : "#FFFFFF"}
                />
              }
              onPress={() => void handleToggleActive()}
            />
            <Button
              title="Record Delivery"
              size="sm"
              leftIcon={<Plus size={14} color="#FFFFFF" />}
              onPress={openRecordDeliveryModal}
            />
          </View>
        </CardContent>
      </Card>

      {/* 3-Metric KPI Strip */}
      <View
        style={[
          styles.kpiStrip,
          {
            backgroundColor: colors.border,
            borderColor: colors.border,
            borderRadius: radii.xl,
          },
        ]}
      >
        <View
          style={[
            styles.kpiCell,
            { backgroundColor: colors.card, padding: spacing.md },
          ]}
        >
          <Text style={[typography.micro, { color: colors.mutedForeground }]}>
            Deliveries
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
            {supplier.orderCount}
          </Text>
        </View>

        <View
          style={[
            styles.kpiCell,
            { backgroundColor: colors.card, padding: spacing.md },
          ]}
        >
          <Text style={[typography.micro, { color: colors.mutedForeground }]}>
            Total Purchases
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
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
            {formatCurrency(supplier.totalPurchases, currency)}
          </Text>
        </View>

        <View
          style={[
            styles.kpiCell,
            { backgroundColor: colors.card, padding: spacing.md },
          ]}
        >
          <Text style={[typography.micro, { color: colors.mutedForeground }]}>
            Balance Due
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              typography.titleSm,
              typography.tabular,
              {
                color:
                  supplier.outstandingBalance > 0
                    ? colors.warningText
                    : colors.successText,
                fontFamily: fontFamilies.bold,
                marginTop: 4,
              },
            ]}
          >
            {formatCurrency(supplier.outstandingBalance, currency)}
          </Text>
        </View>
      </View>

      {/* Recorded Supplier Deliveries & Transactions */}
      <Card>
        <CardHeader bordered>
          <CardTitle>Deliveries & payments ({transactions.length})</CardTitle>
        </CardHeader>

        {transactions.length === 0 ? (
          <View style={styles.emptyTx}>
            <Truck size={28} color={colors.mutedForeground} />
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              No deliveries recorded for this supplier yet.
            </Text>
            <Button
              title="Record First Delivery"
              size="sm"
              leftIcon={<Plus size={14} color="#FFFFFF" />}
              onPress={openRecordDeliveryModal}
            />
          </View>
        ) : (
          <View>
            {transactions.map((tx, idx) => {
              const hasBalance = tx.balance > 0;
              return (
                <View
                  key={tx.id}
                  style={[
                    styles.txRow,
                    {
                      paddingHorizontal: spacing.base,
                      paddingVertical: spacing.md,
                      borderBottomWidth:
                        idx < transactions.length - 1
                          ? StyleSheet.hairlineWidth
                          : 0,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.txTopRow}>
                    <View style={styles.txTitleGroup}>
                      <FileText size={15} color={colors.primary} />
                      <Text
                        style={[
                          typography.bodySemibold,
                          typography.tabular,
                          { color: colors.foreground },
                        ]}
                      >
                        {tx.transactionNo}
                      </Text>
                    </View>
                    <Badge
                      label={
                        hasBalance
                          ? `Pending · ${formatCurrency(tx.balance, currency)}`
                          : capitalizeLabel(tx.status)
                      }
                      variant={
                        hasBalance
                          ? "warning"
                          : tx.status === "completed"
                            ? "success"
                            : "danger"
                      }
                    />
                  </View>

                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {capitalizeLabel(tx.paymentMode)} ·{" "}
                    {formatDateTime(tx.transactionDate)}
                    {tx.deliveredBy ? ` · By ${tx.deliveredBy}` : ""}
                  </Text>

                  <View style={styles.txAmountsRow}>
                    <Text
                      style={[
                        typography.caption,
                        typography.tabular,
                        { color: colors.foreground },
                      ]}
                    >
                      Total:{" "}
                      <Text style={{ fontFamily: fontFamilies.semibold }}>
                        {formatCurrency(tx.totalAmount, currency)}
                      </Text>
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        typography.tabular,
                        { color: colors.successText },
                      ]}
                    >
                      Paid: {formatCurrency(tx.amountPaid, currency)}
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        typography.tabular,
                        {
                          color: hasBalance
                            ? colors.warningText
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      Bal: {formatCurrency(tx.balance, currency)}
                    </Text>
                  </View>

                  {tx.notes ? (
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground, marginTop: 2 },
                      ]}
                    >
                      {tx.notes}
                    </Text>
                  ) : null}

                  {hasBalance ? (
                    <View style={{ marginTop: 6, alignItems: "flex-start" }}>
                      <Button
                        title={`Pay Balance (${formatCurrency(tx.balance, currency)})`}
                        variant="outline"
                        size="sm"
                        onPress={() => openPayBalanceModal(tx)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* Edit Supplier Modal */}
      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii["2xl"],
                padding: spacing.lg,
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md }}
            >
              <View style={styles.modalHeader}>
                <Text style={[typography.titleSm, { color: colors.foreground }]}>
                  Edit Supplier
                </Text>
                <Pressable onPress={() => setEditOpen(false)} hitSlop={8}>
                  <X size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {editError ? (
                <View
                  style={[
                    styles.alertBox,
                    {
                      backgroundColor: colors.dangerTint,
                      borderColor: colors.dangerBorder,
                      borderRadius: radii.lg,
                      padding: spacing.sm + 2,
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
                    {editError}
                  </Text>
                </View>
              ) : null}

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Company Name *
                </Text>
                <Input
                  value={companyInput}
                  onChangeText={setCompanyInput}
                  placeholder="Company name"
                  autoCapitalize="words"
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Contact Person *
                </Text>
                <Input
                  value={contactInput}
                  onChangeText={setContactInput}
                  placeholder="Contact person"
                  autoCapitalize="words"
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Phone Number
                </Text>
                <Input
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  placeholder="+233 ..."
                  keyboardType="phone-pad"
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Email Address
                </Text>
                <Input
                  value={emailInput}
                  onChangeText={setEmailInput}
                  placeholder="orders@supplier.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Address
                </Text>
                <Input
                  value={addressInput}
                  onChangeText={setAddressInput}
                  placeholder="Location or warehouse..."
                  multiline
                  numberOfLines={2}
                  containerStyle={{
                    height: 68,
                    alignItems: "flex-start",
                    paddingVertical: 10,
                  }}
                  style={{ textAlignVertical: "top" }}
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Status
                </Text>
                <View style={styles.rowTwoCol}>
                  <Pressable
                    onPress={() => setActiveInput(true)}
                    style={[
                      styles.statusBtn,
                      {
                        borderRadius: radii.lg,
                        borderColor: activeInput
                          ? colors.primary
                          : colors.border,
                        backgroundColor: activeInput
                          ? colors.primaryTint
                          : colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        {
                          fontFamily: fontFamilies.semibold,
                          color: activeInput
                            ? colors.primary
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      Active
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setActiveInput(false)}
                    style={[
                      styles.statusBtn,
                      {
                        borderRadius: radii.lg,
                        borderColor: !activeInput
                          ? colors.dangerBorder
                          : colors.border,
                        backgroundColor: !activeInput
                          ? colors.dangerTint
                          : colors.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        {
                          fontFamily: fontFamilies.semibold,
                          color: !activeInput
                            ? colors.dangerText
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      Inactive
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => setEditOpen(false)}
                />
                <Button
                  title="Save Changes"
                  loading={savingEdit}
                  style={{ flex: 1 }}
                  onPress={() => void handleSaveEdit()}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Record Supplier Delivery Modal */}
      <Modal
        visible={txModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTxModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii["2xl"],
                padding: spacing.lg,
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md }}
            >
              <View style={styles.modalHeader}>
                <Text style={[typography.titleSm, { color: colors.foreground }]}>
                  Record Delivery
                </Text>
                <Pressable onPress={() => setTxModalOpen(false)} hitSlop={8}>
                  <X size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {txError ? (
                <View
                  style={[
                    styles.alertBox,
                    {
                      backgroundColor: colors.dangerTint,
                      borderColor: colors.dangerBorder,
                      borderRadius: radii.lg,
                      padding: spacing.sm + 2,
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
                    {txError}
                  </Text>
                </View>
              ) : null}

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Total Invoice Amount ({currency}) *
                </Text>
                <Input
                  value={totalAmountInput}
                  onChangeText={setTotalAmountInput}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Amount Paid ({currency})
                </Text>
                <Input
                  value={amountPaidInput}
                  onChangeText={setAmountPaidInput}
                  placeholder="Leave blank if paid in full"
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Payment Method
                </Text>
                <View style={styles.paymentRow}>
                  {PAYMENT_MODES.map((m) => {
                    const selected = paymentModeInput === m.value;
                    return (
                      <Pressable
                        key={m.value}
                        onPress={() => setPaymentModeInput(m.value)}
                        style={[
                          styles.paymentBtn,
                          {
                            borderRadius: radii.lg,
                            borderColor: selected
                              ? colors.primary
                              : colors.border,
                            backgroundColor: selected
                              ? colors.primaryTint
                              : colors.background,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.caption,
                            {
                              fontFamily: fontFamilies.semibold,
                              color: selected
                                ? colors.primary
                                : colors.mutedForeground,
                            },
                          ]}
                        >
                          {m.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Delivered By
                </Text>
                <Input
                  value={deliveredByInput}
                  onChangeText={setDeliveredByInput}
                  placeholder="Driver or dispatcher name"
                  autoCapitalize="words"
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Delivery Notes
                </Text>
                <Input
                  value={notesInput}
                  onChangeText={setNotesInput}
                  placeholder="Waybill number or items received..."
                  multiline
                  numberOfLines={2}
                  containerStyle={{
                    height: 68,
                    alignItems: "flex-start",
                    paddingVertical: 10,
                  }}
                  style={{ textAlignVertical: "top" }}
                />
              </View>

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => setTxModalOpen(false)}
                />
                <Button
                  title="Save Delivery"
                  loading={savingTx}
                  style={{ flex: 1 }}
                  onPress={() => void handleRecordDelivery()}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pay Supplier Balance Modal */}
      <Modal
        visible={Boolean(payTx)}
        transparent
        animationType="fade"
        onRequestClose={() => setPayTx(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii["2xl"],
                padding: spacing.lg,
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md }}
            >
              <View style={styles.modalHeader}>
                <Text style={[typography.titleSm, { color: colors.foreground }]}>
                  Settle Balance
                </Text>
                <Pressable onPress={() => setPayTx(null)} hitSlop={8}>
                  <X size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {payTx ? (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Invoice {payTx.transactionNo} · Remaining balance{" "}
                  {formatCurrency(payTx.balance, currency)}
                </Text>
              ) : null}

              {payError ? (
                <View
                  style={[
                    styles.alertBox,
                    {
                      backgroundColor: colors.dangerTint,
                      borderColor: colors.dangerBorder,
                      borderRadius: radii.lg,
                      padding: spacing.sm + 2,
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
                    {payError}
                  </Text>
                </View>
              ) : null}

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Payment Amount ({currency}) *
                </Text>
                <Input
                  value={payAmountInput}
                  onChangeText={setPayAmountInput}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Payment Method
                </Text>
                <View style={styles.paymentRow}>
                  {PAYMENT_MODES.map((m) => {
                    const selected = payModeInput === m.value;
                    return (
                      <Pressable
                        key={m.value}
                        onPress={() => setPayModeInput(m.value)}
                        style={[
                          styles.paymentBtn,
                          {
                            borderRadius: radii.lg,
                            borderColor: selected
                              ? colors.primary
                              : colors.border,
                            backgroundColor: selected
                              ? colors.primaryTint
                              : colors.background,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.caption,
                            {
                              fontFamily: fontFamilies.semibold,
                              color: selected
                                ? colors.primary
                                : colors.mutedForeground,
                            },
                          ]}
                        >
                          {m.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Payment Note
                </Text>
                <Input
                  value={payNotesInput}
                  onChangeText={setPayNotesInput}
                  placeholder="Reference number or receipt note..."
                />
              </View>

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => setPayTx(null)}
                />
                <Button
                  title="Record Payment"
                  loading={savingPay}
                  style={{ flex: 1 }}
                  onPress={() => void handlePayBalance()}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notFoundWrap: {
    flex: 1,
    justifyContent: "center",
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconBox: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  identityActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  kpiStrip: {
    flexDirection: "row",
    borderWidth: 1,
    overflow: "hidden",
    gap: 1,
  },
  kpiCell: {
    flex: 1,
  },
  emptyTx: {
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 10,
  },
  txRow: {
    gap: 4,
  },
  txTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  txTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  txAmountsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderWidth: 1,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTwoCol: {
    flexDirection: "row",
    gap: 10,
  },
  statusBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentRow: {
    flexDirection: "row",
    gap: 8,
  },
  paymentBtn: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});
