import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Database, FlaskConical, LogOut, Moon, Sun } from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { Button } from "@/components/ui";
import { useTheme } from "@/theme";

export function DemoBanner({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme, mode, toggleMode } = useTheme();
  const api = useApiClient();
  const { user, signOut } = useAuth();
  const { colors, radii, spacing, typography, fontFamilies } = theme;

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleConfirmSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setLogoutConfirmOpen(false);
    } finally {
      setSigningOut(false);
    }
  };

  const displayName = user
    ? [user.firstname, user.lastname].filter(Boolean).join(" ").trim() ||
      user.username
    : "";

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.headerBackground,
            borderBottomColor: colors.border,
            paddingHorizontal: spacing.base,
            paddingVertical: spacing.md,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={[typography.titleSm, { color: colors.foreground }]}>
              {title}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={1}
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, marginTop: 2 },
                ]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            {api.isDemo ? (
              <View
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: colors.demoBannerBg,
                    borderColor: colors.demoBannerBorder,
                    borderRadius: radii.md,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <FlaskConical size={13} color={colors.demoBannerText} />
                <Text
                  style={[
                    typography.micro,
                    { color: colors.demoBannerText, fontFamily: fontFamilies.bold },
                  ]}
                >
                  DEMO DATA
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: colors.successTint,
                    borderColor: colors.successBorder,
                    borderRadius: radii.md,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <Database size={12} color={colors.successText} />
                <Text
                  style={[
                    typography.micro,
                    { color: colors.successText, fontFamily: fontFamilies.bold },
                  ]}
                >
                  {user ? user.username.toUpperCase() : "SQLITE"}
                </Text>
              </View>
            )}

            <Pressable
              onPress={toggleMode}
              accessibilityLabel={`Switch to ${mode === "dark" ? "light" : "dark"} theme`}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: colors.muted,
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

            {user ? (
              <Pressable
                onPress={() => setLogoutConfirmOpen(true)}
                accessibilityLabel="Sign out"
                style={({ pressed }) => [
                  styles.iconBtn,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    borderRadius: radii.md,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <LogOut size={15} color={colors.foreground} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <Modal
        visible={logoutConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!signingOut) setLogoutConfirmOpen(false);
        }}
      >
        <View style={styles.dialogBackdrop}>
          <View
            style={[
              styles.dialogCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii["2xl"],
                padding: spacing.lg,
              },
            ]}
          >
            <View style={styles.dialogHeader}>
              <View
                style={[
                  styles.dialogIconBox,
                  {
                    backgroundColor: colors.dangerTint,
                    borderColor: colors.dangerBorder,
                    borderRadius: radii.xl,
                  },
                ]}
              >
                <LogOut size={20} color={colors.dangerText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.titleXsm, { color: colors.foreground }]}>
                  Sign out?
                </Text>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, marginTop: 2 },
                  ]}
                >
                  {displayName} (@{user?.username})
                </Text>
              </View>
            </View>

            <Text
              style={[
                typography.body,
                { color: colors.mutedForeground, marginTop: spacing.md },
              ]}
            >
              Are you sure you want to log out? You will be returned to the sign-in
              screen. Your local SQLite products, sales, and settings remain saved.
            </Text>

            <View style={[styles.dialogActions, { marginTop: spacing.lg }]}>
              <Button
                title="Cancel"
                variant="outline"
                style={{ flex: 1 }}
                disabled={signingOut}
                onPress={() => setLogoutConfirmOpen(false)}
              />
              <Button
                title={signingOut ? "Signing out..." : "Log out"}
                variant="destructive"
                style={{ flex: 1 }}
                loading={signingOut}
                onPress={() => void handleConfirmSignOut()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.60)",
    justifyContent: "center",
    padding: 20,
  },
  dialogCard: {
    borderWidth: 1,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dialogIconBox: {
    width: 42,
    height: 42,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogActions: {
    flexDirection: "row",
    gap: 10,
  },
});
