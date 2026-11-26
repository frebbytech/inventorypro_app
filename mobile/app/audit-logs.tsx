import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { History, Search, X } from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { EmptyState } from "@/components/EmptyState";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
import { LoadingState } from "@/components/LoadingState";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useTheme } from "@/theme";
import type { AuditLogItem } from "@/types/domain";
import {
  normalizeError,
  type NormalizedAppError,
} from "@/utils/errorHandler";
import { capitalizeLabel, formatDateTime } from "@/utils/formatters";

const ACTION_FILTERS = [
  { value: "all", label: "All" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
] as const;

function summarizeJsonValues(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return raw;
    const entries = Object.entries(parsed)
      .filter(([, val]) => val !== undefined && val !== null && val !== "")
      .slice(0, 4)
      .map(([key, val]) => {
        const prettyKey = key.replace(/_/g, " ");
        const prettyVal = Array.isArray(val)
          ? val.join(", ")
          : typeof val === "object"
            ? JSON.stringify(val)
            : String(val);
        return `${prettyKey}: ${prettyVal}`;
      });
    return entries.length > 0 ? entries.join(" · ") : null;
  } catch {
    return raw;
  }
}

export default function AuditLogsScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<NormalizedAppError | null>(null);

  const loadLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const rows = await api.getAuditLogs({
          query,
          action: actionFilter,
          limit: 100,
        });
        setLogs(rows);
      } catch (err) {
        setLoadError(
          normalizeError(err, {
            fallback: "Could not load audit logs right now. Please try again.",
            context: "audit-logs.load",
          }),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, query, actionFilter],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLogs();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadLogs]);

  useFocusEffect(
    useCallback(() => {
      void loadLogs(logs.length > 0);
    }, [loadLogs]),
  );

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
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search entity, user, or details..."
          autoCapitalize="none"
          autoCorrect={false}
          leftIcon={<Search size={18} color={colors.mutedForeground} />}
          rightSlot={
            query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <X size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : null
          }
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {ACTION_FILTERS.map((item) => {
            const selected = actionFilter === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => setActionFilter(item.value)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selected
                      ? colors.primaryTint
                      : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                    borderRadius: radii.lg,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      color: selected ? colors.primary : colors.foreground,
                      fontFamily: selected
                        ? fontFamilies.bold
                        : fontFamilies.medium,
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loadError ? (
        <View style={{ paddingHorizontal: spacing.base, paddingBottom: spacing.sm }}>
          <InlineErrorBanner
            message={loadError.userMessage}
            category={loadError.category}
            onRetry={() => void loadLogs(logs.length > 0)}
            retrying={loading || refreshing}
            onSignIn={
              loadError.requiresSignIn
                ? () => router.replace("/sign-in")
                : undefined
            }
          />
        </View>
      ) : null}

      {loading && logs.length === 0 ? (
        <LoadingState message="Loading audit logs..." />
      ) : (
        <FlatList
          data={logs}
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
              onRefresh={() => void loadLogs(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => {
            const variant =
              item.action === "create" || item.action === "login"
                ? "success"
                : item.action === "update"
                  ? "warning"
                  : item.action === "delete"
                    ? "danger"
                    : "secondary";

            const detailsSummary = summarizeJsonValues(item.newValues);
            const previousSummary = summarizeJsonValues(item.oldValues);

            return (
              <Card>
                <View style={{ padding: spacing.md + 2, gap: 6 }}>
                  <View style={styles.logTopRow}>
                    <View style={styles.logBadges}>
                      <Badge
                        label={capitalizeLabel(item.action)}
                        variant={variant}
                      />
                      <Badge
                        label={item.entityType.replace(/_/g, " ").toUpperCase()}
                        variant="outline"
                      />
                    </View>
                    <Text
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {formatDateTime(item.createdAt)}
                    </Text>
                  </View>

                  <Text
                    style={[typography.bodyMedium, { color: colors.foreground }]}
                  >
                    {item.userFullName}{" "}
                    <Text style={{ color: colors.mutedForeground }}>
                      (@{item.username})
                    </Text>
                  </Text>

                  {detailsSummary ? (
                    <Text
                      numberOfLines={2}
                      style={[
                        typography.caption,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {detailsSummary}
                    </Text>
                  ) : null}

                  {previousSummary ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        typography.micro,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Previous: {previousSummary}
                    </Text>
                  ) : null}
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<History size={36} color={colors.mutedForeground} />}
              title="No audit logs found"
              description="Activity from logins, stock changes, sales, and settings will appear here."
              action={
                query || actionFilter !== "all" ? (
                  <Button
                    title="Clear filters"
                    size="sm"
                    variant="outline"
                    onPress={() => {
                      setQuery("");
                      setActionFilter("all");
                    }}
                  />
                ) : undefined
              }
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  logBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
