import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronRight,
  Clock,
  Cloud,
  FileSpreadsheet,
  History,
  Layers,
  LogOut,
  Mail,
  PackagePlus,
  Phone,
  RefreshCw,
  Settings,
  Share2,
  Shield,
  Smartphone,
  Truck,
  UserCog,
  Users,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { SignOutConfirmDialog } from "@/components/SignOutConfirmDialog";
import { SyncTransitionModal } from "@/components/SyncTransitionModal";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { useTheme } from "@/theme";
import { formatDateTime } from "@/utils/formatters";

export default function AccountScreen() {
  const { theme } = useTheme();
  const {
    user,
    store,
    workspaceMode,
    tenant,
    syncStatus,
    pendingOutboxCount,
    conflictOutboxCount,
    lastSyncedAt,
    syncError,
    triggerSyncNow,
    discardSyncConflicts,
    switchBackToMobileOnly,
  } = useAuth();
  const router = useRouter();
  const { colors, spacing, typography, radii, fontFamilies } = theme;

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);

  const fullName = user
    ? [user.firstname, user.lastname].filter(Boolean).join(" ").trim() ||
      user.username
    : "Guest User";

  const initials = user
    ? [user.firstname?.[0], user.lastname?.[0]]
        .filter(Boolean)
        .join("")
        .toUpperCase() ||
      user.username?.slice(0, 2).toUpperCase() ||
      "U"
    : "U";

  const roleLabel =
    user?.role === "admin" ? "Administrator" : "Team Member";

  const handleManualSync = async () => {
    setSyncingNow(true);
    try {
      await triggerSyncNow();
    } finally {
      setSyncingNow(false);
    }
  };

  const handleShareWorkspaceCode = async () => {
    if (!tenant?.slug) return;
    try {
      await Share.share({
        message: `InventoryPro Workspace Code for ${tenant.name}: ${tenant.slug}`,
      });
    } catch {
      // ignore cancelled share sheet
    }
  };

  const handleConfirmSwitchToMobileOnly = () => {
    const warning =
      pendingOutboxCount > 0
        ? `You have ${pendingOutboxCount} pending offline change(s). We'll attempt to sync them first before switching back to Mobile-Only mode.`
        : "Switch back to local Mobile-Only storage? You will sign out of the cloud workspace on this device.";

    Alert.alert("Switch to Mobile-Only Mode", warning, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Switch Mode",
        style: "destructive",
        onPress: () => {
          void switchBackToMobileOnly();
        },
      },
    ]);
  };

  const menuItems: ReadonlyArray<{
    title: string;
    description: string;
    route:
      | "/customers"
      | "/suppliers"
      | "/employees"
      | "/reports"
      | "/categories"
      | "/restocks"
      | "/audit-logs"
      | "/sales/summary"
      | "/settings";
    icon: React.ReactNode;
  }> = [
    {
      title: "Customers",
      description: "Directory, contact profiles, and customer order history",
      route: "/customers",
      icon: <Users size={18} color={colors.primary} />,
    },
    {
      title: "Suppliers",
      description: "Distributors, stock deliveries, and balances due",
      route: "/suppliers",
      icon: <Truck size={18} color={colors.primary} />,
    },
    {
      title: "Team & Cashiers",
      description: "Staff accounts, roles, and sales performance by operator",
      route: "/employees",
      icon: <UserCog size={18} color={colors.primary} />,
    },
    {
      title: "Daily Reports",
      description: "End-of-day revenue, profit, cashier mix & printable PDF",
      route: "/reports",
      icon: <FileSpreadsheet size={18} color={colors.primary} />,
    },
    {
      title: "Product Categories",
      description: "Organize catalog categories and active visibility",
      route: "/categories",
      icon: <Layers size={18} color={colors.primary} />,
    },
    {
      title: "Restock History",
      description: "Track stock deliveries, manual counts, and adjustments",
      route: "/restocks",
      icon: <PackagePlus size={18} color={colors.primary} />,
    },
    {
      title: "Audit Logs",
      description: "Activity trail of sign-ins, sales, and inventory updates",
      route: "/audit-logs",
      icon: <History size={18} color={colors.primary} />,
    },
    {
      title: "Sales Summary",
      description: "Revenue, profit margin, payment mix, and top products",
      route: "/sales/summary",
      icon: <BarChart3 size={18} color={colors.primary} />,
    },
    {
      title: "Settings",
      description: `${store?.storeName || "Business info"} & appearance theme`,
      route: "/settings",
      icon: <Settings size={18} color={colors.primary} />,
    },
  ];

  const syncStatusLabel =
    workspaceMode === "mobile_only"
      ? "Local SQLite Only"
      : syncStatus === "live"
        ? "Live Connected"
        : syncStatus === "syncing"
          ? "Syncing..."
          : syncStatus === "reconnecting"
            ? "Reconnecting..."
            : syncStatus === "conflict"
              ? "Conflict Detected"
              : "Offline";

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <DemoBanner
        title="Account"
        subtitle={
          tenant
            ? `${tenant.name} · @${user?.username || "staff"}`
            : user
              ? `@${user.username}`
              : "Profile & workspace"
        }
      />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: spacing["3xl"],
        }}
      >
        {/* Workspace & Live Sync Card */}
        <Card>
          <CardHeader bordered>
            <View style={styles.workspaceCardHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {workspaceMode === "synced" ? (
                  <Cloud size={18} color={colors.primary} />
                ) : (
                  <Smartphone size={18} color={colors.primary} />
                )}
                <CardTitle>Workspace & Live Sync</CardTitle>
              </View>
              <Badge
                label={syncStatusLabel}
                variant={
                  workspaceMode === "synced" && syncStatus === "live"
                    ? "default"
                    : "outline"
                }
              />
            </View>
          </CardHeader>

          <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
            {workspaceMode === "mobile_only" ? (
              <>
                <Text style={[typography.body, { color: colors.mutedForeground }]}>
                  You are running in{" "}
                  <Text
                    style={{
                      color: colors.foreground,
                      fontFamily: fontFamilies.semibold,
                    }}
                  >
                    Mobile-Only Mode
                  </Text>
                  . All products, stock, and sales live on this device. Enable Live
                  Sync anytime to collaborate with the Web App or additional mobile
                  devices.
                </Text>
                <Button
                  title="Switch to Synced (Web + Mobile)"
                  size="default"
                  leftIcon={<Cloud size={16} color="#FFFFFF" />}
                  onPress={() => setTransitionOpen(true)}
                />
              </>
            ) : (
              <>
                <View style={styles.metaList}>
                  <View style={styles.metaRow}>
                    <Building2 size={15} color={colors.mutedForeground} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground, width: 92 },
                      ]}
                    >
                      Workspace
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.bodyMedium,
                        { color: colors.foreground, flex: 1 },
                      ]}
                    >
                      {tenant?.name || store?.storeName || "Cloud Store"}
                    </Text>
                  </View>

                  {tenant?.slug ? (
                    <View style={styles.metaRow}>
                      <Share2 size={15} color={colors.mutedForeground} />
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.mutedForeground, width: 92 },
                        ]}
                      >
                        Store Code
                      </Text>
                      <Pressable
                        onPress={() => void handleShareWorkspaceCode()}
                        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            typography.bodySemibold,
                            { color: colors.primary },
                          ]}
                        >
                          {tenant.slug}
                        </Text>
                        <Text
                          style={[
                            typography.micro,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          (Share)
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={styles.metaRow}>
                    <Clock size={15} color={colors.mutedForeground} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground, width: 92 },
                      ]}
                    >
                      Last synced
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.bodyMedium,
                        { color: colors.foreground, flex: 1 },
                      ]}
                    >
                      {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Just now"}
                    </Text>
                  </View>
                </View>

                {pendingOutboxCount > 0 ? (
                  <View
                    style={[
                      styles.noticeBanner,
                      {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        borderRadius: radii.lg,
                        padding: spacing.sm,
                      },
                    ]}
                  >
                    <RefreshCw size={14} color={colors.primary} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.foreground, flex: 1 },
                      ]}
                    >
                      {pendingOutboxCount} offline change
                      {pendingOutboxCount === 1 ? "" : "s"} queued to upload
                    </Text>
                  </View>
                ) : null}

                {conflictOutboxCount > 0 || syncError ? (
                  <View
                    style={[
                      styles.noticeBanner,
                      {
                        backgroundColor: colors.dangerTint,
                        borderColor: colors.dangerBorder,
                        borderRadius: radii.lg,
                        padding: spacing.sm,
                      },
                    ]}
                  >
                    <AlertTriangle size={14} color={colors.dangerText} />
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.dangerText, flex: 1 },
                      ]}
                    >
                      {syncError ||
                        `${conflictOutboxCount} sync conflict(s) rejected by server stock rules.`}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.syncActionsRow}>
                  <Button
                    title={syncingNow ? "Syncing..." : "Sync Now"}
                    variant="outline"
                    size="sm"
                    loading={syncingNow}
                    style={{ flex: 1 }}
                    leftIcon={<RefreshCw size={14} color={colors.foreground} />}
                    onPress={() => void handleManualSync()}
                  />
                  {conflictOutboxCount > 0 ? (
                    <Button
                      title="Use Cloud State"
                      variant="destructive"
                      size="sm"
                      style={{ flex: 1 }}
                      onPress={() => void discardSyncConflicts()}
                    />
                  ) : (
                    <Button
                      title="Mobile-Only"
                      variant="ghost"
                      size="sm"
                      onPress={handleConfirmSwitchToMobileOnly}
                    />
                  )}
                </View>
              </>
            )}
          </CardContent>
        </Card>

        {/* Profile Card */}
        <Card>
          <CardContent style={{ paddingTop: spacing.lg, gap: spacing.base }}>
            <View style={styles.profileHeader}>
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

              <View style={styles.profileIdentity}>
                <Text
                  numberOfLines={1}
                  style={[typography.titleSm, { color: colors.foreground }]}
                >
                  {fullName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground },
                  ]}
                >
                  @{user?.username ?? "guest"}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <Badge
                    label={roleLabel}
                    variant={user?.role === "admin" ? "default" : "secondary"}
                  />
                </View>
              </View>
            </View>

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            <View style={styles.metaList}>
              <View style={styles.metaRow}>
                <Mail size={15} color={colors.mutedForeground} />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, width: 78 },
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
                  {user?.email || "—"}
                </Text>
              </View>

              {user?.phonenumber ? (
                <View style={styles.metaRow}>
                  <Phone size={15} color={colors.mutedForeground} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground, width: 78 },
                    ]}
                  >
                    Phone
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.bodyMedium,
                      { color: colors.foreground, flex: 1 },
                    ]}
                  >
                    {user.phonenumber}
                  </Text>
                </View>
              ) : null}

              <View style={styles.metaRow}>
                <Shield size={15} color={colors.mutedForeground} />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, width: 78 },
                  ]}
                >
                  Role
                </Text>
                <Text
                  style={[
                    typography.bodyMedium,
                    { color: colors.foreground, flex: 1 },
                  ]}
                >
                  {roleLabel}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Clock size={15} color={colors.mutedForeground} />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, width: 78 },
                  ]}
                >
                  Last login
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    typography.bodyMedium,
                    { color: colors.foreground, flex: 1 },
                  ]}
                >
                  {formatDateTime(user?.lastLoginAt)}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Workspace Links Card */}
        <Card>
          <CardContent style={{ padding: 0 }}>
            {menuItems.map((item, idx) => (
              <React.Fragment key={item.route}>
                {idx > 0 ? (
                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />
                ) : null}
                <Pressable
                  onPress={() => router.push(item.route)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.menuRow,
                    {
                      paddingHorizontal: spacing.base,
                      paddingVertical: spacing.md + 2,
                      backgroundColor: pressed ? colors.accent : "transparent",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.menuIconBox,
                      {
                        backgroundColor: colors.primaryTint,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    {item.icon}
                  </View>

                  <View style={styles.menuTextCol}>
                    <Text
                      style={[
                        typography.bodySemibold,
                        { color: colors.foreground },
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground, marginTop: 1 },
                      ]}
                    >
                      {item.description}
                    </Text>
                  </View>

                  <ChevronRight size={18} color={colors.mutedForeground} />
                </Pressable>
              </React.Fragment>
            ))}
          </CardContent>
        </Card>

        {/* Log out button */}
        <Button
          title="Log out"
          variant="destructive"
          size="lg"
          leftIcon={<LogOut size={16} color="#FFFFFF" />}
          onPress={() => setLogoutOpen(true)}
        />
      </ScrollView>

      <SyncTransitionModal
        visible={transitionOpen}
        onClose={() => setTransitionOpen(false)}
      />

      <SignOutConfirmDialog
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  workspaceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  syncActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 9999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  profileIdentity: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  metaList: {
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuIconBox: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTextCol: {
    flex: 1,
    minWidth: 0,
  },
});
