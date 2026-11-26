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
  Clock,
  Edit3,
  Mail,
  Phone,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  UserCog,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
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
import type { EmployeeDetailResponse, SaleStatus } from "@/types/domain";
import {
  getUserErrorMessage,
  normalizeError,
  type NormalizedAppError,
} from "@/utils/errorHandler";
import {
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
} from "@/utils/formatters";

export default function EmployeeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { user: currentUser, store } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;
  const currency = store?.currency || "GHS";
  const isAdmin = currentUser?.role === "admin";

  const [detail, setDetail] = useState<EmployeeDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<NormalizedAppError | null>(null);
  const hasLoadedRef = useRef(false);

  // Edit Employee modal state
  const [editOpen, setEditOpen] = useState(false);
  const [firstnameInput, setFirstnameInput] = useState("");
  const [lastnameInput, setLastnameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [roleInput, setRoleInput] = useState<"admin" | "member">("member");
  const [passwordInput, setPasswordInput] = useState("");
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
      setLoadError(null);
      try {
        const res = await api.getEmployeeById(String(id));
        setDetail(res);
        hasLoadedRef.current = true;
      } catch (err) {
        setLoadError(
          normalizeError(err, {
            fallback: "Could not load staff performance. Please try again.",
            context: "employeeDetail.load",
          }),
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
    setFirstnameInput(detail.employee.firstname);
    setLastnameInput(detail.employee.lastname);
    setEmailInput(detail.employee.email);
    setPhoneInput(detail.employee.phonenumber ?? "");
    setRoleInput(detail.employee.role);
    setPasswordInput("");
    setFormError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!detail) return;
    if (!firstnameInput.trim()) {
      setFormError("First name is required.");
      return;
    }
    if (!emailInput.trim()) {
      setFormError("Email address is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const updated = await api.updateEmployee(detail.employee.id, {
        firstname: firstnameInput.trim(),
        lastname: lastnameInput.trim(),
        email: emailInput.trim(),
        phonenumber: phoneInput.trim(),
        role: roleInput,
        ...(passwordInput.trim() ? { password: passwordInput.trim() } : {}),
      });
      setDetail({ ...detail, employee: updated });
      setEditOpen(false);
      toast.success("Team member updated", `${updated.fullName} profile saved.`);
    } catch (err) {
      setFormError(
        getUserErrorMessage(
          err,
          "Could not update team member. Please try again.",
          "employeeDetail.save",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !detail) {
    return <LoadingState message="Loading staff performance..." />;
  }

  if (!detail && loadError) {
    return (
      <View
        style={[
          styles.notFoundWrap,
          { backgroundColor: colors.background, padding: spacing.base, gap: spacing.md },
        ]}
      >
        <InlineErrorBanner
          message={loadError.userMessage}
          category={loadError.category}
          onRetry={() => void loadDetail(false)}
          retrying={loading}
          onSignIn={
            loadError.requiresSignIn ? () => router.push("/sign-in") : undefined
          }
        />
        <Button
          title="Back to Team"
          variant="outline"
          size="sm"
          onPress={() => router.back()}
        />
      </View>
    );
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
          icon={<UserCog size={36} color={colors.mutedForeground} />}
          title="Team member not found"
          description="This staff account could not be found."
          action={
            <Button
              title="Back to Team"
              variant="outline"
              size="sm"
              onPress={() => router.back()}
            />
          }
        />
      </View>
    );
  }

  const { employee, paymentBreakdown, recentSales } = detail;
  const initials =
    employee.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U";

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
      {loadError ? (
        <InlineErrorBanner
          message={loadError.userMessage}
          category={loadError.category}
          onRetry={() => void loadDetail(true)}
          retrying={refreshing}
          onSignIn={
            loadError.requiresSignIn ? () => router.push("/sign-in") : undefined
          }
          onDismiss={() => setLoadError(null)}
        />
      ) : null}

      {/* Identity Card */}
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
                {employee.fullName}
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, marginTop: 1 },
                ]}
              >
                @{employee.username}
              </Text>
              <View style={{ marginTop: 6 }}>
                <Badge
                  label={
                    employee.role === "admin" ? "Administrator" : "Team Member"
                  }
                  variant={employee.role === "admin" ? "default" : "secondary"}
                />
              </View>
            </View>
          </View>

          <View
            style={[styles.divider, { backgroundColor: colors.border }]}
          />

          <View style={{ gap: 8 }}>
            <View style={styles.metaRow}>
              <Mail size={15} color={colors.mutedForeground} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, width: 76 },
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
                {employee.email}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Phone size={15} color={colors.mutedForeground} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, width: 76 },
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
                {employee.phonenumber || "—"}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Clock size={15} color={colors.mutedForeground} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, width: 76 },
                ]}
              >
                Last login
              </Text>
              <Text
                style={[
                  typography.bodyMedium,
                  { color: colors.foreground, flex: 1 },
                ]}
              >
                {formatDateTime(employee.lastLoginAt)}
              </Text>
            </View>
          </View>

          {isAdmin || currentUser?.id === employee.id ? (
            <Button
              title="Edit Profile"
              variant="outline"
              size="sm"
              leftIcon={<Edit3 size={14} color={colors.foreground} />}
              onPress={openEditModal}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* 2x2 KPI Grid */}
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
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Total revenue
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
              {formatCurrency(employee.totalRevenue, currency)}
            </Text>
          </View>

          <View
            style={[
              styles.kpiCell,
              { backgroundColor: colors.card, padding: spacing.base },
            ]}
          >
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Completed sales
            </Text>
            <Text
              style={[
                typography.titleSm,
                typography.tabular,
                {
                  color: colors.foreground,
                  fontFamily: fontFamilies.bold,
                  marginTop: spacing.xs,
                },
              ]}
            >
              {employee.completedSalesCount}
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
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Avg ticket
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
              {formatCurrency(employee.averageTicket, currency)}
            </Text>
          </View>

          <View
            style={[
              styles.kpiCell,
              { backgroundColor: colors.card, padding: spacing.base },
            ]}
          >
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Refunded orders
            </Text>
            <Text
              style={[
                typography.titleSm,
                typography.tabular,
                {
                  color:
                    employee.refundedSalesCount > 0
                      ? colors.warningText
                      : colors.foreground,
                  marginTop: spacing.xs,
                },
              ]}
            >
              {employee.refundedSalesCount}
            </Text>
          </View>
        </View>
      </View>

      {/* Payment Mix */}
      <Card>
        <CardHeader bordered>
          <CardTitle>Tender breakdown</CardTitle>
        </CardHeader>
        <CardContent style={{ paddingTop: spacing.md, gap: spacing.sm + 2 }}>
          {paymentBreakdown.map((item) => (
            <View key={item.paymentMode} style={{ gap: 4 }}>
              <View style={styles.breakdownHeader}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
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
                  {formatCurrency(item.amount, currency)} · {item.sharePercent}%
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

      {/* Recent Sales Processed */}
      <Card>
        <CardHeader bordered>
          <CardTitle>Recent transactions ({recentSales.length})</CardTitle>
        </CardHeader>

        {recentSales.length === 0 ? (
          <View style={styles.emptyOrders}>
            <ShoppingBag size={28} color={colors.mutedForeground} />
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              No sales recorded by this team member yet.
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
                      {sale.customerName} · {capitalizeLabel(sale.paymentMode)} ·{" "}
                      {formatDateTime(sale.saleDate)}
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
                  {formatCurrency(sale.totalAmount, currency)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      {/* Edit Employee Modal */}
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
                  Edit Staff Account
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
                    autoCapitalize="words"
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
                  Email Address *
                </Text>
                <Input
                  value={emailInput}
                  onChangeText={setEmailInput}
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

              {isAdmin ? (
                <View style={{ gap: spacing.xs }}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
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
                            roleInput === "member"
                              ? colors.primary
                              : colors.border,
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
                            roleInput === "admin"
                              ? colors.primary
                              : colors.border,
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
              ) : null}

              <View style={{ gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Reset Password (Optional)
                </Text>
                <Input
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                  placeholder="Leave blank to keep current password"
                  secureTextEntry
                  autoCapitalize="none"
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
  breakdownHeader: {
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
