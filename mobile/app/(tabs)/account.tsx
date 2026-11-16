import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BarChart3,
  ChevronRight,
  Clock,
  History,
  Layers,
  LogOut,
  Mail,
  PackagePlus,
  Phone,
  Settings,
  Shield,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { SignOutConfirmDialog } from "@/components/SignOutConfirmDialog";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { useTheme } from "@/theme";
import { formatDateTime } from "@/utils/formatters";

export default function AccountScreen() {
  const { theme } = useTheme();
  const { user, store } = useAuth();
  const router = useRouter();
  const { colors, spacing, typography, radii, fontFamilies } = theme;
  const [logoutOpen, setLogoutOpen] = useState(false);

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

  const menuItems: ReadonlyArray<{
    title: string;
    description: string;
    route:
      | "/categories"
      | "/restocks"
      | "/audit-logs"
      | "/sales/summary"
      | "/settings";
    icon: React.ReactNode;
  }> = [
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

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <DemoBanner
        title="Account"
        subtitle={user ? `@${user.username}` : "Profile & workspace"}
      />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: spacing["3xl"],
        }}
      >
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
