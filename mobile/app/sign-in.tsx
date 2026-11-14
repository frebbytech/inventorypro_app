import React, { useState } from "react";
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
  Database,
  Lock,
  LogIn,
  Moon,
  Sun,
  User,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
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

export default function SignInScreen() {
  const { theme, mode, toggleMode } = useTheme();
  const { signIn } = useAuth();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [identifier, setIdentifier] = useState("frebbytech");
  const [password, setPassword] = useState("Admin123!");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (idValue = identifier, passValue = password) => {
    const trimmed = idValue.trim();
    if (!trimmed || !passValue) {
      setError("Enter both your username/email and password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signIn(trimmed, passValue);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in. Check your credentials.",
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
            <Badge label="Expo SQLite · Drizzle ORM" variant="outline" />
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
              <Database size={26} color={colors.primary} />
            </View>
            <Text style={[typography.titleLg, { color: colors.foreground }]}>
              Inventory Pro
            </Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              Sign in to access live store stock, barcode lookup, and POS sales.
            </Text>
          </View>

          <Card>
            <CardHeader bordered>
              <CardTitle>Staff sign in</CardTitle>
            </CardHeader>

            <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
              {error ? (
                <View
                  style={[
                    styles.errorBox,
                    {
                      backgroundColor: colors.dangerTint,
                      borderColor: colors.dangerBorder,
                      borderRadius: radii.lg,
                      padding: spacing.md,
                    },
                  ]}
                >
                  <AlertCircle size={16} color={colors.dangerText} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.dangerText, flex: 1 },
                    ]}
                  >
                    {error}
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
                  Username or Email
                </Text>
                <Input
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="frebbytech or inventorypro@frebbytech.com"
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

              <Button
                title="Sign In"
                size="lg"
                loading={submitting}
                leftIcon={<LogIn size={17} color="#FFFFFF" />}
                onPress={() => void handleSubmit()}
              />
            </CardContent>
          </Card>

          {/* Seeded SQLite Accounts for immediate testing */}
          <Card>
            <CardHeader bordered>
              <CardTitle>Seeded SQLite accounts</CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: spacing.md, gap: spacing.sm }}>
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                Tap an account below to pre-fill credentials stored in SQLite:
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
                    setError(null);
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
                    setError(null);
                  }}
                />
              </View>
            </CardContent>
          </Card>
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
