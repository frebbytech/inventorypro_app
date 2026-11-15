import React, { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { LogOut } from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { Button } from "@/components/ui";
import { useTheme } from "@/theme";

export function SignOutConfirmDialog({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const { colors, radii, spacing, typography } = theme;
  const [signingOut, setSigningOut] = useState(false);

  const displayName = user
    ? [user.firstname, user.lastname].filter(Boolean).join(" ").trim() ||
      user.username
    : "User";

  const handleConfirm = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      onClose();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!signingOut) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radii["2xl"],
              padding: spacing.lg,
            },
          ]}
        >
          <View style={styles.header}>
            <View
              style={[
                styles.iconBox,
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
                Log out?
              </Text>
              {user ? (
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, marginTop: 2 },
                  ]}
                >
                  {displayName} (@{user.username})
                </Text>
              ) : null}
            </View>
          </View>

          <Text
            style={[
              typography.body,
              { color: colors.mutedForeground, marginTop: spacing.md },
            ]}
          >
            You&apos;ll be signed out of your account and returned to the sign-in
            screen. Your local SQLite data remains saved on this device.
          </Text>

          <View style={[styles.actions, { marginTop: spacing.lg }]}>
            <Button
              title="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              disabled={signingOut}
              onPress={onClose}
            />
            <Button
              title={signingOut ? "Logging out..." : "Log out"}
              variant="destructive"
              style={{ flex: 1 }}
              loading={signingOut}
              onPress={() => void handleConfirm()}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.60)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    borderWidth: 1,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
});
