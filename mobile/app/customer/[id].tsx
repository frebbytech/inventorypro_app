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
  Calendar,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Receipt,
  ShoppingBag,
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
} from "@/components/ui";
import { useTheme } from "@/theme";
import type { CustomerDetailResponse, SaleStatus } from "@/types/domain";
import {
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
} from "@/utils/formatters";

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;
  const currency = store?.currency || "GHS";

  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  // Edit Customer modal state
  const [editOpen, setEditOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (silent = false) => {
      if (!id) {
        setLoading(false);
        return;
      }
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.getCustomerById(String(id));
        setDetail(res);
        hasLoadedRef.current = true;
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
    setNameInput(detail.customer.name);
    setPhoneInput(detail.customer.phonenumber ?? "");
    setEmailInput(detail.customer.email ?? "");
    setAddressInput(detail.customer.address ?? "");
    setFormError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!detail) return;
    const cleanName = nameInput.trim();
    if (!cleanName) {
      setFormError("Customer name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const updated = await api.updateCustomer(detail.customer.id, {
        name: cleanName,
        phonenumber: phoneInput.trim(),
        email: emailInput.trim(),
        address: addressInput.trim(),
      });
      setDetail({ ...detail, customer: updated });
      setEditOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to update customer.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !detail) {
    return <LoadingState message="Loading customer profile..." />;
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
          icon={<User size={36} color={colors.mutedForeground} />}
          title="Customer not found"
          description="This customer profile could not be found in the database."
          action={
            <Button
              title="Back to Customers"
              variant="outline"
              size="sm"
              onPress={() => router.back()}
            />
          }
        />
      </View>
    );
  }

  const { customer, recentSales } = detail;
  const avgOrder =
    customer.orderCount > 0 ? customer.totalSpent / customer.orderCount : 0;

  const initials =
    customer.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "C";

  const statusBadgeVariant = (status: SaleStatus) => {
    if (status === "completed") return "success" as const;
    if (status === "refunded") return "warning" as const;
    if (status === "failed") return "danger" as const;
    return "secondary" as const;
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
          onRefresh={() => void loadDetail(true)}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* Customer Profile Card */}
      <Card>
        <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
          <View style={styles.profileTop}>
            <View
              style={[
                styles.avatarCircle,
                {
                  backgroundColor: colors.primaryTint,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  typography.titleMd,
                  { color: colors.primary, fontFamily: fontFamilies.bold },
                ]}
              >
                {initials}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={2}
                style={[typography.titleSm, { color: colors.foreground }]}
              >
                {customer.name}
              </Text>
              <View style={{ marginTop: 4 }}>
                <Badge
                  label={
                    customer.orderCount > 0 ? "Repeat Customer" : "New Profile"
                  }
                  variant={customer.orderCount > 0 ? "success" : "secondary"}
                />
              </View>
            </View>
          </View>

          <View
            style={[styles.divider, { backgroundColor: colors.border }]}
          />

          <View style={{ gap: 8 }}>
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
                {customer.phonenumber || "—"}
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
                {customer.email || "—"}
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
                {customer.address || "—"}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Calendar size={15} color={colors.mutedForeground} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, width: 70 },
                ]}
              >
                Joined
              </Text>
              <Text
                style={[
                  typography.bodyMedium,
                  { color: colors.foreground, flex: 1 },
                ]}
              >
                {formatDateTime(customer.createdAt)}
              </Text>
            </View>
          </View>

          <Button
            title="Edit Customer"
            variant="outline"
            size="sm"
            leftIcon={<Edit3 size={14} color={colors.foreground} />}
            onPress={openEditModal}
          />
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
            Orders
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
            {customer.orderCount}
          </Text>
        </View>

        <View
          style={[
            styles.kpiCell,
            { backgroundColor: colors.card, padding: spacing.md },
          ]}
        >
          <Text style={[typography.micro, { color: colors.mutedForeground }]}>
            Total Spent
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
                marginTop: 4,
              },
            ]}
          >
            {formatCurrency(customer.totalSpent, currency)}
          </Text>
        </View>

        <View
          style={[
            styles.kpiCell,
            { backgroundColor: colors.card, padding: spacing.md },
          ]}
        >
          <Text style={[typography.micro, { color: colors.mutedForeground }]}>
            Avg Order
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
            {formatCurrency(avgOrder, currency)}
          </Text>
        </View>
      </View>

      {/* Recent Orders */}
      <Card>
        <CardHeader bordered>
          <CardTitle>Recent orders ({recentSales.length})</CardTitle>
        </CardHeader>

        {recentSales.length === 0 ? (
          <View style={styles.emptyOrders}>
            <ShoppingBag size={28} color={colors.mutedForeground} />
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              No orders linked to this customer yet.
            </Text>
          </View>
        ) : (
          <View>
            {recentSales.map((sale, idx) => (
              <Pressable
                key={sale.id}
                onPress={() =>
                  router.push({
                    pathname: "/sales/[id]",
                    params: { id: sale.id },
                  })
                }
                style={({ pressed }) => [
                  styles.saleRow,
                  {
                    paddingHorizontal: spacing.base,
                    paddingVertical: spacing.md,
                    borderBottomWidth:
                      idx < recentSales.length - 1
                        ? StyleSheet.hairlineWidth
                        : 0,
                    borderBottomColor: colors.border,
                    backgroundColor: pressed ? colors.muted : colors.card,
                  },
                ]}
              >
                <View style={styles.saleLeft}>
                  <View
                    style={[
                      styles.receiptIcon,
                      {
                        backgroundColor: colors.primaryTint,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Receipt size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.receiptTitleRow}>
                      <Text
                        style={[
                          typography.bodySemibold,
                          typography.tabular,
                          { color: colors.foreground },
                        ]}
                      >
                        {sale.receiptNo}
                      </Text>
                      <Badge
                        label={capitalizeLabel(sale.status)}
                        variant={statusBadgeVariant(sale.status)}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground, marginTop: 2 },
                      ]}
                    >
                      {capitalizeLabel(sale.paymentMode)} · {sale.itemCount}{" "}
                      {sale.itemCount === 1 ? "item" : "items"} ·{" "}
                      {formatDateTime(sale.saleDate)}
                    </Text>
                  </View>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      typography.tabular,
                      { color: colors.foreground },
                    ]}
                  >
                    {formatCurrency(sale.totalAmount, currency)}
                  </Text>
                  {sale.discount > 0 ? (
                    <Text
                      style={[typography.micro, { color: colors.mutedForeground }]}
                    >
                      Disc {formatCurrency(sale.discount, currency)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      {/* Edit Customer Modal */}
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
                  Edit Customer
                </Text>
                <Pressable onPress={() => setEditOpen(false)} hitSlop={8}>
                  <X size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {formError ? (
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
                    {formError}
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
                  Full Name *
                </Text>
                <Input
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Full name"
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
                  placeholder="customer@example.com"
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
                  placeholder="Street, neighborhood, or city..."
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
                  onPress={() => setEditOpen(false)}
                />
                <Button
                  title="Save Changes"
                  loading={saving}
                  style={{ flex: 1 }}
                  onPress={() => void handleSaveEdit()}
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
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    borderWidth: 1.5,
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
  kpiStrip: {
    flexDirection: "row",
    borderWidth: 1,
    overflow: "hidden",
    gap: 1,
  },
  kpiCell: {
    flex: 1,
  },
  emptyOrders: {
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 8,
  },
  saleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  saleLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  receiptIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
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
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});
