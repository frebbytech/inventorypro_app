import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LogOut, Settings, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/api/AuthProvider";
import { SignOutConfirmDialog } from "@/components/SignOutConfirmDialog";
import { useTheme } from "@/theme";

export function DemoBanner({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, radii, spacing, typography, fontFamilies, shadows } = theme;

  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const fullName = user
    ? [user.firstname, user.lastname].filter(Boolean).join(" ").trim() ||
      user.username
    : "Guest";

  const initials = user
    ? (user.firstname?.[0] || user.username?.[0] || "U").toUpperCase()
    : "U";

  const navigateAndClose = (path: "/(tabs)/account" | "/settings") => {
    setMenuOpen(false);
    router.push(path);
  };

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

          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Open account menu"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.avatarBtn,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <Text
              style={[
                typography.bodySemibold,
                { color: colors.foreground, fontFamily: fontFamilies.bold },
              ]}
            >
              {initials}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Account Avatar Dropdown matching desktop UserNav */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={[
              styles.dropdownCard,
              shadows.card,
              {
                marginTop: Math.max(insets.top, 8) + 54,
                marginRight: spacing.base,
                backgroundColor: colors.popover,
                borderColor: colors.border,
                borderRadius: radii.xl,
              },
            ]}
          >
            {/* User Label Header */}
            <View
              style={[
                styles.dropdownHeader,
                {
                  paddingHorizontal: spacing.md + 2,
                  paddingVertical: spacing.md,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  typography.bodySemibold,
                  { color: colors.popoverForeground },
                ]}
              >
                {fullName}
              </Text>
              {user?.email ? (
                <Text
                  numberOfLines={1}
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, marginTop: 1 },
                  ]}
                >
                  {user.email}
                </Text>
              ) : null}
            </View>

            <View
              style={[styles.separator, { backgroundColor: colors.border }]}
            />

            {/* Navigation Items */}
            <View style={{ padding: 6, gap: 2 }}>
              <Pressable
                onPress={() => navigateAndClose("/(tabs)/account")}
                style={({ pressed }) => [
                  styles.menuItem,
                  {
                    borderRadius: radii.lg,
                    backgroundColor: pressed ? colors.accent : "transparent",
                  },
                ]}
              >
                <User size={15} color={colors.mutedForeground} />
                <Text
                  style={[typography.bodyMedium, { color: colors.foreground }]}
                >
                  Profile
                </Text>
              </Pressable>

              <Pressable
                onPress={() => navigateAndClose("/settings")}
                style={({ pressed }) => [
                  styles.menuItem,
                  {
                    borderRadius: radii.lg,
                    backgroundColor: pressed ? colors.accent : "transparent",
                  },
                ]}
              >
                <Settings size={15} color={colors.mutedForeground} />
                <Text
                  style={[typography.bodyMedium, { color: colors.foreground }]}
                >
                  Settings
                </Text>
              </Pressable>
            </View>

            {user ? (
              <>
                <View
                  style={[styles.separator, { backgroundColor: colors.border }]}
                />
                <View style={{ padding: 6 }}>
                  <Pressable
                    onPress={() => {
                      setMenuOpen(false);
                      setLogoutOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.menuItem,
                      {
                        borderRadius: radii.lg,
                        backgroundColor: pressed
                          ? colors.dangerTint
                          : "transparent",
                      },
                    ]}
                  >
                    <LogOut size={15} color={colors.dangerText} />
                    <Text
                      style={[
                        typography.bodyMedium,
                        { color: colors.dangerText },
                      ]}
                    >
                      Log out
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <SignOutConfirmDialog
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
      />
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
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.18)",
    alignItems: "flex-end",
  },
  dropdownCard: {
    width: 228,
    borderWidth: 1,
    overflow: "hidden",
  },
  dropdownHeader: {
    gap: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
});
