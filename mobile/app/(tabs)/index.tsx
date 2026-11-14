import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle2, Info } from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { EmptyState } from "@/components/EmptyState";
import { KpiGrid } from "@/components/KpiGrid";
import { LoadingState } from "@/components/LoadingState";
import { LowStockRow } from "@/components/LowStockRow";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";
import { useTheme } from "@/theme";
import type { TodayDashboardData } from "@/types/domain";

export default function TodayScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const router = useRouter();
  const { colors, spacing, typography, radii } = theme;

  const [data, setData] = useState<TodayDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const result = await api.getTodayDashboard();
        setData(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load today's summary.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useFocusEffect(
    useCallback(() => {
      void loadDashboard(Boolean(data));
    }, [loadDashboard]),
  );

  if (loading && !data) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={[styles.safe, { backgroundColor: colors.background }]}
      >
        <DemoBanner title="Today" subtitle="Sales summary & low-stock alerts" />
        <LoadingState message="Loading today's POS summary..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <DemoBanner title="Today" subtitle="Inventory Pro · Kumasi" />

      <ScrollView
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: spacing["2xl"],
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadDashboard(true)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {error ? (
          <EmptyState
            title="Unable to load summary"
            description={error}
            action={
              <Button
                title="Retry"
                size="sm"
                onPress={() => void loadDashboard()}
              />
            }
          />
        ) : data ? (
          <>
            {/* KPI Summary Grid */}
            <KpiGrid kpis={data.kpis} />

            {/* Low-Stock & Out-of-Stock Alerts */}
            <Card>
              <CardHeader bordered>
                <View style={styles.alertHeader}>
                  <View style={styles.alertTitleWrap}>
                    <CardTitle>Stock alerts</CardTitle>
                    <View style={styles.alertCountsRow}>
                      {data.lowStockAlerts.length === 0 ? (
                        <View style={styles.dotItem}>
                          <CheckCircle2 size={13} color={colors.successText} />
                          <Text
                            style={[
                              typography.caption,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            Nothing needs restocking
                          </Text>
                        </View>
                      ) : (
                        <>
                          {data.kpis.outOfStockCount > 0 ? (
                            <View style={styles.dotItem}>
                              <View
                                style={[
                                  styles.dot,
                                  { backgroundColor: colors.danger },
                                ]}
                              />
                              <Text
                                style={[
                                  typography.caption,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                {data.kpis.outOfStockCount} out of stock
                              </Text>
                            </View>
                          ) : null}
                          {data.kpis.lowStockCount > 0 ? (
                            <View style={styles.dotItem}>
                              <View
                                style={[
                                  styles.dot,
                                  { backgroundColor: colors.warning },
                                ]}
                              />
                              <Text
                                style={[
                                  typography.caption,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                {data.kpis.lowStockCount} running low
                              </Text>
                            </View>
                          ) : null}
                        </>
                      )}
                    </View>
                  </View>

                  <Button
                    title="View all"
                    variant="outline"
                    size="sm"
                    onPress={() => router.push("/(tabs)/inventory")}
                  />
                </View>
              </CardHeader>

              {data.lowStockAlerts.length === 0 ? (
                <View style={{ padding: spacing.lg }}>
                  <Text
                    style={[typography.body, { color: colors.mutedForeground }]}
                  >
                    Every active product currently has at least 5 units in stock.
                  </Text>
                </View>
              ) : (
                <View>
                  {data.lowStockAlerts.map((item, idx) => (
                    <LowStockRow
                      key={item.id}
                      item={item}
                      showBorder={idx < data.lowStockAlerts.length - 1}
                      onPress={() =>
                        router.push({
                          pathname: "/product/[id]",
                          params: { id: item.id },
                        })
                      }
                    />
                  ))}
                </View>
              )}
            </Card>

            {/* Phase 2 Live Backend Note */}
            <View
              style={[
                styles.scopeNote,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: radii.xl,
                  padding: spacing.md + 2,
                },
              ]}
            >
              <Info size={16} color={colors.primary} style={{ marginTop: 2 }} />
              <Text
                style={[
                  typography.caption,
                  { color: colors.mutedForeground, flex: 1 },
                ]}
              >
                Connected to {api.adapterName}. Stock adjustments and quick POS
                sales persist directly to SQLite.
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  alertTitleWrap: {
    flex: 1,
    gap: 4,
  },
  alertCountsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  dotItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
  },
  scopeNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
  },
});
