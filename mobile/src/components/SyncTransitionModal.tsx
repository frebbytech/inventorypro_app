import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Cloud,
  CloudDownload,
  GitMerge,
  KeyRound,
  Lock,
  Server,
  User,
  X,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
import { ensureDbReady } from "@/db/client";
import { getLocalDataSummary, type LocalDataSummary } from "@/db/syncStore";
import { Button, Input } from "@/components/ui";
import { useTheme } from "@/theme";
import type { AuthLoginResponse } from "@/types/domain";
import {
  normalizeError,
  type NormalizedAppError,
} from "@/utils/errorHandler";

interface SyncTransitionModalProps {
  visible: boolean;
  onClose: () => void;
}

type ModalStep = "auth" | "two_factor" | "migration_choice";

export function SyncTransitionModal({
  visible,
  onClose,
}: SyncTransitionModalProps) {
  const { theme } = useTheme();
  const {
    serverUrl,
    isResolvingServerUrl,
    refreshPlatformServerUrl,
    authenticateCloudPreview,
    verifyTwoFactorPreview,
    resendTwoFactorCode,
    finalizeCloudTransition,
  } = useAuth();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [step, setStep] = useState<ModalStep>("auth");

  // Sign-in fields
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");

  // 2FA state
  const [challengeToken, setChallengeToken] = useState("");
  const [maskedTarget, setMaskedTarget] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // Authenticated cloud response pending Merge vs Pull
  const [pendingAuth, setPendingAuth] = useState<AuthLoginResponse | null>(null);
  const [localSummary, setLocalSummary] = useState<LocalDataSummary | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<NormalizedAppError | null>(null);
  const lastActionRef = React.useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep("auth");
    setErrorInfo(null);
    lastActionRef.current = null;
    setPendingAuth(null);
    setOtpCode("");
    void refreshPlatformServerUrl();
    void ensureDbReady().then((db) => {
      setLocalSummary(getLocalDataSummary(db));
    });
  }, [visible, refreshPlatformServerUrl]);

  const handleCloudSignIn = async () => {
    if (!identifier.trim() || !password) {
      lastActionRef.current = null;
      setErrorInfo({
        userMessage: "Enter your username/email and password.",
        category: "validation",
        retryable: false,
        requiresSignIn: false,
      });
      return;
    }
    setLoading(true);
    setErrorInfo(null);
    lastActionRef.current = () => void handleCloudSignIn();
    try {
      const res = await authenticateCloudPreview({
        identifier: identifier.trim(),
        password,
        workspaceSlug: workspaceSlug.trim() || undefined,
      });
      if ("twoFactorRequired" in res && res.twoFactorRequired) {
        setChallengeToken(res.challengeToken);
        setMaskedTarget(res.maskedTarget);
        setStep("two_factor");
      } else {
        setPendingAuth(res);
        setStep("migration_choice");
      }
    } catch (err) {
      setErrorInfo(
        normalizeError(err, {
          fallback: "Could not connect to cloud workspace. Check your details and try again.",
          context: "sync-transition.signIn",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(otpCode.replace(/\s+/g, ""))) {
      lastActionRef.current = null;
      setErrorInfo({
        userMessage: "Enter the 6-digit verification code.",
        category: "validation",
        retryable: false,
        requiresSignIn: false,
      });
      return;
    }
    setLoading(true);
    setErrorInfo(null);
    lastActionRef.current = () => void handleVerifyOtp();
    try {
      const res = await verifyTwoFactorPreview({
        challengeToken,
        code: otpCode.replace(/\s+/g, ""),
      });
      setPendingAuth(res);
      setStep("migration_choice");
    } catch (err) {
      setErrorInfo(
        normalizeError(err, {
          fallback: "Invalid verification code. Please check and try again.",
          context: "sync-transition.2faVerify",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setErrorInfo(null);
    lastActionRef.current = () => void handleResendOtp();
    try {
      const res = await resendTwoFactorCode(challengeToken);
      setChallengeToken(res.challengeToken);
      setMaskedTarget(res.maskedTarget);
    } catch (err) {
      setErrorInfo(
        normalizeError(err, {
          fallback: "Could not resend verification code right now.",
          context: "sync-transition.2faResend",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChooseStrategy = async (strategy: "merge" | "pull") => {
    if (!pendingAuth) return;
    setLoading(true);
    setErrorInfo(null);
    lastActionRef.current = () => void handleChooseStrategy(strategy);
    try {
      await finalizeCloudTransition(pendingAuth, strategy);
      onClose();
    } catch (err) {
      setErrorInfo(
        normalizeError(err, {
          fallback: "Could not complete workspace sync right now. Please try again.",
          context: "sync-transition.finalize",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radii.xl,
            },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                borderBottomColor: colors.border,
                paddingHorizontal: spacing.base,
                paddingVertical: spacing.md,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: colors.primaryTint, borderRadius: radii.lg },
                ]}
              >
                <Cloud size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodySemibold, { color: colors.foreground }]}>
                  {step === "migration_choice"
                    ? "Sync Existing Mobile Data"
                    : step === "two_factor"
                      ? "Verify Cloud Sign-In"
                      : "Connect Web + Mobile Sync"}
                </Text>
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                  {step === "migration_choice"
                    ? "Choose how local SQLite data merges with your workspace"
                    : "Sync stock, POS sales, and alerts in real time"}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close sync modal"
              style={({ pressed }) => [
                styles.closeBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.base, gap: spacing.md }}
          >
            {errorInfo ? (
              <InlineErrorBanner
                message={errorInfo.userMessage}
                category={errorInfo.category}
                onRetry={
                  errorInfo.retryable && lastActionRef.current
                    ? () => lastActionRef.current?.()
                    : undefined
                }
                retrying={loading}
                onDismiss={() => setErrorInfo(null)}
              />
            ) : null}

            {step === "auth" ? (
              <>
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
                <View style={{ gap: 6 }}>
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
                        placeholder="owner@yourstore.com"
                        autoCapitalize="none"
                        autoCorrect={false}
                        leftIcon={<User size={16} color={colors.mutedForeground} />}
                      />
                    </View>
                    <View style={{ gap: 6 }}>
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
                        leftIcon={<Lock size={16} color={colors.mutedForeground} />}
                      />
                    </View>
                    <View style={{ gap: 6 }}>
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.foreground, fontFamily: fontFamilies.semibold },
                        ]}
                      >
                        Workspace Code (optional)
                      </Text>
                      <Input
                        value={workspaceSlug}
                        onChangeText={setWorkspaceSlug}
                        placeholder="e.g. frebbytech-store"
                        autoCapitalize="none"
                        autoCorrect={false}
                        leftIcon={<Building2 size={16} color={colors.mutedForeground} />}
                      />
                    </View>

                    <Button
                      title="Continue to Sync Options"
                      size="lg"
                      loading={loading}
                      rightIcon={<ArrowRight size={16} color="#FFFFFF" />}
                      onPress={() => void handleCloudSignIn()}
                    />
              </>
            ) : null}

            {step === "two_factor" ? (
              <View style={{ gap: spacing.md }}>
                <Text style={[typography.body, { color: colors.mutedForeground }]}>
                  Enter the 6-digit security code sent to{" "}
                  <Text style={{ color: colors.foreground, fontFamily: fontFamilies.semibold }}>
                    {maskedTarget || "your device"}
                  </Text>
                  .
                </Text>
                <Input
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  leftIcon={<KeyRound size={16} color={colors.mutedForeground} />}
                />
                <Button
                  title="Verify & Continue"
                  size="lg"
                  loading={loading}
                  onPress={() => void handleVerifyOtp()}
                />
                <Button
                  title="Resend Code"
                  variant="outline"
                  size="default"
                  disabled={loading}
                  onPress={() => void handleResendOtp()}
                />
              </View>
            ) : null}

            {step === "migration_choice" ? (
              <View style={{ gap: spacing.md }}>
                {pendingAuth?.tenant ? (
                  <View
                    style={[
                      styles.summaryBox,
                      {
                        backgroundColor: colors.primaryTint,
                        borderColor: colors.primary,
                        borderRadius: radii.lg,
                        padding: spacing.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.primary, fontFamily: fontFamilies.semibold },
                      ]}
                    >
                      Connected Workspace: {pendingAuth.tenant.name} ({pendingAuth.tenant.slug})
                    </Text>
                  </View>
                ) : null}

                {localSummary ? (
                  <View
                    style={[
                      styles.summaryBox,
                      {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        borderRadius: radii.lg,
                        padding: spacing.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.foreground, fontFamily: fontFamilies.semibold },
                      ]}
                    >
                      Local Mobile Data Detected
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground, marginTop: 2 },
                      ]}
                    >
                      {localSummary.productsCount} products · {localSummary.salesCount} sales ·{" "}
                      {localSummary.customersCount} customers · {localSummary.suppliersCount} suppliers
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  disabled={loading}
                  onPress={() => void handleChooseStrategy("merge")}
                  style={({ pressed }) => [
                    styles.choiceCard,
                    {
                      backgroundColor: pressed ? colors.accent : colors.background,
                      borderColor: colors.primary,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                      opacity: loading ? 0.65 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.choiceIcon,
                      { backgroundColor: colors.primaryTint, borderRadius: radii.md },
                    ]}
                  >
                    <GitMerge size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[
                        typography.bodySemibold,
                        { color: colors.foreground },
                      ]}
                    >
                      Merge local data with cloud
                    </Text>
                    <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                      Upload your mobile products, customers, suppliers, and sales into this cloud workspace, then sync everything.
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  disabled={loading}
                  onPress={() => void handleChooseStrategy("pull")}
                  style={({ pressed }) => [
                    styles.choiceCard,
                    {
                      backgroundColor: pressed ? colors.accent : colors.background,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                      opacity: loading ? 0.65 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.choiceIcon,
                      { backgroundColor: colors.muted, borderRadius: radii.md },
                    ]}
                  >
                    <CloudDownload size={18} color={colors.foreground} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[
                        typography.bodySemibold,
                        { color: colors.foreground },
                      ]}
                    >
                      Pull cloud data (replace local cache)
                    </Text>
                    <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                      Discard local mobile-only data and download your cloud store catalog and receipts fresh.
                    </Text>
                  </View>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.55)",
    justifyContent: "flex-end",
    padding: 12,
  },
  sheet: {
    maxHeight: "90%",
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    gap: 8,
  },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    padding: 6,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  summaryBox: {
    borderWidth: 1,
  },
  choiceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1.5,
  },
  choiceIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
});
