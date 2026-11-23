import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  MessageSquare,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Users,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { LoadingState } from "@/components/LoadingState";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  useToast,
} from "@/components/ui";
import { useTheme } from "@/theme";
import type {
  StaffTwoFactorAccount,
  TwoFactorMethod,
  TwoFactorOverviewResponse,
  UserSessionItem,
} from "@/types/domain";
import { formatDateTime } from "@/utils/formatters";

type RoleFilter = "all" | "member" | "admin";
type StatusFilter = "all" | "enabled" | "disabled";

export default function SecurityScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const {
    user,
    workspaceMode,
    updateMyProfile,
    updateUserTwoFactor,
    changePassword,
  } = useAuth();
  const toast = useToast();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  // Profile form state
  const [firstname, setFirstname] = useState(user?.firstname ?? "");
  const [lastname, setLastname] = useState(user?.lastname ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phonenumber, setPhonenumber] = useState(user?.phonenumber ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Two-factor authentication state
  const [twoFactorOverview, setTwoFactorOverview] =
    useState<TwoFactorOverviewResponse | null>(null);
  const [loadingTwoFactor, setLoadingTwoFactor] = useState(true);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [savingPersonal2fa, setSavingPersonal2fa] = useState(false);
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkConfirmAction, setBulkConfirmAction] = useState<
    "enable" | "disable" | null
  >(null);

  // Admin Team 2FA filters
  const [teamQuery, setTeamQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (user) {
      setFirstname(user.firstname);
      setLastname(user.lastname);
      setEmail(user.email);
      setPhonenumber(user.phonenumber ?? "");
    }
  }, [user]);

  const loadSecurityData = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoadingSessions(true);
        setLoadingTwoFactor(true);
      }
      setSessionError(null);
      setTwoFactorError(null);

      const [sessionsResult, twoFactorResult] = await Promise.allSettled([
        api.getUserSessions(),
        api.getTwoFactorOverview(),
      ]);

      if (sessionsResult.status === "fulfilled") {
        setSessions(sessionsResult.value);
      } else {
        setSessionError(
          sessionsResult.reason instanceof Error
            ? sessionsResult.reason.message
            : "Failed to load device sessions.",
        );
      }

      if (twoFactorResult.status === "fulfilled") {
        setTwoFactorOverview(twoFactorResult.value);
      } else {
        setTwoFactorError(
          twoFactorResult.reason instanceof Error
            ? twoFactorResult.reason.message
            : "Failed to load 2FA settings.",
        );
      }

      hasLoadedRef.current = true;
      setLoadingSessions(false);
      setLoadingTwoFactor(false);
      setRefreshing(false);
    },
    [api],
  );

  useEffect(() => {
    void loadSecurityData(false);
  }, [loadSecurityData]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        void loadSecurityData(true);
      }
    }, [loadSecurityData]),
  );

  const otherActiveCount = useMemo(
    () => sessions.filter((s) => s.isActive && !s.isCurrent).length,
    [sessions],
  );

  const currentAccount: StaffTwoFactorAccount | null = useMemo(() => {
    if (twoFactorOverview?.currentUserAccount) {
      return twoFactorOverview.currentUserAccount;
    }
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      fullname:
        [user.firstname, user.lastname].filter(Boolean).join(" ").trim() ||
        user.username,
      phonenumber: user.phonenumber ?? "",
      role: user.role,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      twoFactorMethod: user.twoFactorMethod === "sms" ? "sms" : "email",
      twoFactorUpdatedAt: null,
      lastLoginAt: user.lastLoginAt ?? null,
      isCurrentUser: true,
    };
  }, [twoFactorOverview, user]);

  const teamStats = useMemo(() => {
    const all = twoFactorOverview?.accounts ?? [];
    const total = all.length;
    const staffOnly = all.filter((a) => !a.isCurrentUser).length;
    const enabledCount = all.filter((a) => a.twoFactorEnabled).length;
    const protectedPct = total > 0 ? Math.round((enabledCount / total) * 100) : 0;
    return { total, staffOnly, enabledCount, protectedPct };
  }, [twoFactorOverview]);

  const filteredAccounts = useMemo(() => {
    const all = twoFactorOverview?.accounts ?? [];
    const q = teamQuery.trim().toLowerCase();
    return all.filter((acc) => {
      if (roleFilter !== "all" && acc.role !== roleFilter) return false;
      if (statusFilter === "enabled" && !acc.twoFactorEnabled) return false;
      if (statusFilter === "disabled" && acc.twoFactorEnabled) return false;
      if (!q) return true;
      return (
        acc.fullname.toLowerCase().includes(q) ||
        acc.username.toLowerCase().includes(q) ||
        acc.email.toLowerCase().includes(q)
      );
    });
  }, [twoFactorOverview, teamQuery, roleFilter, statusFilter]);

  const otherStaffIds = useMemo(
    () =>
      (twoFactorOverview?.accounts ?? [])
        .filter((a) => !a.isCurrentUser)
        .map((a) => a.id),
    [twoFactorOverview],
  );

  const handleSaveProfile = async () => {
    setProfileFeedback(null);
    if (!firstname.trim()) {
      setProfileFeedback({ type: "error", text: "First name is required." });
      return;
    }
    if (!email.trim()) {
      setProfileFeedback({ type: "error", text: "Email address is required." });
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await updateMyProfile({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        phonenumber: phonenumber.trim() || undefined,
      });
      setTwoFactorOverview((prev) =>
        prev
          ? {
              ...prev,
              currentUserAccount: {
                ...prev.currentUserAccount,
                firstname: updated.firstname,
                lastname: updated.lastname,
                fullname:
                  [updated.firstname, updated.lastname]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || updated.username,
                email: updated.email,
                phonenumber: updated.phonenumber ?? "",
              },
              accounts: prev.accounts.map((acc) =>
                acc.id === updated.id
                  ? {
                      ...acc,
                      firstname: updated.firstname,
                      lastname: updated.lastname,
                      fullname:
                        [updated.firstname, updated.lastname]
                          .filter(Boolean)
                          .join(" ")
                          .trim() || updated.username,
                      email: updated.email,
                      phonenumber: updated.phonenumber ?? "",
                    }
                  : acc,
              ),
            }
          : prev,
      );
      setProfileFeedback({
        type: "success",
        text: "Your profile details were updated.",
      });
      toast.success("Profile updated", "Your personal details were saved.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not update your profile.";
      setProfileFeedback({ type: "error", text: msg });
      toast.error("Profile update failed", msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const applyAccountUpdateToState = (updated: StaffTwoFactorAccount) => {
    setTwoFactorOverview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentUserAccount:
          updated.isCurrentUser || updated.id === prev.currentUserAccount.id
            ? { ...updated, isCurrentUser: true }
            : prev.currentUserAccount,
        accounts: prev.accounts.map((a) => (a.id === updated.id ? updated : a)),
      };
    });
  };

  const handleTogglePersonal2fa = async (nextEnabled: boolean) => {
    if (!currentAccount) return;
    setTwoFactorError(null);
    setSavingPersonal2fa(true);
    try {
      const updated = await updateUserTwoFactor({
        enabled: nextEnabled,
        method: currentAccount.twoFactorMethod,
      });
      applyAccountUpdateToState(updated);
      toast.success(
        nextEnabled ? "2FA Enabled" : "2FA Disabled",
        nextEnabled
          ? `Verification codes will be sent via ${updated.twoFactorMethod.toUpperCase()}.`
          : "Two-factor authentication turned off for your account.",
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update 2FA setting.";
      setTwoFactorError(msg);
      toast.error("2FA update failed", msg);
    } finally {
      setSavingPersonal2fa(false);
    }
  };

  const handleChangePersonal2faMethod = async (method: TwoFactorMethod) => {
    if (!currentAccount || currentAccount.twoFactorMethod === method) return;
    setTwoFactorError(null);
    setSavingPersonal2fa(true);
    try {
      const updated = await updateUserTwoFactor({
        enabled: currentAccount.twoFactorEnabled,
        method,
      });
      applyAccountUpdateToState(updated);
      toast.success(
        "2FA method updated",
        `Preferred verification channel set to ${method.toUpperCase()}.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to switch 2FA channel.";
      setTwoFactorError(msg);
      toast.error("2FA update failed", msg);
    } finally {
      setSavingPersonal2fa(false);
    }
  };

  const handleUpdateStaff2fa = async (
    account: StaffTwoFactorAccount,
    patch: { enabled?: boolean; method?: TwoFactorMethod },
  ) => {
    setSavingAccountId(account.id);
    setTwoFactorError(null);
    try {
      const updated = account.isCurrentUser
        ? await updateUserTwoFactor({
            enabled: patch.enabled ?? account.twoFactorEnabled,
            method: patch.method ?? account.twoFactorMethod,
          })
        : await api.updateUserTwoFactor({
            userId: account.id,
            enabled: patch.enabled ?? account.twoFactorEnabled,
            method: patch.method ?? account.twoFactorMethod,
          });
      applyAccountUpdateToState(updated);
      toast.success(
        `Updated @${account.username}`,
        `2FA ${updated.twoFactorEnabled ? "enabled" : "disabled"} (${updated.twoFactorMethod.toUpperCase()}).`,
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : `Could not update 2FA for @${account.username}.`;
      toast.error("Policy update failed", msg);
    } finally {
      setSavingAccountId(null);
    }
  };

  const handleConfirmBulk2fa = async () => {
    if (!bulkConfirmAction || otherStaffIds.length === 0) {
      setBulkConfirmAction(null);
      return;
    }
    const enable = bulkConfirmAction === "enable";
    setBulkUpdating(true);
    try {
      const result = await api.bulkUpdateStaffTwoFactor({
        userIds: otherStaffIds,
        enabled: enable,
      });
      await loadSecurityData(true);
      setBulkConfirmAction(null);
      if (result.skippedUsernames.length > 0) {
        toast.info(
          `Updated ${result.updatedCount} account(s)`,
          `Skipped missing contact info: ${result.skippedUsernames.join(", ")}`,
        );
      } else {
        toast.success(
          enable ? "Team 2FA enabled" : "Team 2FA disabled",
          `Updated ${result.updatedCount} staff account(s).`,
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Bulk 2FA update failed.";
      toast.error("Bulk update failed", msg);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordFeedback(null);
    if (!currentPassword) {
      setPasswordFeedback({
        type: "error",
        text: "Enter your current password.",
      });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordFeedback({
        type: "error",
        text: "New password must be at least 6 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        type: "error",
        text: "New password and confirmation do not match.",
      });
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({
        type: "success",
        text: "Password updated successfully.",
      });
      toast.success("Password updated", "Your password has been changed.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not change password.";
      setPasswordFeedback({
        type: "error",
        text: msg,
      });
      toast.error("Password update failed", msg);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    setSessionError(null);
    try {
      await api.revokeUserSession(sessionId);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, isActive: false } : s,
        ),
      );
      toast.success("Session revoked", "Device session signed out.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to revoke session.";
      setSessionError(msg);
      toast.error("Revoke failed", msg);
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    if (otherActiveCount === 0) return;
    setRevokingAll(true);
    setSessionError(null);
    try {
      await api.revokeOtherUserSessions();
      setSessions((prev) =>
        prev.map((s) => (s.isCurrent ? s : { ...s, isActive: false })),
      );
      toast.success(
        "Other sessions revoked",
        "All other device sessions signed out.",
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to revoke other sessions.";
      setSessionError(msg);
      toast.error("Revoke failed", msg);
    } finally {
      setRevokingAll(false);
    }
  };

  const selectedMethod: TwoFactorMethod =
    currentAccount?.twoFactorMethod === "sms" ? "sms" : "email";
  const missingPersonalEmail =
    selectedMethod === "email" && !(currentAccount?.email || email).trim();
  const missingPersonalPhone =
    selectedMethod === "sms" &&
    !(currentAccount?.phonenumber || phonenumber).trim();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadSecurityData(true)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: spacing["3xl"],
        }}
      >
        {/* Personal Profile Card */}
        <Card>
          <CardHeader bordered>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <CardTitle>Personal Profile</CardTitle>
                <CardDescription>
                  Signed in as @{user?.username ?? "user"}
                </CardDescription>
              </View>
              <UserCheck size={18} color={colors.primary} />
            </View>
          </CardHeader>
          <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
            <View style={styles.nameRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  First Name
                </Text>
                <Input
                  value={firstname}
                  onChangeText={setFirstname}
                  placeholder="First name"
                />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Last Name
                </Text>
                <Input
                  value={lastname}
                  onChangeText={setLastname}
                  placeholder="Last name"
                />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={[typography.caption, { color: colors.mutedForeground }]}
              >
                Email Address
              </Text>
              <Input
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="name@company.com"
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={[typography.caption, { color: colors.mutedForeground }]}
              >
                Phone Number
              </Text>
              <Input
                value={phonenumber}
                onChangeText={setPhonenumber}
                keyboardType="phone-pad"
                placeholder="+233..."
              />
            </View>

            {profileFeedback ? (
              <View
                style={[
                  styles.feedbackBox,
                  {
                    backgroundColor:
                      profileFeedback.type === "success"
                        ? colors.successTint
                        : colors.dangerTint,
                    borderColor:
                      profileFeedback.type === "success"
                        ? colors.successBorder
                        : colors.dangerBorder,
                    borderRadius: radii.lg,
                    padding: spacing.sm + 2,
                  },
                ]}
              >
                {profileFeedback.type === "success" ? (
                  <CheckCircle2 size={15} color={colors.successText} />
                ) : null}
                <Text
                  style={[
                    typography.caption,
                    {
                      flex: 1,
                      color:
                        profileFeedback.type === "success"
                          ? colors.successText
                          : colors.dangerText,
                    },
                  ]}
                >
                  {profileFeedback.text}
                </Text>
              </View>
            ) : null}

            <Button
              title="Save Profile"
              loading={savingProfile}
              leftIcon={<Save size={15} color="#FFFFFF" />}
              onPress={() => void handleSaveProfile()}
            />
          </CardContent>
        </Card>

        {/* Two-Factor Authentication (Personal) Card */}
        <Card>
          <CardHeader bordered>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Protect your sign-in with a one-time code
                </CardDescription>
              </View>
              <Badge
                label={currentAccount?.twoFactorEnabled ? "Enabled" : "Off"}
                variant={currentAccount?.twoFactorEnabled ? "success" : "secondary"}
              />
            </View>
          </CardHeader>

          <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
            {loadingTwoFactor && !twoFactorOverview ? (
              <LoadingState message="Loading 2FA configuration..." />
            ) : (
              <>
                <View
                  style={[
                    styles.switchRow,
                    {
                      backgroundColor: colors.cardMuted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[
                        typography.bodySemibold,
                        { color: colors.foreground },
                      ]}
                    >
                      Require 2FA on Sign-In
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {currentAccount?.twoFactorEnabled
                        ? `Active via ${selectedMethod.toUpperCase()} verification`
                        : "Password only · enable for extra protection"}
                    </Text>
                  </View>
                  <Switch
                    value={Boolean(currentAccount?.twoFactorEnabled)}
                    disabled={savingPersonal2fa || !currentAccount}
                    onValueChange={(next) => void handleTogglePersonal2fa(next)}
                    trackColor={{
                      false: colors.border,
                      true: colors.primary,
                    }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Verification Delivery Channel
                  </Text>
                  <View style={styles.channelRow}>
                    {(
                      [
                        {
                          value: "email" as const,
                          label: "Email OTP",
                          target:
                            (currentAccount?.email || email).trim() ||
                            "No email on file",
                          icon: Mail,
                        },
                        {
                          value: "sms" as const,
                          label: "SMS OTP",
                          target:
                            (currentAccount?.phonenumber || phonenumber).trim() ||
                            "No phone on file",
                          icon: MessageSquare,
                        },
                      ] as const
                    ).map((opt) => {
                      const active = selectedMethod === opt.value;
                      const Icon = opt.icon;
                      return (
                        <Pressable
                          key={opt.value}
                          disabled={savingPersonal2fa}
                          onPress={() =>
                            void handleChangePersonal2faMethod(opt.value)
                          }
                          style={({ pressed }) => [
                            styles.channelTile,
                            {
                              backgroundColor: active
                                ? colors.primaryTint
                                : colors.cardMuted,
                              borderColor: active
                                ? colors.primary
                                : colors.border,
                              borderRadius: radii.lg,
                              opacity: pressed ? 0.85 : 1,
                            },
                          ]}
                        >
                          <View style={styles.channelTileTop}>
                            <Icon
                              size={16}
                              color={
                                active ? colors.primary : colors.mutedForeground
                              }
                            />
                            <Text
                              style={[
                                typography.caption,
                                {
                                  color: active
                                    ? colors.primary
                                    : colors.foreground,
                                  fontFamily: active
                                    ? fontFamilies.bold
                                    : fontFamilies.semibold,
                                },
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </View>
                          <Text
                            numberOfLines={1}
                            style={[
                              typography.micro,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {opt.target}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {missingPersonalEmail || missingPersonalPhone ? (
                  <View
                    style={[
                      styles.feedbackBox,
                      {
                        backgroundColor: colors.warningTint,
                        borderColor: colors.warningBorder,
                        borderRadius: radii.lg,
                        padding: spacing.sm + 2,
                      },
                    ]}
                  >
                    <AlertTriangle size={15} color={colors.warningText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.warningText, flex: 1 },
                      ]}
                    >
                      {missingPersonalSmsOrEmailText(
                        missingPersonalEmail,
                        missingPersonalPhone,
                      )}
                    </Text>
                  </View>
                ) : null}

                {workspaceMode === "mobile_only" ? (
                  <View
                    style={[
                      styles.feedbackBox,
                      {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        borderRadius: radii.lg,
                        padding: spacing.sm + 2,
                      },
                    ]}
                  >
                    <Shield size={15} color={colors.primary} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground, flex: 1 },
                      ]}
                    >
                      Preferences are saved locally on this device. Live Email/SMS
                      OTP dispatch activates when connected to a Synced Cloud
                      Workspace.
                    </Text>
                  </View>
                ) : twoFactorOverview &&
                  ((selectedMethod === "email" &&
                    !twoFactorOverview.emailConfigured) ||
                    (selectedMethod === "sms" &&
                      !twoFactorOverview.smsConfigured)) ? (
                  <View
                    style={[
                      styles.feedbackBox,
                      {
                        backgroundColor: colors.warningTint,
                        borderColor: colors.warningBorder,
                        borderRadius: radii.lg,
                        padding: spacing.sm + 2,
                      },
                    ]}
                  >
                    <AlertTriangle size={15} color={colors.warningText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.warningText, flex: 1 },
                      ]}
                    >
                      {selectedMethod === "email"
                        ? "Server SMTP Email credentials are not configured yet; Email OTP delivery may be unavailable."
                        : "Server Arkessel SMS credentials are not configured yet; SMS OTP delivery may be unavailable."}
                    </Text>
                  </View>
                ) : null}

                {twoFactorError ? (
                  <View
                    style={[
                      styles.feedbackBox,
                      {
                        backgroundColor: colors.dangerTint,
                        borderColor: colors.dangerBorder,
                        borderRadius: radii.lg,
                        padding: spacing.sm + 2,
                      },
                    ]}
                  >
                    <AlertTriangle size={15} color={colors.dangerText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.dangerText, flex: 1 },
                      ]}
                    >
                      {twoFactorError}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        {/* Team 2FA Policy Card (Admin Only) */}
        {user?.role === "admin" ? (
          <Card>
            <CardHeader bordered>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <CardTitle>Team 2FA Policy</CardTitle>
                  <CardDescription>
                    Enforce 2FA and delivery channels across staff & admins
                  </CardDescription>
                </View>
                <Users size={18} color={colors.primary} />
              </View>
            </CardHeader>

            <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
              {/* Team Coverage KPIs */}
              <View style={styles.kpiStrip}>
                {[
                  { label: "Total", value: String(teamStats.total) },
                  { label: "Staff", value: String(teamStats.staffOnly) },
                  { label: "2FA Active", value: String(teamStats.enabledCount) },
                  { label: "Protected", value: `${teamStats.protectedPct}%` },
                ].map((stat) => (
                  <View
                    key={stat.label}
                    style={[
                      styles.kpiBox,
                      {
                        backgroundColor: colors.cardMuted,
                        borderColor: colors.border,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.titleSm,
                        {
                          color: colors.foreground,
                          fontFamily: fontFamilies.bold,
                        },
                      ]}
                    >
                      {stat.value}
                    </Text>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Channel Readiness Banner */}
              {workspaceMode === "synced" && twoFactorOverview ? (
                <View
                  style={[
                    styles.readinessRow,
                    {
                      backgroundColor:
                        twoFactorOverview.emailConfigured &&
                        twoFactorOverview.smsConfigured
                          ? colors.successTint
                          : colors.warningTint,
                      borderColor:
                        twoFactorOverview.emailConfigured &&
                        twoFactorOverview.smsConfigured
                          ? colors.successBorder
                          : colors.warningBorder,
                      borderRadius: radii.lg,
                      padding: spacing.sm + 2,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        color:
                          twoFactorOverview.emailConfigured &&
                          twoFactorOverview.smsConfigured
                            ? colors.successText
                            : colors.warningText,
                        flex: 1,
                      },
                    ]}
                  >
                    SMTP Email:{" "}
                    {twoFactorOverview.emailConfigured ? "Ready" : "Missing"} ·
                    Arkessel SMS:{" "}
                    {twoFactorOverview.smsConfigured ? "Ready" : "Missing"}
                  </Text>
                </View>
              ) : null}

              {/* Bulk Actions */}
              {otherStaffIds.length > 0 ? (
                <View style={styles.bulkActionsRow}>
                  <Button
                    title="Enable All Staff"
                    size="sm"
                    variant="default"
                    style={{ flex: 1 }}
                    disabled={bulkUpdating}
                    onPress={() => setBulkConfirmAction("enable")}
                  />
                  <Button
                    title="Disable All Staff"
                    size="sm"
                    variant="outline"
                    style={{ flex: 1 }}
                    disabled={bulkUpdating}
                    onPress={() => setBulkConfirmAction("disable")}
                  />
                </View>
              ) : null}

              {/* Search & Filters */}
              <Input
                value={teamQuery}
                onChangeText={setTeamQuery}
                placeholder="Search staff by name, username, email..."
                leftIcon={<Search size={16} color={colors.mutedForeground} />}
              />

              <View style={styles.filtersGroup}>
                <View style={styles.filterChipRow}>
                  {(
                    [
                      { value: "all", label: "All Roles" },
                      { value: "member", label: "Staff" },
                      { value: "admin", label: "Admins" },
                    ] as const
                  ).map((opt) => {
                    const active = roleFilter === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setRoleFilter(opt.value)}
                        style={[
                          styles.filterChip,
                          {
                            backgroundColor: active
                              ? colors.primaryTint
                              : colors.cardMuted,
                            borderColor: active ? colors.primary : colors.border,
                            borderRadius: radii.md,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.micro,
                            {
                              color: active ? colors.primary : colors.foreground,
                              fontFamily: active
                                ? fontFamilies.bold
                                : fontFamilies.semibold,
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.filterChipRow}>
                  {(
                    [
                      { value: "all", label: "Any Status" },
                      { value: "enabled", label: "2FA On" },
                      { value: "disabled", label: "2FA Off" },
                    ] as const
                  ).map((opt) => {
                    const active = statusFilter === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setStatusFilter(opt.value)}
                        style={[
                          styles.filterChip,
                          {
                            backgroundColor: active
                              ? colors.primaryTint
                              : colors.cardMuted,
                            borderColor: active ? colors.primary : colors.border,
                            borderRadius: radii.md,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typography.micro,
                            {
                              color: active ? colors.primary : colors.foreground,
                              fontFamily: active
                                ? fontFamilies.bold
                                : fontFamilies.semibold,
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Filtered Staff List */}
              {filteredAccounts.length === 0 ? (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, textAlign: "center", paddingVertical: spacing.md },
                  ]}
                >
                  No accounts match the active filters.
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {filteredAccounts.map((acc) => {
                    const rowBusy = savingAccountId === acc.id;
                    return (
                      <View
                        key={acc.id}
                        style={[
                          styles.staffRow,
                          {
                            backgroundColor: colors.background,
                            borderColor: acc.isCurrentUser
                              ? colors.primary
                              : colors.border,
                            borderRadius: radii.lg,
                            padding: spacing.md,
                          },
                        ]}
                      >
                        <View style={styles.staffTopRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={styles.staffNameLine}>
                              <Text
                                numberOfLines={1}
                                style={[
                                  typography.bodySemibold,
                                  { color: colors.foreground, flexShrink: 1 },
                                ]}
                              >
                                {acc.fullname}
                              </Text>
                              <Badge
                                label={acc.role === "admin" ? "Admin" : "Staff"}
                                variant={
                                  acc.role === "admin" ? "default" : "secondary"
                                }
                              />
                              {acc.isCurrentUser ? (
                                <Badge label="You" variant="outline" />
                              ) : null}
                            </View>
                            <Text
                              numberOfLines={1}
                              style={[
                                typography.micro,
                                { color: colors.mutedForeground, marginTop: 2 },
                              ]}
                            >
                              @{acc.username} · {acc.email || "No email"}
                              {acc.phonenumber ? ` · ${acc.phonenumber}` : ""}
                            </Text>
                          </View>

                          <Switch
                            value={acc.twoFactorEnabled}
                            disabled={rowBusy}
                            onValueChange={(next) =>
                              void handleUpdateStaff2fa(acc, { enabled: next })
                            }
                            trackColor={{
                              false: colors.border,
                              true: colors.primary,
                            }}
                            thumbColor="#FFFFFF"
                          />
                        </View>

                        <View style={styles.staffBottomRow}>
                          <View style={styles.filterChipRow}>
                            {(["email", "sms"] as const).map((m) => {
                              const selected = acc.twoFactorMethod === m;
                              return (
                                <Pressable
                                  key={m}
                                  disabled={rowBusy}
                                  onPress={() =>
                                    void handleUpdateStaff2fa(acc, { method: m })
                                  }
                                  style={[
                                    styles.methodPill,
                                    {
                                      backgroundColor: selected
                                        ? colors.primaryTint
                                        : colors.cardMuted,
                                      borderColor: selected
                                        ? colors.primary
                                        : colors.border,
                                      borderRadius: radii.md,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      typography.micro,
                                      {
                                        color: selected
                                          ? colors.primary
                                          : colors.mutedForeground,
                                        fontFamily: selected
                                          ? fontFamilies.bold
                                          : fontFamilies.semibold,
                                      },
                                    ]}
                                  >
                                    {m === "email" ? "Email" : "SMS"}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          <Text
                            style={[
                              typography.micro,
                              {
                                color: acc.twoFactorEnabled
                                  ? colors.successText
                                  : colors.mutedForeground,
                              },
                            ]}
                          >
                            {acc.twoFactorEnabled ? "2FA Active" : "2FA Off"}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Change Password Card */}
        <Card>
          <CardHeader bordered>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Minimum 6 characters required
                </CardDescription>
              </View>
              <KeyRound size={18} color={colors.primary} />
            </View>
          </CardHeader>
          <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
            <View style={{ gap: 6 }}>
              <Text
                style={[typography.caption, { color: colors.mutedForeground }]}
              >
                Current Password
              </Text>
              <Input
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showCurrentPwd}
                autoCapitalize="none"
                placeholder="Enter current password"
                rightSlot={
                  <Pressable
                    onPress={() => setShowCurrentPwd((v) => !v)}
                    hitSlop={8}
                  >
                    {showCurrentPwd ? (
                      <EyeOff size={16} color={colors.mutedForeground} />
                    ) : (
                      <Eye size={16} color={colors.mutedForeground} />
                    )}
                  </Pressable>
                }
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={[typography.caption, { color: colors.mutedForeground }]}
              >
                New Password
              </Text>
              <Input
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPwd}
                autoCapitalize="none"
                placeholder="At least 6 characters"
                rightSlot={
                  <Pressable
                    onPress={() => setShowNewPwd((v) => !v)}
                    hitSlop={8}
                  >
                    {showNewPwd ? (
                      <EyeOff size={16} color={colors.mutedForeground} />
                    ) : (
                      <Eye size={16} color={colors.mutedForeground} />
                    )}
                  </Pressable>
                }
              />
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={[typography.caption, { color: colors.mutedForeground }]}
              >
                Confirm New Password
              </Text>
              <Input
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showNewPwd}
                autoCapitalize="none"
                placeholder="Re-enter new password"
              />
            </View>

            {passwordFeedback ? (
              <View
                style={[
                  styles.feedbackBox,
                  {
                    backgroundColor:
                      passwordFeedback.type === "success"
                        ? colors.successTint
                        : colors.dangerTint,
                    borderColor:
                      passwordFeedback.type === "success"
                        ? colors.successBorder
                        : colors.dangerBorder,
                    borderRadius: radii.lg,
                    padding: spacing.sm + 2,
                  },
                ]}
              >
                {passwordFeedback.type === "success" ? (
                  <CheckCircle2 size={15} color={colors.successText} />
                ) : null}
                <Text
                  style={[
                    typography.caption,
                    {
                      flex: 1,
                      color:
                        passwordFeedback.type === "success"
                          ? colors.successText
                          : colors.dangerText,
                    },
                  ]}
                >
                  {passwordFeedback.text}
                </Text>
              </View>
            ) : null}

            <Button
              title="Update Password"
              variant="secondary"
              loading={savingPassword}
              leftIcon={<KeyRound size={15} color={colors.foreground} />}
              onPress={() => void handleChangePassword()}
            />
          </CardContent>
        </Card>

        {/* Active Sessions Card */}
        <Card>
          <CardHeader bordered>
            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <CardTitle>Device Sessions</CardTitle>
                <CardDescription>
                  Manage active logins and recent session history
                </CardDescription>
              </View>
              <ShieldCheck size={18} color={colors.primary} />
            </View>
          </CardHeader>
          <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
            {otherActiveCount > 0 ? (
              <Button
                title={`Sign out other devices (${otherActiveCount})`}
                size="sm"
                variant="destructive"
                loading={revokingAll}
                leftIcon={<LogOut size={14} color="#FFFFFF" />}
                onPress={() => void handleRevokeOtherSessions()}
              />
            ) : null}

            {sessionError ? (
              <View
                style={[
                  styles.feedbackBox,
                  {
                    backgroundColor: colors.dangerTint,
                    borderColor: colors.dangerBorder,
                    borderRadius: radii.lg,
                    padding: spacing.sm + 2,
                  },
                ]}
              >
                <Text
                  style={[typography.caption, { color: colors.dangerText }]}
                >
                  {sessionError}
                </Text>
              </View>
            ) : null}

            {loadingSessions && sessions.length === 0 ? (
              <LoadingState message="Loading sessions..." />
            ) : sessions.length === 0 ? (
              <Text
                style={[typography.caption, { color: colors.mutedForeground }]}
              >
                No session history recorded yet.
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {sessions.map((sess) => (
                  <View
                    key={sess.id}
                    style={[
                      styles.sessionRow,
                      {
                        backgroundColor: colors.background,
                        borderColor: sess.isCurrent
                          ? colors.primary
                          : colors.border,
                        borderRadius: radii.lg,
                        padding: spacing.md,
                      },
                    ]}
                  >
                    <View style={styles.sessionTop}>
                      <View style={styles.sessionIdentity}>
                        <Smartphone
                          size={16}
                          color={
                            sess.isActive
                              ? colors.primary
                              : colors.mutedForeground
                          }
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            numberOfLines={1}
                            style={[
                              typography.bodySemibold,
                              { color: colors.foreground },
                            ]}
                          >
                            {sess.deviceName}
                          </Text>
                          <Text
                            style={[
                              typography.micro,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {sess.operatingSystem.toUpperCase()} ·{" "}
                            {sess.deviceType}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.sessionBadges}>
                        {sess.isCurrent ? (
                          <Badge label="This Device" variant="success" />
                        ) : sess.isActive ? (
                          <Badge label="Active" variant="default" />
                        ) : (
                          <Badge label="Ended" variant="secondary" />
                        )}
                      </View>
                    </View>

                    <View style={styles.sessionFooter}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            typography.micro,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Last active:{" "}
                          {formatDateTime(
                            sess.lastActivityAt || sess.createdAt,
                          )}
                        </Text>
                        <Text
                          style={[
                            typography.micro,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Expires: {formatDateTime(sess.expiresAt)}
                        </Text>
                      </View>

                      {sess.isActive && !sess.isCurrent ? (
                        <Button
                          title="Revoke"
                          size="sm"
                          variant="outline"
                          loading={revokingId === sess.id}
                          onPress={() => void handleRevokeSession(sess.id)}
                        />
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </ScrollView>

      {/* Bulk 2FA Confirmation Modal */}
      <Modal
        visible={bulkConfirmAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!bulkUpdating) setBulkConfirmAction(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii.xl,
                padding: spacing.lg,
              },
            ]}
          >
            <Text style={[typography.titleSm, { color: colors.foreground }]}>
              {bulkConfirmAction === "enable"
                ? "Enable 2FA for All Staff?"
                : "Disable 2FA for All Staff?"}
            </Text>
            <Text
              style={[
                typography.body,
                { color: colors.mutedForeground, marginTop: spacing.xs },
              ]}
            >
              {bulkConfirmAction === "enable"
                ? `This will turn on 2FA for ${otherStaffIds.length} team account(s) excluding your own session. Accounts missing the required email or phone number will be skipped automatically.`
                : `This will disable 2FA for ${otherStaffIds.length} team account(s) excluding your own session.`}
            </Text>
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                size="sm"
                style={{ flex: 1 }}
                disabled={bulkUpdating}
                onPress={() => setBulkConfirmAction(null)}
              />
              <Button
                title={
                  bulkConfirmAction === "enable"
                    ? "Enable All Staff"
                    : "Disable All Staff"
                }
                variant={
                  bulkConfirmAction === "disable" ? "destructive" : "default"
                }
                size="sm"
                style={{ flex: 1 }}
                loading={bulkUpdating}
                onPress={() => void handleConfirmBulk2fa()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function missingPersonalSmsOrEmailText(
  missingEmail: boolean,
  missingPhone: boolean,
): string {
  if (missingEmail) {
    return "Add an email address in Personal Profile above before enabling Email 2FA.";
  }
  if (missingPhone) {
    return "Add a phone number in Personal Profile above before enabling SMS 2FA.";
  }
  return "";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  nameRow: {
    flexDirection: "row",
    gap: 10,
  },
  feedbackBox: {
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  switchRow: {
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  channelRow: {
    flexDirection: "row",
    gap: 10,
  },
  channelTile: {
    flex: 1,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  channelTileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  kpiStrip: {
    flexDirection: "row",
    gap: 8,
  },
  kpiBox: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 2,
  },
  readinessRow: {
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  bulkActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  filtersGroup: {
    gap: 8,
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  staffRow: {
    borderWidth: 1,
    gap: 10,
  },
  staffTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  staffNameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  staffBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  methodPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sessionRow: {
    borderWidth: 1,
    gap: 10,
  },
  sessionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sessionIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  sessionBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sessionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
});
