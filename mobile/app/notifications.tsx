import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Trash2,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
import { LoadingState } from "@/components/LoadingState";
import { Badge, Button, Card, SegmentedTabs, useToast } from "@/components/ui";
import { useTheme } from "@/theme";
import type { NotificationItem } from "@/types/domain";
import { normalizeError, type NormalizedAppError } from "@/utils/errorHandler";
import { formatDateTime } from "@/utils/formatters";

type FilterTab = "all" | "unread";

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const { refreshUnreadNotifications } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [tab, setTab] = useState<FilterTab>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<NormalizedAppError | null>(null);
  const hasLoadedRef = useRef(false);

  const loadNotifications = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setErrorMsg(null);
      try {
        const list = await api.getNotifications({ limit: 120 });
        setItems(list);
        hasLoadedRef.current = true;
        await refreshUnreadNotifications();
      } catch (err) {
        setErrorMsg(
          normalizeError(err, {
            fallback: "Failed to load notifications.",
            context: "NotificationsScreen.loadNotifications",
          }),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, refreshUnreadNotifications],
  );

  useEffect(() => {
    void loadNotifications(false);
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        void loadNotifications(true);
      }
    }, [loadNotifications]),
  );

  const unreadCount = useMemo(
    () => items.filter((n) => !n.isRead).length,
    [items],
  );

  const filteredItems = useMemo(() => {
    if (tab === "unread") {
      return items.filter((n) => !n.isRead);
    }
    return items;
  }, [items, tab]);

  const handleOpenNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      setBusyId(item.id);
      try {
        const updated = await api.markNotificationRead(item.id);
        setItems((prev) =>
          prev.map((row) => (row.id === item.id ? updated : row)),
        );
        await refreshUnreadNotifications();
        toast.info("Marked as read", item.title);
      } catch (err) {
        const norm = normalizeError(err, {
          fallback: "Could not update notification.",
          context: "NotificationsScreen.markRead",
        });
        setErrorMsg(norm);
        toast.error(
          "Update failed",
          norm.userMessage,
          undefined,
          norm.requiresSignIn
            ? { label: "Sign In", onPress: () => router.push("/sign-in") }
            : undefined,
        );
      } finally {
        setBusyId(null);
      }
    }

    if (item.referenceType === "product" && item.referenceId) {
      router.push({
        pathname: "/product/[id]",
        params: { id: item.referenceId },
      });
    } else if (item.referenceType === "sale" && item.referenceId) {
      router.push({
        pathname: "/sales/[id]",
        params: { id: item.referenceId },
      });
    } else if (item.referenceType === "broadcast") {
      router.push("/messages");
    } else if (item.referenceType === "security") {
      router.push("/security");
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setErrorMsg(null);
    try {
      await api.deleteNotification(id);
      setItems((prev) => prev.filter((row) => row.id !== id));
      await refreshUnreadNotifications();
      toast.success("Notification deleted", "Removed from your inbox.");
    } catch (err) {
      const norm = normalizeError(err, {
        fallback: "Failed to delete notification.",
        context: "NotificationsScreen.delete",
      });
      setErrorMsg(norm);
      toast.error(
        "Delete failed",
        norm.userMessage,
        undefined,
        norm.requiresSignIn
          ? { label: "Sign In", onPress: () => router.push("/sign-in") }
          : norm.retryable
            ? { label: "Retry", onPress: () => void handleDelete(id) }
            : undefined,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    setBulkBusy(true);
    setErrorMsg(null);
    try {
      await api.markAllNotificationsRead();
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((row) => ({ ...row, isRead: true, updatedAt: nowIso })),
      );
      await refreshUnreadNotifications();
      toast.success("All caught up", "All notifications marked as read.");
    } catch (err) {
      const norm = normalizeError(err, {
        fallback: "Failed to mark notifications as read.",
        context: "NotificationsScreen.markAllRead",
      });
      setErrorMsg(norm);
      toast.error(
        "Update failed",
        norm.userMessage,
        undefined,
        norm.requiresSignIn
          ? { label: "Sign In", onPress: () => router.push("/sign-in") }
          : norm.retryable
            ? { label: "Retry", onPress: () => void handleMarkAllRead() }
            : undefined,
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const handleConfirmClearAll = async () => {
    setBulkBusy(true);
    setErrorMsg(null);
    try {
      await api.clearAllNotifications();
      setItems([]);
      setClearConfirmOpen(false);
      await refreshUnreadNotifications();
      toast.success("Notifications cleared", "All notifications removed.");
    } catch (err) {
      const norm = normalizeError(err, {
        fallback: "Failed to clear notifications.",
        context: "NotificationsScreen.clearAll",
      });
      setErrorMsg(norm);
      toast.error(
        "Clear failed",
        norm.userMessage,
        undefined,
        norm.requiresSignIn
          ? {
              label: "Sign In",
              onPress: () => {
                setClearConfirmOpen(false);
                router.push("/sign-in");
              },
            }
          : norm.retryable
            ? { label: "Retry", onPress: () => void handleConfirmClearAll() }
            : undefined,
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const getVisualForType = (type: string) => {
    switch (type) {
      case "low_stock":
        return {
          icon: <AlertTriangle size={17} color={colors.warningText} />,
          bg: colors.warningTint,
          badgeLabel: "Stock Alert",
          badgeVariant: "warning" as const,
        };
      case "refund":
        return {
          icon: <RotateCcw size={17} color={colors.dangerText} />,
          bg: colors.dangerTint,
          badgeLabel: "Refund",
          badgeVariant: "danger" as const,
        };
      case "employee":
        return {
          icon: <MessageSquare size={17} color={colors.primary} />,
          bg: colors.primaryTint,
          badgeLabel: "Team Broadcast",
          badgeVariant: "default" as const,
        };
      case "security":
        return {
          icon: <ShieldAlert size={17} color={colors.successText} />,
          bg: colors.successTint,
          badgeLabel: "Security",
          badgeVariant: "success" as const,
        };
      case "sale":
        return {
          icon: <ShoppingBag size={17} color={colors.successText} />,
          bg: colors.successTint,
          badgeLabel: "Sale",
          badgeVariant: "success" as const,
        };
      default:
        return {
          icon: <Bell size={17} color={colors.mutedForeground} />,
          bg: colors.muted,
          badgeLabel: "System",
          badgeVariant: "secondary" as const,
        };
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={{
          paddingHorizontal: spacing.base,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
          gap: spacing.sm + 2,
        }}
      >
        <SegmentedTabs<FilterTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: `All (${items.length})` },
            { value: "unread", label: `Unread (${unreadCount})` },
          ]}
        />

        {items.length > 0 ? (
          <View style={styles.bulkActionRow}>
            <Button
              title={
                unreadCount > 0 ? `Mark all read (${unreadCount})` : "All caught up"
              }
              size="sm"
              variant="outline"
              disabled={unreadCount === 0 || bulkBusy}
              leftIcon={<CheckCheck size={14} color={colors.foreground} />}
              onPress={() => void handleMarkAllRead()}
              style={{ flex: 1 }}
            />
            <Button
              title="Clear all"
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              leftIcon={<Trash2 size={14} color={colors.dangerText} />}
              onPress={() => setClearConfirmOpen(true)}
            />
          </View>
        ) : null}

        {errorMsg ? (
          <InlineErrorBanner
            message={errorMsg.userMessage}
            category={errorMsg.category}
            onRetry={
              errorMsg.retryable ? () => void loadNotifications(false) : undefined
            }
            onSignIn={
              errorMsg.requiresSignIn ? () => router.push("/sign-in") : undefined
            }
            onDismiss={() => setErrorMsg(null)}
          />
        ) : null}
      </View>

      {loading && items.length === 0 ? (
        <LoadingState message="Loading notifications..." />
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: spacing.base,
            paddingTop: spacing.xs,
            gap: spacing.sm + 2,
            paddingBottom: spacing["3xl"],
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadNotifications(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => {
            const visual = getVisualForType(item.type);
            const hasLink = Boolean(item.referenceType && item.referenceId);

            return (
              <Card
                style={
                  !item.isRead
                    ? { borderColor: colors.primary, borderWidth: 1 }
                    : undefined
                }
              >
                <Pressable
                  onPress={() => void handleOpenNotification(item)}
                  disabled={busyId === item.id}
                  style={({ pressed }) => [
                    styles.cardRow,
                    {
                      padding: spacing.md + 2,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.typeIconBox,
                      {
                        backgroundColor: visual.bg,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    {visual.icon}
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                      <View style={styles.cardBadges}>
                        <Badge
                          label={visual.badgeLabel}
                          variant={visual.badgeVariant}
                        />
                        {!item.isRead ? (
                          <View
                            style={[
                              styles.unreadDot,
                              { backgroundColor: colors.primary },
                            ]}
                          />
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => void handleDelete(item.id)}
                        disabled={busyId === item.id}
                        hitSlop={10}
                        accessibilityLabel="Delete notification"
                      >
                        <Trash2 size={15} color={colors.mutedForeground} />
                      </Pressable>
                    </View>

                    <Text
                      style={[
                        typography.bodySemibold,
                        {
                          color: colors.foreground,
                          fontFamily: item.isRead
                            ? fontFamilies.medium
                            : fontFamilies.bold,
                        },
                      ]}
                    >
                      {item.title}
                    </Text>

                    {item.message ? (
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {item.message}
                      </Text>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <Text
                        style={[
                          typography.micro,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {formatDateTime(item.createdAt)}
                      </Text>
                      {hasLink ? (
                        <Text
                          style={[
                            typography.micro,
                            {
                              color: colors.primary,
                              fontFamily: fontFamilies.semibold,
                            },
                          ]}
                        >
                          Tap to view
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<BellOff size={36} color={colors.mutedForeground} />}
              title={
                tab === "unread"
                  ? "No unread notifications"
                  : "No notifications yet"
              }
              description={
                tab === "unread"
                  ? "You are completely caught up on alerts and team messages."
                  : "Low stock warnings, refunds, password changes, and team broadcasts will show up here."
              }
              action={
                tab === "unread" && items.length > 0 ? (
                  <Button
                    title="Show all notifications"
                    size="sm"
                    variant="outline"
                    onPress={() => setTab("all")}
                  />
                ) : undefined
              }
            />
          }
        />
      )}

      <Modal
        visible={clearConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClearConfirmOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setClearConfirmOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={[
              styles.confirmCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii.xl,
                padding: spacing.lg,
                gap: spacing.md,
              },
            ]}
          >
            <Text style={[typography.titleSm, { color: colors.foreground }]}>
              Clear all notifications?
            </Text>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              This removes all {items.length} notification(s) from your inbox on
              this device.
            </Text>
            <View style={styles.confirmActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setClearConfirmOpen(false)}
                disabled={bulkBusy}
                style={{ flex: 1 }}
              />
              <Button
                title="Clear all"
                variant="destructive"
                loading={bulkBusy}
                onPress={() => void handleConfirmClearAll()}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bulkActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorBanner: {
    borderWidth: 1,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  typeIconBox: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.45)",
    justifyContent: "center",
    padding: 20,
  },
  confirmCard: {
    borderWidth: 1,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
  },
});
