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
  ChevronRight,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useTheme } from "@/theme";
import type { CustomerItem } from "@/types/domain";
import { formatCurrency, formatDateTime } from "@/utils/formatters";

export default function CustomersDirectoryScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;
  const currency = store?.currency || "GHS";

  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Add / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(
    null,
  );
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadCustomers = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setActionError(null);
      try {
        const list = await api.getCustomers(query);
        setCustomers(list);
        hasLoadedRef.current = true;
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to load customers.",
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
      void loadCustomers();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadCustomers]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        void loadCustomers(true);
      }
    }, [loadCustomers]),
  );

  const stats = useMemo(() => {
    const totalSpend = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    const repeatCount = customers.filter((c) => c.orderCount > 0).length;
    return {
      total: customers.length,
      repeatCount,
      totalSpend,
    };
  }, [customers]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setNameInput("");
    setPhoneInput("");
    setEmailInput("");
    setAddressInput("");
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: CustomerItem) => {
    setEditingCustomer(item);
    setNameInput(item.name);
    setPhoneInput(item.phonenumber ?? "");
    setEmailInput(item.email ?? "");
    setAddressInput(item.address ?? "");
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveModal = async () => {
    const cleanName = nameInput.trim();
    if (!cleanName) {
      setFormError("Customer name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, {
          name: cleanName,
          phonenumber: phoneInput.trim(),
          email: emailInput.trim(),
          address: addressInput.trim(),
        });
      } else {
        await api.createCustomer({
          name: cleanName,
          phonenumber: phoneInput.trim() || undefined,
          email: emailInput.trim() || undefined,
          address: addressInput.trim() || undefined,
        });
      }
      setModalOpen(false);
      await loadCustomers(true);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save customer.",
      );
    } finally {
      setSaving(false);
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
              placeholder="Search name, phone, email, address..."
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
            <Users size={15} color={colors.primary} />
            <Text
              style={[
                typography.caption,
                typography.tabular,
                { color: colors.foreground },
              ]}
            >
              {stats.total} {stats.total === 1 ? "customer" : "customers"} ·{" "}
              {stats.repeatCount} with orders
            </Text>
          </View>
          <Text
            style={[
              typography.caption,
              typography.tabular,
              { color: colors.primary, fontFamily: fontFamilies.semibold },
            ]}
          >
            {formatCurrency(stats.totalSpend, currency)}
          </Text>
        </View>

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
      </View>

      {loading && customers.length === 0 ? (
        <LoadingState message="Loading customers directory..." />
      ) : (
        <FlatList
          data={customers}
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
              onRefresh={() => void loadCustomers(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => {
            const initials =
              item.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("") || "C";

            return (
              <Card>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/customer/[id]",
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
                          styles.avatarCircle,
                          {
                            backgroundColor: colors.primaryTint,
                            borderRadius: radii.full,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.bodySemibold,
                            { color: colors.primary, fontFamily: fontFamilies.bold },
                          ]}
                        >
                          {initials}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={[typography.subtitle, { color: colors.foreground }]}
                        >
                          {item.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            typography.caption,
                            typography.tabular,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {item.orderCount}{" "}
                          {item.orderCount === 1 ? "order" : "orders"} ·{" "}
                          {formatCurrency(item.totalSpent, currency)} spent
                        </Text>
                      </View>
                    </View>

                    <View style={styles.rightHeaderRow}>
                      <Badge
                        label={item.orderCount > 0 ? "Active" : "New"}
                        variant={item.orderCount > 0 ? "success" : "secondary"}
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
                        ? `Last order ${formatDateTime(item.lastOrderAt)}`
                        : `Added ${formatDateTime(item.createdAt)}`}
                    </Text>

                    <Button
                      title="Edit"
                      variant="outline"
                      size="sm"
                      leftIcon={<Edit3 size={13} color={colors.foreground} />}
                      onPress={() => openEditModal(item)}
                    />
                  </View>
                </Pressable>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<UserCheck size={36} color={colors.mutedForeground} />}
              title="No customers found"
              description={
                query
                  ? `No customers match "${query}".`
                  : "Add customer profiles to track repeat orders and lifetime spend."
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
                    title="Add Customer"
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

      {/* Add / Edit Customer Modal */}
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
                  {editingCustomer ? "Edit Customer" : "New Customer"}
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
                  Full Name *
                </Text>
                <Input
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="e.g. Kwame Boateng"
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
                  Phone Number
                </Text>
                <Input
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  placeholder="e.g. +233 24 000 0000"
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
                  onPress={() => setModalOpen(false)}
                />
                <Button
                  title={editingCustomer ? "Update" : "Create"}
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
  avatarCircle: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});
