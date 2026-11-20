import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  Smartphone,
  UserCheck,
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
import type { UserSessionItem } from "@/types/domain";
import { formatDateTime } from "@/utils/formatters";

export default function SecurityScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const { user, updateMyProfile, changePassword } = useAuth();
  const toast = useToast();
  const { colors, spacing, radii, typography } = theme;

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

  const loadSessions = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoadingSessions(true);
      setSessionError(null);
      try {
        const list = await api.getUserSessions();
        setSessions(list);
        hasLoadedRef.current = true;
      } catch (err) {
        setSessionError(
          err instanceof Error ? err.message : "Failed to load device sessions.",
        );
      } finally {
        setLoadingSessions(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadSessions(false);
  }, [loadSessions]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        void loadSessions(true);
      }
    }, [loadSessions]),
  );

  const otherActiveCount = useMemo(
    () => sessions.filter((s) => s.isActive && !s.isCurrent).length,
    [sessions],
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
      await updateMyProfile({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        phonenumber: phonenumber.trim() || undefined,
      });
      setProfileFeedback({
        type: "success",
        text: "Your profile details were updated.",
      });
      toast.success("Profile updated", "Your personal details were saved.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not update your profile.";
      setProfileFeedback({
        type: "error",
        text: msg,
      });
      toast.error("Profile update failed", msg);
    } finally {
      setSavingProfile(false);
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
            onRefresh={() => void loadSessions(true)}
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
                  Manage active logins for this account
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
    </KeyboardAvoidingView>
  );
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
});
