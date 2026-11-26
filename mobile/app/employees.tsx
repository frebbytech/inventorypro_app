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
  Clock,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
import { LoadingState } from "@/components/LoadingState";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { useTheme } from "@/theme";
import type { EmployeeItem } from "@/types/domain";
import {
  getUserErrorMessage,
  normalizeError,
  type NormalizedAppError,
} from "@/utils/errorHandler";
import { formatCurrency, formatDateTime } from "@/utils/formatters";

export default function EmployeesScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const { user: currentUser, store } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;
  const currency = store?.currency || "GHS";
  const isAdmin = currentUser?.role === "admin";

  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<NormalizedAppError | null>(null);
  const hasLoadedRef = useRef(false);

  // Add Employee modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [firstnameInput, setFirstnameInput] = useState("");
  const [lastnameInput, setLastnameInput] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [roleInput, setRoleInput] = useState<"admin" | "member">("member");
  const [passwordInput, setPasswordInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadEmployees = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setActionError(null);
      try {
        const list = await api.getEmployees(query);
        setEmployees(list);
        hasLoadedRef.current = true;
      } catch (err) {
        setActionError(
          normalizeError(err, {
            fallback: "Could not load team members. Please try again.",
            context: "employees.load",
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
      void loadEmployees();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadEmployees]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        void loadEmployees(true);
      }
    }, [loadEmployees]),
  );

  const stats = useMemo(() => {
    const totalRevenue = employees.reduce((sum, e) => sum + e.totalRevenue, 0);
    const totalOrders = employees.reduce(
      (sum, e) => sum + e.completedSalesCount,
      0,
    );
    const adminCount = employees.filter((e) => e.role === "admin").length;
    return {
      total: employees.length,
      adminCount,
      totalRevenue,
      totalOrders,
    };
  }, [employees]);

  const openCreateModal = () => {
    setFirstnameInput("");
    setLastnameInput("");
    setUsernameInput("");
    setEmailInput("");
    setPhoneInput("");
    setRoleInput("member");
    setPasswordInput("");
    setFormError(null);
    setModalOpen(true);
  };

  const handleCreateEmployee = async () => {
    if (!firstnameInput.trim()) {
      setFormError("First name is required.");
      return;
    }
    if (!usernameInput.trim()) {
      setFormError("Username is required.");
      return;
    }
    if (!emailInput.trim()) {
      setFormError("Email address is required.");
      return;
    }
    if (passwordInput.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await api.createEmployee({
        firstname: firstnameInput.trim(),
        lastname: lastnameInput.trim(),
        username: usernameInput.trim(),
        email: emailInput.trim(),
        phonenumber: phoneInput.trim() || undefined,
        role: roleInput,
        password: passwordInput,
      });
      setModalOpen(false);
      toast.success(
        "Team member created",
        `${firstnameInput.trim()} (@${usernameInput.trim()}) added.`,
      );
      await loadEmployees(true);
    } catch (err) {
      setFormError(
        getUserErrorMessage(
          err,
          "Could not create team member. Please try again.",
          "employees.create",
        ),
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
              placeholder="Search name, @username, email..."
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
          {isAdmin ? (
            <Button
              title="Add"
              leftIcon={<Plus size={16} color="#FFFFFF" />}
              onPress={openCreateModal}
            />
          ) : null}
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
              {stats.total} staff ({stats.adminCount} admin) · {stats.totalOrders} sales
            </Text>
          </View>
          <Text
            style={[
              typography.caption,
              typography.tabular,
              { color: colors.primary, fontFamily: fontFamilies.semibold },
            ]}
          >
            {formatCurrency(stats.totalRevenue, currency)}
          </Text>
        </View>

        {actionError ? (
          <InlineErrorBanner
            message={actionError.userMessage}
            category={actionError.category}
            onRetry={() => void loadEmployees(employees.length > 0)}
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

      {loading && employees.length === 0 ? (
        <LoadingState message="Loading team & cashier stats..." />
      ) : (
        <FlatList
          data={employees}
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
              onRefresh={() => void loadEmployees(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => {
            const initials =
              item.fullName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("") || "U";

            return (
              <Card>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/employee/[id]",
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
                            backgroundColor:
                              item.role === "admin"
                                ? colors.primaryTint
                                : colors.muted,
                            borderRadius: radii.full,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.bodySemibold,
                            {
                              color:
                                item.role === "admin"
                                  ? colors.primary
                                  : colors.foreground,
                              fontFamily: fontFamilies.bold,
                            },
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
                          {item.fullName}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            typography.caption,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          @{item.username}
                          {item.id === currentUser?.id ? " · You" : ""}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.rightHeaderRow}>
                      <Badge
                        label={item.role === "admin" ? "Admin" : "Cashier"}
                        variant={item.role === "admin" ? "default" : "secondary"}
                      />
                      <ChevronRight size={16} color={colors.mutedForeground} />
                    </View>
                  </View>

                  <View style={{ gap: 4 }}>
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
                        Completed
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
                        {item.completedSalesCount} sales
                      </Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text
                        style={[typography.micro, { color: colors.mutedForeground }]}
                      >
                        Avg Ticket
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
                        {formatCurrency(item.averageTicket, currency)}
                      </Text>
                    </View>
                    <View style={[styles.metricCol, { alignItems: "flex-end" }]}>
                      <Text
                        style={[typography.micro, { color: colors.mutedForeground }]}
                      >
                        Revenue
                      </Text>
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
                        {formatCurrency(item.totalRevenue, currency)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metaLine}>
                    <Clock size={12} color={colors.mutedForeground} />
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Last login: {formatDateTime(item.lastLoginAt)}
                    </Text>
                  </View>
                </Pressable>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<UserCog size={36} color={colors.mutedForeground} />}
              title="No team members found"
              description={
                query
                  ? `No staff match "${query}".`
                  : "Add store staff and cashiers to track performance by operator."
              }
              action={
                query ? (
                  <Button
                    title="Clear search"
                    variant="outline"
                    size="sm"
                    onPress={() => setQuery("")}
                  />
                ) : isAdmin ? (
                  <Button
                    title="Add Team Member"
                    size="sm"
                    leftIcon={<Plus size={14} color="#FFFFFF" />}
                    onPress={openCreateModal}
                  />
                ) : undefined
              }
            />
          }
        />
      )}

      {/* Add Team Member Modal */}
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
                  New Team Member
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

              <View style={styles.rowTwoCol}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    First Name *
                  </Text>
                  <Input
                    value={firstnameInput}
                    onChangeText={setFirstnameInput}
                    placeholder="Akosua"
                    autoCapitalize="words"
                    autoFocus
                  />
                </View>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Last Name
                  </Text>
                  <Input
                    value={lastnameInput}
                    onChangeText={setLastnameInput}
                    placeholder="Mensah"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Username *
                </Text>
                <Input
                  value={usernameInput}
                  onChangeText={setUsernameInput}
                  placeholder="e.g. akosua"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Email Address *
                </Text>
                <Input
                  value={emailInput}
                  onChangeText={setEmailInput}
                  placeholder="staff@store.com"
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
                  Role
                </Text>
                <View style={styles.rowTwoCol}>
                  <Pressable
                    onPress={() => setRoleInput("member")}
                    style={[
                      styles.roleBtn,
                      {
                        borderRadius: radii.lg,
                        borderColor:
                          roleInput === "member" ? colors.primary : colors.border,
                        backgroundColor:
                          roleInput === "member"
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
                          color:
                            roleInput === "member"
                              ? colors.primary
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      Cashier / Member
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRoleInput("admin")}
                    style={[
                      styles.roleBtn,
                      {
                        borderRadius: radii.lg,
                        borderColor:
                          roleInput === "admin" ? colors.primary : colors.border,
                        backgroundColor:
                          roleInput === "admin"
                            ? colors.primaryTint
                            : colors.background,
                      },
                    ]}
                  >
                    <ShieldCheck
                      size={14}
                      color={
                        roleInput === "admin"
                          ? colors.primary
                          : colors.mutedForeground
                      }
                    />
                    <Text
                      style={[
                        typography.caption,
                        {
                          fontFamily: fontFamilies.semibold,
                          color:
                            roleInput === "admin"
                              ? colors.primary
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      Administrator
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Initial Password *
                </Text>
                <Input
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                  placeholder="At least 6 characters"
                  secureTextEntry
                  autoCapitalize="none"
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
                  title="Create Staff"
                  loading={saving}
                  style={{ flex: 1 }}
                  onPress={() => void handleCreateEmployee()}
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
  metricsBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  metricCol: {
    gap: 2,
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
  roleBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});
