import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
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
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  Building2,
  ChevronRight,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Search,
  Truck,
  User,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
import { LoadingState } from "@/components/LoadingState";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { useTheme } from "@/theme";
import type { SupplierItem } from "@/types/domain";
import {
  getUserErrorMessage,
  normalizeError,
  type NormalizedAppError,
} from "@/utils/errorHandler";
import { formatCurrency, formatDateTime } from "@/utils/formatters";

export default function SuppliersDirectoryScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;
  const currency = store?.currency || "GHS";

  const [query, setQuery] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<NormalizedAppError | null>(null);
  const hasLoadedRef = useRef(false);

  // Add / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(
    null,
  );
  const [companyInput, setCompanyInput] = useState("");
  const [contactInput, setContactInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [activeInput, setActiveInput] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadSuppliers = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setActionError(null);
      try {
        const list = await api.getSuppliers(query);
        setSuppliers(list);
        hasLoadedRef.current = true;
      } catch (err) {
        setActionError(
          normalizeError(err, {
            fallback: "Could not load suppliers. Please try again.",
            context: "suppliers.load",
          }),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, query],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSuppliers();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadSuppliers]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        void loadSuppliers(true);
      }
    }, [loadSuppliers]),
  );

  const stats = useMemo(() => {
    const activeCount = suppliers.filter((s) => s.isActive).length;
    const totalPurchases = suppliers.reduce(
      (sum, s) => sum + s.totalPurchases,
      0,
    );
    const totalBalance = suppliers.reduce(
      (sum, s) => sum + s.outstandingBalance,
      0,
    );
    return {
      total: suppliers.length,
      activeCount,
      totalPurchases,
      totalBalance,
    };
  }, [suppliers]);

  const openCreateModal = () => {
    setEditingSupplier(null);
    setCompanyInput("");
    setContactInput("");
    setPhoneInput("");
    setEmailInput("");
    setAddressInput("");
    setActiveInput(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: SupplierItem) => {
    setEditingSupplier(item);
    setCompanyInput(item.companyName);
    setContactInput(item.name);
    setPhoneInput(item.phonenumber ?? "");
    setEmailInput(item.email ?? "");
    setAddressInput(item.address ?? "");
    setActiveInput(item.isActive);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveModal = async () => {
    const cleanCompany = companyInput.trim();
    const cleanContact = contactInput.trim();
    if (!cleanCompany) {
      setFormError("Company name is required.");
      return;
    }
    if (!cleanContact) {
      setFormError("Contact person name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, {
          companyName: cleanCompany,
          name: cleanContact,
          phonenumber: phoneInput.trim(),
          email: emailInput.trim(),
          address: addressInput.trim(),
          isActive: activeInput,
        });
        toast.success("Supplier updated", `${cleanCompany} details saved.`);
      } else {
        await api.createSupplier({
          companyName: cleanCompany,
          name: cleanContact,
          phonenumber: phoneInput.trim() || undefined,
          email: emailInput.trim() || undefined,
          address: addressInput.trim() || undefined,
          isActive: activeInput,
        });
        toast.success("Supplier created", `${cleanCompany} added to suppliers.`);
      }
      setModalOpen(false);
      await loadSuppliers(true);
    } catch (err) {
      setFormError(
        getUserErrorMessage(
          err,
          "Could not save supplier. Please try again.",
          "suppliers.save",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: SupplierItem) => {
    setActionError(null);
    try {
      const updated = await api.updateSupplier(item.id, {
        isActive: !item.isActive,
      });
      setSuppliers((prev) =>
        prev.map((s) => (s.id === item.id ? updated : s)),
      );
      toast.success(
        updated.isActive ? "Supplier activated" : "Supplier deactivated",
        `${updated.companyName} status updated.`,
      );
    } catch (err) {
      const normalized = normalizeError(err, {
        fallback: "Could not update supplier status. Please try again.",
        context: "suppliers.toggleActive",
      });
      setActionError(normalized);
      toast.error(
        "Status update failed",
        normalized.userMessage,
        undefined,
        normalized.requiresSignIn
          ? { label: "Sign In", onPress: () => router.push("/sign-in") }
          : normalized.retryable
            ? { label: "Retry", onPress: () => void handleToggleActive(item) }
            : undefined,
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={{
          paddingHorizontal: spacing.base,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
          gap: spacing.sm + 2,
        }}
      >
        <View style={styles.searchActionRow}>
          <View style={{ flex: 1 }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search company, contact, phone..."
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon={<Search size={18} color={colors.mutedForeground} />}
              rightSlot={
                query.length > 0 ? (
                  <Pressable onPress={() => setQuery("")} hitSlop={8}>
                    <X size={16} color={colors.mutedForeground} />
                  </Pressable>
                ) : null
              }
            />
          </View>
          <Button
            title="Add"
            leftIcon={<Plus size={16} color="#FFFFFF" />}
            onPress={openCreateModal}
          />
        </View>

        <View
          style={[
            styles.summaryBar,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radii.xl,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}
        >
          <View style={styles.summaryItem}>
            <Truck size={15} color={colors.primary} />
            <Text
              style={[
                typography.caption,
                typography.tabular,
                { color: colors.foreground },
              ]}
            >
              {stats.total} {stats.total === 1 ? "supplier" : "suppliers"} ·{" "}
              {stats.activeCount} active
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={[
                typography.caption,
                typography.tabular,
                { color: colors.foreground, fontFamily: fontFamilies.semibold },
              ]}
            >
              {formatCurrency(stats.totalPurchases, currency)}
            </Text>
            {stats.totalBalance > 0 ? (
              <Text
                style={[
                  typography.micro,
                  typography.tabular,
                  { color: colors.warningText },
                ]}
              >
                Due {formatCurrency(stats.totalBalance, currency)}
              </Text>
            ) : null}
          </View>
        </View>

        {actionError ? (
          <InlineErrorBanner
            message={actionError.userMessage}
            category={actionError.category}
            onRetry={() => void loadSuppliers(suppliers.length > 0)}
            retrying={loading || refreshing}
            onSignIn={
              actionError.requiresSignIn
                ? () => router.push("/sign-in")
                : undefined
            }
            onDismiss={() => setActionError(null)}
          />
        ) : null}
      </View>

      {loading && suppliers.length === 0 ? (
        <LoadingState message="Loading suppliers directory..." />
      ) : (
        <FlatList
          data={suppliers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: spacing.base,
            paddingTop: spacing.xs,
            gap: spacing.md,
            paddingBottom: spacing["3xl"],
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadSuppliers(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <Card>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/supplier/[id]",
                    params: { id: item.id },
                  })
                }
                style={({ pressed }) => [
                  {
                    padding: spacing.base,
                    gap: spacing.sm + 2,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <View style={styles.cardHeaderRow}>
                  <View style={styles.titleBlock}>
                    <View
                      style={[
                        styles.iconCircle,
                        {
                          backgroundColor: item.isActive
                            ? colors.primaryTint
                            : colors.muted,
                          borderRadius: radii.lg,
                        },
                      ]}
                    >
                      <Building2
                        size={18}
                        color={
                          item.isActive ? colors.primary : colors.mutedForeground
                        }
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[typography.subtitle, { color: colors.foreground }]}
                      >
                        {item.companyName}
                      </Text>
                      <View style={styles.contactLine}>
                        <User size={12} color={colors.mutedForeground} />
                        <Text
                          numberOfLines={1}
                          style={[
                            typography.caption,
                            { color: colors.mutedForeground, flex: 1 },
                          ]}
                        >
                          {item.name}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.rightHeaderRow}>
                    <Badge
                      label={item.isActive ? "Active" : "Inactive"}
                      variant={item.isActive ? "success" : "danger"}
                    />
                    <ChevronRight size={16} color={colors.mutedForeground} />
                  </View>
                </View>

                <View style={{ gap: 4 }}>
                  {item.phonenumber ? (
                    <View style={styles.metaLine}>
                      <Phone size={13} color={colors.mutedForeground} />
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.caption,
                          typography.tabular,
                          { color: colors.mutedForeground, flex: 1 },
                        ]}
                      >
                        {item.phonenumber}
                      </Text>
                    </View>
                  ) : null}
                  {item.email ? (
                    <View style={styles.metaLine}>
                      <Mail size={13} color={colors.mutedForeground} />
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.caption,
                          { color: colors.mutedForeground, flex: 1 },
                        ]}
                      >
                        {item.email}
                      </Text>
                    </View>
                  ) : null}
                  {item.address ? (
                    <View style={styles.metaLine}>
                      <MapPin size={13} color={colors.mutedForeground} />
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.caption,
                          { color: colors.mutedForeground, flex: 1 },
                        ]}
                      >
                        {item.address}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.metricsBox,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                    },
                  ]}
                >
                  <View style={styles.metricCol}>
                    <Text
                      style={[typography.micro, { color: colors.mutedForeground }]}
                    >
                      Deliveries
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        typography.tabular,
                        {
                          color: colors.foreground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      {item.orderCount}
                    </Text>
                  </View>
                  <View style={styles.metricCol}>
                    <Text
                      style={[typography.micro, { color: colors.mutedForeground }]}
                    >
                      Purchases
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        typography.tabular,
                        {
                          color: colors.foreground,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      {formatCurrency(item.totalPurchases, currency)}
                    </Text>
                  </View>
                  <View style={[styles.metricCol, { alignItems: "flex-end" }]}>
                    <Text
                      style={[typography.micro, { color: colors.mutedForeground }]}
                    >
                      Balance Due
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        typography.tabular,
                        {
                          color:
                            item.outstandingBalance > 0
                              ? colors.warningText
                              : colors.successText,
                          fontFamily: fontFamilies.semibold,
                        },
                      ]}
                    >
                      {formatCurrency(item.outstandingBalance, currency)}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.cardFooterRow,
                    {
                      borderTopColor: colors.border,
                      paddingTop: spacing.sm,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground, flex: 1 },
                    ]}
                  >
                    {item.lastOrderAt
                      ? `Last delivery ${formatDateTime(item.lastOrderAt)}`
                      : `Added ${formatDateTime(item.createdAt)}`}
                  </Text>

                  <Button
                    title="Edit"
                    variant="outline"
                    size="sm"
                    leftIcon={<Edit3 size={13} color={colors.foreground} />}
                    onPress={() => openEditModal(item)}
                  />
                  <Button
                    title={item.isActive ? "Disable" : "Enable"}
                    variant={item.isActive ? "secondary" : "default"}
                    size="sm"
                    leftIcon={
                      <Power
                        size={13}
                        color={item.isActive ? colors.foreground : "#FFFFFF"}
                      />
                    }
                    onPress={() => void handleToggleActive(item)}
                  />
                </View>
              </Pressable>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Truck size={36} color={colors.mutedForeground} />}
              title="No suppliers found"
              description={
                query
                  ? `No suppliers match "${query}".`
                  : "Add suppliers and distributors to record stock deliveries and balances."
              }
              action={
                query ? (
                  <Button
                    title="Clear search"
                    variant="outline"
                    size="sm"
                    onPress={() => setQuery("")}
                  />
                ) : (
                  <Button
                    title="Add Supplier"
                    size="sm"
                    leftIcon={<Plus size={14} color="#FFFFFF" />}
                    onPress={openCreateModal}
                  />
                )
              }
            />
          }
        />
      )}

      {/* Add / Edit Supplier Modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
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
                  {editingSupplier ? "Edit Supplier" : "New Supplier"}
                </Text>
                <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
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
                  Company Name *
                </Text>
                <Input
                  value={companyInput}
                  onChangeText={setCompanyInput}
                  placeholder="e.g. Nestle Ghana Distributors"
                  autoCapitalize="words"
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
                  Contact Person *
                </Text>
                <Input
                  value={contactInput}
                  onChangeText={setContactInput}
                  placeholder="e.g. Yaw Mensah"
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
                  placeholder="+233 24 000 0000"
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
                  placeholder="Warehouse or office location..."
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
                  onPress={() => setModalOpen(false)}
                />
                <Button
                  title={editingSupplier ? "Update" : "Create"}
                  loading={saving}
                  style={{ flex: 1 }}
                  onPress={() => void handleSaveModal()}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  iconCircle: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  contactLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  rightHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricsBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  metricCol: {
    gap: 2,
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});
