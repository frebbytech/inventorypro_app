import React, { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertTriangle,
  Bell,
  Cloud,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  User,
  WifiOff,
} from "lucide-react-native";
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
  const {
    user,
    workspaceMode,
    syncStatus,
    pendingOutboxCount,
    conflictOutboxCount,
    triggerSyncNow,
    unreadNotificationsCount,
    refreshUnreadNotifications,
  } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, radii, spacing, typography, fontFamilies, shadows } = theme;

  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadNotifications();
    }, [refreshUnreadNotifications]),
  );

  const fullName = user
    ? [user.firstname, user.lastname].filter(Boolean).join(" ").trim() ||
      user.username
    : "Guest";

  const initials = user
    ? (user.firstname?.[0] || user.username?.[0] || "U").toUpperCase()
    : "U";

  const navigateAndClose = (
    path: "/(tabs)/account" | "/notifications" | "/security" | "/settings",
  ) => {
    setMenuOpen(false);
    router.push(path);
  };

  const renderSyncChip = () => {
    if (workspaceMode === "mobile_only") {
      return (
        <Pressable
          onPress={() => router.push("/(tabs)/account")}
          accessibilityLabel="Mobile-Only workspace mode"
          style={({ pressed }) => [
            styles.syncChip,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          <Smartphone size={12} color={colors.mutedForeground} />
          <Text
            style={[
              typography.micro,
              {
                color: colors.mutedForeground,
                fontFamily: fontFamilies.semibold,
              },
            ]}
          >
            Local
          </Text>
        </Pressable>
      );
    }

    const isConflict = syncStatus === "conflict" || conflictOutboxCount > 0;
    const isOffline = syncStatus === "offline";
    const isSyncing =
      syncStatus === "syncing" ||
      syncStatus === "connecting" ||
      syncStatus === "reconnecting";

    const label = isConflict
      ? `${conflictOutboxCount} Conflict`
      : isOffline
        ? pendingOutboxCount > 0
          ? `Offline · ${pendingOutboxCount}`
          : "Offline"
        : isSyncing
          ? "Syncing"
          : "Live";

    const tintBg = isConflict
      ? colors.dangerTint
      : isOffline
        ? colors.muted
        : colors.primaryTint;
    const tintBorder = isConflict
      ? colors.dangerBorder
      : isOffline
        ? colors.border
        : colors.primary;
    const tintText = isConflict
      ? colors.dangerText
      : isOffline
        ? colors.mutedForeground
        : colors.primary;

    return (
      <Pressable
        onPress={() => void triggerSyncNow()}
        accessibilityLabel={`Sync status: ${label}. Tap to sync now`}
        style={({ pressed }) => [
          styles.syncChip,
          {
            backgroundColor: tintBg,
            borderColor: tintBorder,
            opacity: pressed ? 0.78 : 1,
          },
        ]}
      >
        {isConflict ? (
          <AlertTriangle size={12} color={tintText} />
        ) : isOffline ? (
          <WifiOff size={12} color={tintText} />
        ) : isSyncing ? (
          <RefreshCw size={12} color={tintText} />
        ) : (
          <Cloud size={12} color={tintText} />
        )}
        <Text
          style={[
            typography.micro,
            { color: tintText, fontFamily: fontFamilies.semibold },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
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

          <View style={styles.rightActions}>
            {renderSyncChip()}

            <Pressable
              onPress={() => router.push("/notifications")}
              accessibilityLabel={`Notifications${unreadNotificationsCount > 0 ? `, ${unreadNotificationsCount} unread` : ""}`}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <Bell size={17} color={colors.foreground} />
              {unreadNotificationsCount > 0 ? (
                <View
                  style={[
                    styles.bellBadge,
                    {
                      backgroundColor: colors.destructive,
                      borderColor: colors.headerBackground,
                    },
                  ]}
                >
                  <Text style={styles.bellBadgeText}>
                    {unreadNotificationsCount > 99
                      ? "99+"
                      : String(unreadNotificationsCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>

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
                onPress={() => navigateAndClose("/notifications")}
                style={({ pressed }) => [
                  styles.menuItem,
                  {
                    borderRadius: radii.lg,
                    backgroundColor: pressed ? colors.accent : "transparent",
                  },
                ]}
              >
                <Bell size={15} color={colors.mutedForeground} />
                <Text
                  style={[
                    typography.bodyMedium,
                    { color: colors.foreground, flex: 1 },
                  ]}
                >
                  Notifications
                </Text>
                {unreadNotificationsCount > 0 ? (
                  <Text
                    style={[
                      typography.micro,
                      {
                        color: colors.primary,
                        fontFamily: fontFamilies.bold,
                      },
                    ]}
                  >
                    {unreadNotificationsCount}
                  </Text>
                ) : null}
              </Pressable>

              <Pressable
                onPress={() => navigateAndClose("/security")}
                style={({ pressed }) => [
                  styles.menuItem,
                  {
                    borderRadius: radii.lg,
                    backgroundColor: pressed ? colors.accent : "transparent",
                  },
                ]}
              >
                <ShieldCheck size={15} color={colors.mutedForeground} />
                <Text
                  style={[typography.bodyMedium, { color: colors.foreground }]}
                >
                  Security & Sessions
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
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9999,
    borderWidth: 1.5,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
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
    width: 236,
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
