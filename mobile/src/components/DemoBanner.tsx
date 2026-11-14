import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Database, FlaskConical, LogOut, Moon, Sun } from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { useTheme } from "@/theme";

export function DemoBanner({ title, subtitle }: { title: string; subtitle?: string }) {
  const { theme, mode, toggleMode } = useTheme();
  const api = useApiClient();
  const { user, signOut } = useAuth();
  const { colors, radii, spacing, typography, fontFamilies } = theme;

  return (
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
              style={[typography.caption, { color: colors.mutedForeground, marginTop: 2 }]}
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
              onPress={() => void signOut()}
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
});
