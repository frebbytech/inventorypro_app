import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertCircle,
  Building2,
  Cloud,
  Database,
  KeyRound,
  Lock,
  LogIn,
  Moon,
  Server,
  Smartphone,
  Sun,
  User,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
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
import {
  normalizeError,
  type NormalizedAppError,
} from "@/utils/errorHandler";

export default function SignInScreen() {
  const { theme, mode, toggleMode } = useTheme();
  const {
    workspaceMode,
    setWorkspaceModePreference,
    serverUrl,
    isResolvingServerUrl,
    refreshPlatformServerUrl,
    signIn,
    verifyTwoFactorSignIn,
    resendTwoFactorCode,
    sessionExpiredReason,
    dismissSessionExpired,
  } = useAuth();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  // Sign-in state
  const [identifier, setIdentifier] = useState(
    workspaceMode === "mobile_only" ? "frebbytech" : "",
  );
  const [password, setPassword] = useState(
    workspaceMode === "mobile_only" ? "Admin123!" : "",
  );
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [showWorkspaceSlug, setShowWorkspaceSlug] = useState(false);

  // 2FA challenge state
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [maskedTarget, setMaskedTarget] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorInfo, setErrorInfo] = useState<NormalizedAppError | null>(null);
  const lastActionRef = React.useRef<(() => void) | null>(null);

  useEffect(() => {
    if (workspaceMode === "synced") {
      void refreshPlatformServerUrl();
    }
  }, [workspaceMode, refreshPlatformServerUrl]);

  const setValidationError = (message: string) => {
    lastActionRef.current = null;
    setErrorInfo({
      userMessage: message,
      category: "validation",
      retryable: false,
      requiresSignIn: false,
    });
  };

  const handleSelectWorkspaceMode = async (
    nextMode: "mobile_only" | "synced",
  ) => {
    setErrorInfo(null);
    setChallengeToken(null);
    setOtpCode("");
    await setWorkspaceModePreference(nextMode);
    if (nextMode === "mobile_only") {
      if (!identifier) setIdentifier("frebbytech");
      if (!password) setPassword("Admin123!");
    } else {
      if (identifier === "frebbytech" && password === "Admin123!") {
        setIdentifier("");
        setPassword("");
      }
    }
  };

  const handleSubmit = async (idValue = identifier, passValue = password) => {
    const trimmed = idValue.trim();
    if (!trimmed || !passValue) {
      setValidationError("Enter both your username/email and password.");
      return;
    }

    dismissSessionExpired();
    setSubmitting(true);
    setErrorInfo(null);
    lastActionRef.current = () => void handleSubmit(trimmed, passValue);
    try {
      const res = await signIn(trimmed, passValue, {
        workspaceSlug: workspaceSlug.trim() || undefined,
      });
      if ("twoFactorRequired" in res && res.twoFactorRequired) {
        setChallengeToken(res.challengeToken);
        setMaskedTarget(res.maskedTarget);
      }
    } catch (err) {
      const normalized = normalizeError(err, {
        fallback: "Unable to sign in. Check your credentials and try again.",
        context: "sign-in.submit",
      });
      if (normalized.userMessage.toLowerCase().includes("workspace code")) {
        setShowWorkspaceSlug(true);
      }
      setErrorInfo(normalized);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!challengeToken) return;
    const cleanCode = otpCode.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      setValidationError("Enter the 6-digit verification code.");
      return;
    }
    setSubmitting(true);
    setErrorInfo(null);
    lastActionRef.current = () => void handleVerifyTwoFactor();
    try {
      await verifyTwoFactorSignIn(challengeToken, cleanCode);
    } catch (err) {
      setErrorInfo(
        normalizeError(err, {
          fallback: "Invalid verification code. Please check and try again.",
          context: "sign-in.2fa-verify",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (!challengeToken) return;
    setSubmitting(true);
    setErrorInfo(null);
    lastActionRef.current = () => void handleResendCode();
    try {
      const res = await resendTwoFactorCode(challengeToken);
      setChallengeToken(res.challengeToken);
      setMaskedTarget(res.maskedTarget);
    } catch (err) {
      setErrorInfo(
        normalizeError(err, {
          fallback: "Could not resend verification code. Please try again.",
          context: "sign-in.2fa-resend",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { padding: spacing.base, gap: spacing.lg },
          ]}
        >
          <View style={styles.topActions}>
            <Badge
              label={
                workspaceMode === "synced"
                  ? "Synced Cloud Workspace"
                  : "Mobile-Only · SQLite"
              }
              variant={workspaceMode === "synced" ? "default" : "outline"}
            />
            <Pressable
              onPress={toggleMode}
              accessibilityLabel="Toggle theme"
              style={({ pressed }) => [
                styles.themeBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: radii.md,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              {mode === "dark" ? (
                <Sun size={16} color={colors.foreground} />
              ) : (
                <Moon size={16} color={colors.foreground} />
              )}
            </Pressable>
          </View>

          <View style={styles.brandBlock}>
            <View
              style={[
                styles.brandIcon,
                {
                  backgroundColor: colors.primaryTint,
                  borderColor: colors.primary,
                  borderRadius: radii.xl,
                },
              ]}
            >
              {workspaceMode === "synced" ? (
                <Cloud size={26} color={colors.primary} />
              ) : (
                <Database size={26} color={colors.primary} />
              )}
            </View>
            <Text style={[typography.titleLg, { color: colors.foreground }]}>
              Inventory Pro
            </Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              {workspaceMode === "synced"
                ? "Connect to your cloud store to sync web and mobile inventory, POS sales, and alerts in real time."
                : "Work offline on this device using local SQLite storage, or switch to Synced anytime from Account."}
            </Text>
          </View>

          {/* Workspace Mode Selector */}
          <View
            style={[
              styles.modeSwitcher,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
                borderRadius: radii.xl,
              },
            ]}
          >
            <Pressable
              onPress={() => void handleSelectWorkspaceMode("mobile_only")}
              style={[
                styles.modeBtn,
                {
                  backgroundColor:
                    workspaceMode === "mobile_only"
                      ? colors.card
                      : "transparent",
                  borderRadius: radii.lg,
                },
              ]}
            >
              <Smartphone
                size={15}
                color={
                  workspaceMode === "mobile_only"
                    ? colors.primary
                    : colors.mutedForeground
                }
              />
              <Text
                style={[
                  typography.caption,
                  {
                    color:
                      workspaceMode === "mobile_only"
                        ? colors.foreground
                        : colors.mutedForeground,
                    fontFamily: fontFamilies.semibold,
                  },
                ]}
              >
                Mobile-Only
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void handleSelectWorkspaceMode("synced")}
              style={[
                styles.modeBtn,
                {
                  backgroundColor:
                    workspaceMode === "synced" ? colors.card : "transparent",
                  borderRadius: radii.lg,
                },
              ]}
            >
              <Cloud
                size={15}
                color={
                  workspaceMode === "synced"
                    ? colors.primary
                    : colors.mutedForeground
                }
              />
              <Text
                style={[
                  typography.caption,
                  {
                    color:
                      workspaceMode === "synced"
                        ? colors.foreground
                        : colors.mutedForeground,
                    fontFamily: fontFamilies.semibold,
                  },
                ]}
              >
                Synced (Web + Mobile)
              </Text>
            </Pressable>
          </View>

          <Card>
            <CardHeader bordered>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <CardTitle>
                  {challengeToken
                    ? "Two-factor verification"
                    : "Staff sign in"}
                </CardTitle>
                {workspaceMode === "synced" && !challengeToken ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Server size={13} color={colors.primary} />
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground, fontFamily: fontFamilies.medium },
                      ]}
                    >
                      {isResolvingServerUrl ? "Connecting..." : "Auto-Configured"}
                    </Text>
                  </View>
                ) : null}
              </View>
            </CardHeader>

            <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
              {sessionExpiredReason && !errorInfo ? (
                <InlineErrorBanner
                  message={sessionExpiredReason}
                  category="session"
                  onDismiss={dismissSessionExpired}
                />
              ) : null}

              {errorInfo ? (
                <InlineErrorBanner
                  message={errorInfo.userMessage}
                  category={errorInfo.category}
                  onRetry={
                    errorInfo.retryable && lastActionRef.current
                      ? () => lastActionRef.current?.()
                      : undefined
                  }
                  retrying={submitting}
                  onDismiss={() => setErrorInfo(null)}
                />
              ) : null}

              {workspaceMode === "synced" && !challengeToken ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: radii.lg,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Server size={14} color={colors.primary} />
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground, flex: 1 },
                    ]}
                  >
                    {isResolvingServerUrl
                      ? "Fetching platform server URL..."
                      : serverUrl
                        ? `Platform Server: ${serverUrl}`
                        : "Connected to managed cloud platform"}
                  </Text>
                </View>
              ) : null}

              {challengeToken ? (
                <>
                  <Text style={[typography.body, { color: colors.mutedForeground }]}>
                    Enter the 6-digit security code sent to{" "}
                    <Text
                      style={{
                        color: colors.foreground,
                        fontFamily: fontFamilies.semibold,
                      }}
                    >
                      {maskedTarget || "your verified contact"}
                    </Text>
                    .
                  </Text>
                  <Input
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder="123456"
                    keyboardType="number-pad"
                    maxLength={6}
                    leftIcon={<KeyRound size={17} color={colors.mutedForeground} />}
                  />
                  <Button
                    title="Verify & Sign In"
                    size="lg"
                    loading={submitting}
                    onPress={() => void handleVerifyTwoFactor()}
                  />
                  <View style={styles.presetRow}>
                    <Button
                      title="Resend Code"
                      variant="outline"
                      size="sm"
                      style={{ flex: 1 }}
                      disabled={submitting}
                      onPress={() => void handleResendCode()}
                    />
                    <Button
                      title="Back"
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setChallengeToken(null);
                        setOtpCode("");
                        setErrorInfo(null);
                      }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={{ gap: spacing.xs }}>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.foreground, fontFamily: fontFamilies.semibold },
                      ]}
                    >
                      Username or Email
                    </Text>
                    <Input
                      value={identifier}
                      onChangeText={setIdentifier}
                      placeholder={
                        workspaceMode === "synced"
                          ? "owner@yourstore.com or username"
                          : "frebbytech or inventorypro@frebbytech.com"
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      leftIcon={<User size={18} color={colors.mutedForeground} />}
                    />
                  </View>

                  <View style={{ gap: spacing.xs }}>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.foreground, fontFamily: fontFamilies.semibold },
                      ]}
                    >
                      Password
                    </Text>
                    <Input
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter password"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleSubmit()}
                      leftIcon={<Lock size={18} color={colors.mutedForeground} />}
                    />
                  </View>

                  {workspaceMode === "synced" ? (
                    showWorkspaceSlug ? (
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
                          Workspace Code
                        </Text>
                        <Input
                          value={workspaceSlug}
                          onChangeText={setWorkspaceSlug}
                          placeholder="e.g. frebbytech-store"
                          autoCapitalize="none"
                          autoCorrect={false}
                          leftIcon={
                            <Building2 size={17} color={colors.mutedForeground} />
                          }
                        />
                      </View>
                    ) : (
                      <Pressable onPress={() => setShowWorkspaceSlug(true)}>
                        <Text
                          style={[
                            typography.micro,
                            {
                              color: colors.primary,
                              fontFamily: fontFamilies.semibold,
                            },
                          ]}
                        >
                          + Sign in with a specific Workspace Code
                        </Text>
                      </Pressable>
                    )
                  ) : null}

                  <Button
                    title={
                      workspaceMode === "synced"
                        ? "Sign In & Sync"
                        : "Sign In Offline"
                    }
                    size="lg"
                    loading={submitting}
                    leftIcon={<LogIn size={17} color="#FFFFFF" />}
                    onPress={() => void handleSubmit()}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Seeded SQLite Accounts only shown in Mobile-Only mode */}
          {workspaceMode === "mobile_only" ? (
            <Card>
              <CardHeader bordered>
                <CardTitle>Seeded SQLite accounts</CardTitle>
              </CardHeader>
              <CardContent style={{ paddingTop: spacing.md, gap: spacing.sm }}>
                <Text
                  style={[typography.caption, { color: colors.mutedForeground }]}
                >
                  Tap an account below to pre-fill local device credentials:
                </Text>
                <View style={styles.presetRow}>
                  <Button
                    title="Admin (frebbytech)"
                    variant="outline"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => {
                      setIdentifier("frebbytech");
                      setPassword("Admin123!");
                      setErrorInfo(null);
                    }}
                  />
                  <Button
                    title="Cashier (kwame)"
                    variant="outline"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => {
                      setIdentifier("kwame");
                      setPassword("Staff123!");
                      setErrorInfo(null);
                    }}
                  />
                </View>
              </CardContent>
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  themeBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandBlock: {
    gap: 8,
  },
  brandIcon: {
    width: 52,
    height: 52,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modeSwitcher: {
    flexDirection: "row",
    padding: 4,
    borderWidth: 1,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
  },
});
