import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  CloudUpload,
  Code2,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Trash2,
  WifiOff,
} from "lucide-react-native";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from "@/components/ui";
import { useTheme } from "@/theme";
import type { SyncOutboxItem } from "@/types/domain";
import { getUserErrorMessage, normalizeError } from "@/utils/errorHandler";
import { formatDateTime } from "@/utils/formatters";
import { formatOutboxItemSummary } from "@/utils/outboxFormatter";
import { resolveProductImageUri } from "@/utils/productImage";

type QueueFilter = "all" | "conflicts" | "pending";

type DiscardPromptState =
  | { mode: "single"; item: SyncOutboxItem; title: string }
  | { mode: "all_conflicts"; count: number }
  | null;

export default function SyncQueueScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const {
    workspaceMode,
    tenant,
    serverUrl,
    syncStatus,
    syncVersion,
    pendingOutboxCount,
    conflictOutboxCount,
    lastSyncedAt,
    syncError,
    triggerSyncNow,
    discardSyncConflicts,
    listSyncOutboxItems,
    retrySyncOutboxItem,
    retryAllSyncConflicts,
    discardSyncOutboxItem,
  } = useAuth();
  const { colors, spacing, radii, typography, fontFamilies, shadows } = theme;

  const [items, setItems] = useState<SyncOutboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [syncingNow, setSyncingNow] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [discardPrompt, setDiscardPrompt] = useState<DiscardPromptState>(null);
  const [discarding, setDiscarding] = useState(false);

  const loadItems = useCallback(
    async (silent = false) => {
      if (workspaceMode !== "synced") {
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!silent) {
        setLoading((prev) => prev);
      }
      try {
        const rows = await listSyncOutboxItems();
        setItems(rows);
      } catch (err) {
        const normalized = normalizeError(err, {
          fallback: "Could not load your local sync queue right now.",
          context: "sync-queue.loadItems",
        });
        toast.error(
          "Could not load sync queue",
          normalized.userMessage,
          undefined,
          { label: "Retry", onPress: () => void loadItems(false) },
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspaceMode, listSyncOutboxItems, toast],
  );

  useEffect(() => {
    void loadItems(false);
  }, [loadItems, syncVersion, pendingOutboxCount, conflictOutboxCount]);

  useFocusEffect(
    useCallback(() => {
      void loadItems(true);
    }, [loadItems]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems(true);
  }, [loadItems]);

  const counts = useMemo(() => {
    let conflicts = 0;
    let pending = 0;
    for (const item of items) {
      if (item.status === "conflict" || item.status === "failed") {
        conflicts += 1;
      } else {
        pending += 1;
      }
    }
    return { total: items.length, conflicts, pending };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const isConflict = item.status === "conflict" || item.status === "failed";
      if (filter === "conflicts") return isConflict;
      if (filter === "pending") return !isConflict;
      return true;
    });
  }, [items, filter]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSyncNow = async () => {
    setSyncingNow(true);
    try {
      await triggerSyncNow();
      const updated = await listSyncOutboxItems();
      setItems(updated);
      const stillConflicts = updated.filter(
        (r) => r.status === "conflict" || r.status === "failed",
      ).length;
      if (stillConflicts > 0) {
        toast.warning(
          "Sync completed with conflicts",
          `${stillConflicts} item${stillConflicts === 1 ? "" : "s"} still need attention.`,
        );
      } else if (updated.length === 0) {
        toast.success("All changes synced", "Cloud workspace is up to date.");
      } else {
        toast.info(
          "Queue still pending",
          "Device appears offline. Queued items will retry automatically.",
        );
      }
    } catch (err) {
      const normalized = normalizeError(err, {
        fallback: "Could not reach the store server to sync. Please try again.",
        context: "sync-queue.syncNow",
      });
      toast.error(
        "Sync failed",
        normalized.userMessage,
        undefined,
        normalized.requiresSignIn
          ? { label: "Sign In", onPress: () => router.replace("/sign-in") }
          : normalized.retryable
            ? { label: "Retry", onPress: () => void handleSyncNow() }
            : undefined,
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const handleRetryItem = async (item: SyncOutboxItem) => {
    setBusyItemId(item.id);
    try {
      await retrySyncOutboxItem(item.id);
      const updated = await listSyncOutboxItems();
      setItems(updated);
      const remaining = updated.find((r) => r.id === item.id);
      if (!remaining) {
        toast.success("Synced successfully", "Change uploaded to cloud store.");
      } else if (remaining.status === "conflict" || remaining.status === "failed") {
        toast.error(
          "Rejected by server",
          getUserErrorMessage(
            remaining.lastError,
            "Conflict persisted after retry.",
            "sync-queue.itemRejected",
          ),
        );
      } else {
        toast.info(
          "Re-queued for sync",
          getUserErrorMessage(
            remaining.lastError,
            "Will retry once connection is restored.",
            "sync-queue.itemRequeued",
          ),
        );
      }
    } catch (err) {
      const normalized = normalizeError(err, {
        fallback: "Could not retry this queued change. Please try again.",
        context: "sync-queue.retryItem",
      });
      toast.error(
        "Retry failed",
        normalized.userMessage,
        undefined,
        normalized.requiresSignIn
          ? { label: "Sign In", onPress: () => router.replace("/sign-in") }
          : normalized.retryable
            ? { label: "Retry", onPress: () => void handleRetryItem(item) }
            : undefined,
      );
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRetryAllConflicts = async () => {
    setRetryingAll(true);
    try {
      await retryAllSyncConflicts();
      const updated = await listSyncOutboxItems();
      setItems(updated);
      const stillConflicts = updated.filter(
        (r) => r.status === "conflict" || r.status === "failed",
      ).length;
      if (stillConflicts === 0 && updated.length === 0) {
        toast.success("All conflicts resolved", "Queued mutations synced.");
      } else if (stillConflicts > 0) {
        toast.warning(
          `${stillConflicts} conflict${stillConflicts === 1 ? "" : "s"} remain`,
          "Inspect each error below or discard rejected changes.",
        );
      }
    } catch (err) {
      const normalized = normalizeError(err, {
        fallback: "Could not retry conflicted items right now.",
        context: "sync-queue.retryAll",
      });
      toast.error(
        "Bulk retry failed",
        normalized.userMessage,
        undefined,
        normalized.requiresSignIn
          ? { label: "Sign In", onPress: () => router.replace("/sign-in") }
          : normalized.retryable
            ? { label: "Retry", onPress: () => void handleRetryAllConflicts() }
            : undefined,
      );
    } finally {
      setRetryingAll(false);
    }
  };

  const handleConfirmDiscard = async () => {
    if (!discardPrompt) return;
    setDiscarding(true);
    try {
      if (discardPrompt.mode === "single") {
        const res = await discardSyncOutboxItem(discardPrompt.item.id);
        const updated = await listSyncOutboxItems();
        setItems(updated);
        toast.success(
          "Queued change discarded",
          res.refreshedFromCloud
            ? "Local inventory refreshed from cloud state."
            : "Removed from local outbox queue.",
        );
      } else {
        await discardSyncConflicts();
        const updated = await listSyncOutboxItems();
        setItems(updated);
        toast.success(
          "Conflicts cleared",
          "Local device state reconciled with cloud store.",
        );
      }
      setDiscardPrompt(null);
    } catch (err) {
      const normalized = normalizeError(err, {
        fallback: "Could not clear queued item right now. Please try again.",
        context: "sync-queue.discard",
      });
      toast.error(
        "Discard failed",
        normalized.userMessage,
        undefined,
        normalized.requiresSignIn
          ? { label: "Sign In", onPress: () => router.replace("/sign-in") }
          : undefined,
      );
    } finally {
      setDiscarding(false);
    }
  };

  if (workspaceMode !== "synced") {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.base,
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
          <EmptyState
            icon={<Smartphone size={36} color={colors.mutedForeground} />}
            title="Mobile-Only Local Mode"
            description="Your workspace runs strictly on local SQLite storage right now. Outbox sync queues and conflict inspection activate when connected to a Synced Cloud Workspace."
            action={
              <Button
                title="Back to Account"
                variant="outline"
                onPress={() => router.back()}
              />
            }
          />
        </ScrollView>
      </View>
    );
  }

  if (loading) {
    return <LoadingState message="Inspecting local sync outbox..." />;
  }

  const isConflictState =
    syncStatus === "conflict" || counts.conflicts > 0 || conflictOutboxCount > 0;
  const isOfflineState = syncStatus === "offline";
  const isSyncingState =
    syncStatus === "syncing" ||
    syncStatus === "connecting" ||
    syncStatus === "reconnecting";

  const statusBadgeLabel = isConflictState
    ? "Conflict Detected"
    : isOfflineState
      ? "Offline"
      : isSyncingState
        ? "Syncing..."
        : "Live Connected";

  const statusBadgeVariant = isConflictState
    ? "danger"
    : isOfflineState
      ? "outline"
      : isSyncingState
        ? "warning"
        : "success";

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: spacing["3xl"],
        }}
      >
        {/* Overview & Controls Card */}
        <Card>
          <CardHeader bordered>
            <View style={styles.headerRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <CardTitle>Outbox & Conflict Queue</CardTitle>
                <CardDescription>
                  {tenant?.name
                    ? `${tenant.name} (${tenant.slug})`
                    : "Cloud workspace synchronization"}
                </CardDescription>
              </View>
              <Badge label={statusBadgeLabel} variant={statusBadgeVariant} />
            </View>
          </CardHeader>

          <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
            <View style={styles.kpiRow}>
              <View
                style={[
                  styles.kpiBox,
                  {
                    backgroundColor: colors.cardMuted,
                    borderColor: colors.border,
                    borderRadius: radii.lg,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.titleMd,
                    { color: colors.foreground, fontFamily: fontFamilies.bold },
                  ]}
                >
                  {counts.pending}
                </Text>
                <Text
                  style={[typography.micro, { color: colors.mutedForeground }]}
                >
                  Pending Upload
                </Text>
              </View>

              <View
                style={[
                  styles.kpiBox,
                  {
                    backgroundColor:
                      counts.conflicts > 0 ? colors.dangerTint : colors.cardMuted,
                    borderColor:
                      counts.conflicts > 0 ? colors.dangerBorder : colors.border,
                    borderRadius: radii.lg,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.titleMd,
                    {
                      color:
                        counts.conflicts > 0
                          ? colors.dangerText
                          : colors.foreground,
                      fontFamily: fontFamilies.bold,
                    },
                  ]}
                >
                  {counts.conflicts}
                </Text>
                <Text
                  style={[
                    typography.micro,
                    {
                      color:
                        counts.conflicts > 0
                          ? colors.dangerText
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  Conflicts / Failed
                </Text>
              </View>
            </View>

            <View style={styles.metaLine}>
              <Clock size={14} color={colors.mutedForeground} />
              <Text
                style={[typography.caption, { color: colors.mutedForeground }]}
              >
                Last synced:{" "}
                <Text
                  style={{
                    color: colors.foreground,
                    fontFamily: fontFamilies.medium,
                  }}
                >
                  {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Not synced yet"}
                </Text>
              </Text>
            </View>

            {syncError && isOfflineState ? (
              <View
                style={[
                  styles.calloutBox,
                  {
                    backgroundColor: colors.warningTint,
                    borderColor: colors.warningBorder,
                    borderRadius: radii.lg,
                    padding: spacing.sm + 2,
                  },
                ]}
              >
                <WifiOff size={15} color={colors.warningText} />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.warningText, flex: 1 },
                  ]}
                >
                  {getUserErrorMessage(
                    syncError,
                    "Connection to store server was interrupted. Queued changes will retry automatically.",
                    "sync-queue.syncError",
                  )}
                </Text>
              </View>
            ) : null}

            <View style={styles.toolbarRow}>
              <Button
                title={syncingNow ? "Syncing..." : "Sync Now"}
                size="sm"
                loading={syncingNow}
                style={{ flex: 1 }}
                leftIcon={<RefreshCw size={14} color="#FFFFFF" />}
                onPress={() => void handleSyncNow()}
              />
              {counts.conflicts > 0 ? (
                <Button
                  title={retryingAll ? "Retrying..." : "Retry Conflicts"}
                  variant="outline"
                  size="sm"
                  loading={retryingAll}
                  style={{ flex: 1 }}
                  leftIcon={<RotateCcw size={14} color={colors.foreground} />}
                  onPress={() => void handleRetryAllConflicts()}
                />
              ) : null}
            </View>

            {counts.conflicts > 0 ? (
              <Button
                title={`Discard ${counts.conflicts} Conflict${counts.conflicts === 1 ? "" : "s"} & Use Cloud State`}
                variant="destructive"
                size="sm"
                leftIcon={<Trash2 size={14} color="#FFFFFF" />}
                onPress={() =>
                  setDiscardPrompt({
                    mode: "all_conflicts",
                    count: counts.conflicts,
                  })
                }
              />
            ) : null}
          </CardContent>
        </Card>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(
            [
              { key: "all", label: `All (${counts.total})` },
              { key: "conflicts", label: `Conflicts (${counts.conflicts})` },
              { key: "pending", label: `Pending (${counts.pending})` },
            ] as const
          ).map((tab) => {
            const active = filter === tab.key;
            const highlightConflict =
              tab.key === "conflicts" && counts.conflicts > 0;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setFilter(tab.key)}
                style={({ pressed }) => [
                  styles.filterPill,
                  {
                    backgroundColor: active
                      ? highlightConflict
                        ? colors.dangerTint
                        : colors.primaryTint
                      : colors.card,
                    borderColor: active
                      ? highlightConflict
                        ? colors.dangerBorder
                        : colors.primary
                      : colors.border,
                    borderRadius: radii.lg,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: active
                        ? highlightConflict
                          ? colors.dangerText
                          : colors.primary
                        : colors.foreground,
                      fontFamily: active
                        ? fontFamilies.bold
                        : fontFamilies.medium,
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Queue List */}
        {filteredItems.length === 0 ? (
          <EmptyState
            icon={
              counts.total === 0 ? (
                <CheckCircle2 size={36} color={colors.success} />
              ) : (
                <Cloud size={36} color={colors.mutedForeground} />
              )
            }
            title={
              counts.total === 0
                ? "All Offline Changes Synced"
                : filter === "conflicts"
                  ? "No Sync Conflicts"
                  : "No Pending Uploads"
            }
            description={
              counts.total === 0
                ? "Your local outbox queue is empty. Any sales, stock adjustments, or catalog edits recorded offline will appear here until confirmed by the server."
                : "Try switching the queue filter above to inspect remaining items."
            }
            action={
              counts.total === 0 ? (
                <Button
                  title="Check for Updates"
                  variant="outline"
                  size="sm"
                  loading={syncingNow}
                  leftIcon={<RefreshCw size={14} color={colors.foreground} />}
                  onPress={() => void handleSyncNow()}
                />
              ) : undefined
            }
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {filteredItems.map((item) => {
              const summary = formatOutboxItemSummary(item);
              const isConflict =
                item.status === "conflict" || item.status === "failed";
              const isProcessing = item.status === "processing";
              const isExpanded = Boolean(expandedIds[item.id]);
              const isBusy = busyItemId === item.id;

              const statusBadge = isConflict
                ? { label: "Conflict", variant: "danger" as const }
                : isProcessing
                  ? { label: "Syncing", variant: "default" as const }
                  : { label: "Pending", variant: "warning" as const };

              return (
                <Card
                  key={item.id}
                  style={
                    isConflict
                      ? { borderColor: colors.dangerBorder }
                      : undefined
                  }
                >
                  <CardContent style={{ paddingTop: spacing.md, gap: spacing.sm }}>
                    {/* Item Header */}
                    <View style={styles.itemHeader}>
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <View style={styles.badgeStrip}>
                          <Badge
                            label={statusBadge.label}
                            variant={statusBadge.variant}
                          />
                          <Badge
                            label={summary.entityLabel}
                            variant="secondary"
                          />
                          {summary.pendingMediaCount > 0 ? (
                            <Badge
                              label={
                                summary.pendingMediaCount === 1
                                  ? "Photo Queued"
                                  : `${summary.pendingMediaCount} Photos Queued`
                              }
                              variant="outline"
                            />
                          ) : null}
                          {item.retryCount > 0 ? (
                            <Text
                              style={[
                                typography.micro,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              {item.retryCount} attempt
                              {item.retryCount === 1 ? "" : "s"}
                            </Text>
                          ) : null}
                        </View>

                        <Text
                          style={[
                            typography.bodySemibold,
                            { color: colors.foreground },
                          ]}
                        >
                          {summary.title}
                        </Text>
                      </View>
                    </View>

                    {/* Human-readable Payload Summary */}
                    <View style={{ gap: 2 }}>
                      {summary.summaryLines.map((line, index) => (
                        <Text
                          key={`${item.id}-line-${index}`}
                          style={[
                            typography.body,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {line}
                        </Text>
                      ))}
                      <Text
                        style={[
                          typography.micro,
                          { color: colors.mutedForeground, marginTop: 2 },
                        ]}
                      >
                        Queued {formatDateTime(item.createdAt)}
                      </Text>
                    </View>

                    {/* Deferred Local Media Preview */}
                    {summary.pendingMediaUri ? (
                      <View
                        style={[
                          styles.mediaPreviewRow,
                          {
                            backgroundColor: colors.cardMuted,
                            borderColor: colors.border,
                            borderRadius: radii.lg,
                            padding: spacing.sm,
                          },
                        ]}
                      >
                        <Image
                          source={{
                            uri: resolveProductImageUri(
                              summary.pendingMediaUri,
                              serverUrl,
                            ),
                          }}
                          style={[
                            styles.mediaThumb,
                            {
                              borderRadius: radii.md,
                              backgroundColor: colors.muted,
                            },
                          ]}
                          resizeMode="cover"
                        />
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <View style={styles.mediaHeaderLine}>
                            <CloudUpload size={13} color={colors.primary} />
                            <Text
                              style={[
                                typography.caption,
                                {
                                  color: colors.foreground,
                                  fontFamily: fontFamilies.semibold,
                                },
                              ]}
                            >
                              Deferred Media Upload
                            </Text>
                          </View>
                          <Text
                            style={[
                              typography.micro,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            Stored locally on device. Uploads automatically right
                            before this product syncs to cloud storage.
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Server Error Reason */}
                    {item.lastError ? (
                      <View
                        style={[
                          styles.errorBox,
                          {
                            backgroundColor: isConflict
                              ? colors.dangerTint
                              : colors.warningTint,
                            borderColor: isConflict
                              ? colors.dangerBorder
                              : colors.warningBorder,
                            borderRadius: radii.lg,
                            padding: spacing.sm + 2,
                          },
                        ]}
                      >
                        <AlertTriangle
                          size={15}
                          color={
                            isConflict ? colors.dangerText : colors.warningText
                          }
                        />
                        <Text
                          style={[
                            typography.caption,
                            {
                              color: isConflict
                                ? colors.dangerText
                                : colors.warningText,
                              flex: 1,
                            },
                          ]}
                        >
                          {getUserErrorMessage(
                            item.lastError,
                            "This change could not sync right now. Review details or tap Retry.",
                            "sync-queue.itemLastError",
                          )}
                        </Text>
                      </View>
                    ) : null}

                    {/* Collapsible Technical Payload Details */}
                    <Pressable
                      onPress={() => toggleExpanded(item.id)}
                      style={({ pressed }) => [
                        styles.payloadToggle,
                        {
                          backgroundColor: colors.cardMuted,
                          borderColor: colors.border,
                          borderRadius: radii.md,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <View style={styles.payloadToggleLeft}>
                        <Code2 size={14} color={colors.mutedForeground} />
                        <Text
                          style={[
                            typography.micro,
                            {
                              color: colors.mutedForeground,
                              fontFamily: fontFamilies.semibold,
                            },
                          ]}
                        >
                          {isExpanded ? "Hide Request Payload" : "Inspect Payload"}
                        </Text>
                      </View>
                      {isExpanded ? (
                        <ChevronUp size={15} color={colors.mutedForeground} />
                      ) : (
                        <ChevronDown size={15} color={colors.mutedForeground} />
                      )}
                    </Pressable>

                    {isExpanded ? (
                      <View
                        style={[
                          styles.codeBlock,
                          {
                            backgroundColor: colors.muted,
                            borderColor: colors.border,
                            borderRadius: radii.md,
                            padding: spacing.sm,
                          },
                        ]}
                      >
                        <Text
                          selectable
                          style={[
                            styles.monoText,
                            { color: colors.foreground },
                          ]}
                        >
                          {`${item.method.toUpperCase()} ${item.endpoint}\nMutation ID: ${item.clientMutationId}\n\n${summary.prettyPayload}`}
                        </Text>
                      </View>
                    ) : null}

                    {/* Per-Item Actions */}
                    <View style={styles.itemActionsRow}>
                      <Button
                        title={isConflict ? "Retry Sync" : "Sync Item"}
                        variant={isConflict ? "default" : "outline"}
                        size="sm"
                        loading={isBusy}
                        disabled={syncingNow || retryingAll || discarding}
                        style={{ flex: 1 }}
                        leftIcon={
                          <RefreshCw
                            size={14}
                            color={isConflict ? "#FFFFFF" : colors.foreground}
                          />
                        }
                        onPress={() => void handleRetryItem(item)}
                      />
                      <Button
                        title="Discard"
                        variant="outline"
                        size="sm"
                        disabled={isBusy || syncingNow || retryingAll || discarding}
                        style={{
                          flex: 1,
                          borderColor: colors.dangerBorder,
                        }}
                        textStyle={{ color: colors.dangerText }}
                        leftIcon={<Trash2 size={14} color={colors.dangerText} />}
                        onPress={() =>
                          setDiscardPrompt({
                            mode: "single",
                            item,
                            title: summary.title,
                          })
                        }
                      />
                    </View>
                  </CardContent>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Discard Confirmation Modal */}
      <Modal
        visible={Boolean(discardPrompt)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!discarding) setDiscardPrompt(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              shadows.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii.xl,
                padding: spacing.lg,
              },
            ]}
          >
            <View style={styles.modalTitleRow}>
              <View
                style={[
                  styles.modalIconBox,
                  {
                    backgroundColor: colors.dangerTint,
                    borderColor: colors.dangerBorder,
                    borderRadius: radii.lg,
                  },
                ]}
              >
                <AlertTriangle size={20} color={colors.dangerText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.titleSm, { color: colors.foreground }]}>
                  {discardPrompt?.mode === "all_conflicts"
                    ? "Discard All Conflicts?"
                    : "Discard Queued Change?"}
                </Text>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.mutedForeground, marginTop: 2 },
                  ]}
                >
                  {discardPrompt?.mode === "all_conflicts"
                    ? `${discardPrompt.count} rejected item${discardPrompt.count === 1 ? "" : "s"} will be removed.`
                    : discardPrompt?.title}
                </Text>
              </View>
            </View>

            <Text
              style={[
                typography.body,
                { color: colors.mutedForeground, marginTop: spacing.md },
              ]}
            >
              {discardPrompt?.mode === "all_conflicts"
                ? "This removes all conflicted mutations from this device's outbox and reloads authoritative stock and sales from the cloud server."
                : "This removes the queued mutation from your device outbox and refreshes local SQLite data from the cloud server if online. This cannot be undone."}
            </Text>

            <View style={[styles.modalActions, { marginTop: spacing.lg }]}>
              <Button
                title="Cancel"
                variant="outline"
                size="sm"
                disabled={discarding}
                style={{ flex: 1 }}
                onPress={() => setDiscardPrompt(null)}
              />
              <Button
                title={discarding ? "Discarding..." : "Discard & Refresh"}
                variant="destructive"
                size="sm"
                loading={discarding}
                style={{ flex: 1 }}
                onPress={() => void handleConfirmDiscard()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiBox: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  calloutBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterPill: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  badgeStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
  },
  payloadToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  payloadToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  codeBlock: {
    borderWidth: 1,
  },
  mediaPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  mediaThumb: {
    width: 44,
    height: 44,
  },
  mediaHeaderLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  monoText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    lineHeight: 16,
  },
  itemActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalIconBox: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
