import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BarChart3,
  ChevronRight,
  Plus,
  Receipt,
  Search,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { SaleTransactionRow } from "@/components/SaleTransactionRow";
import { Button, Input, SegmentedTabs } from "@/components/ui";
import { useTheme } from "@/theme";
import type {
  PaymentMode,
  SalesDateRange,
  SaleStatus,
  SaleTransactionSummary,
} from "@/types/domain";
import { formatCurrency, formatNumber } from "@/utils/formatters";

type TenderFilter = "all" | PaymentMode;
type StatusFilter = "all" | Extract<SaleStatus, "completed" | "refunded">;

const TENDER_FILTERS: { value: TenderFilter; label: string }[] = [
  { value: "all", label: "All Tender" },
  { value: "cash", label: "Cash" },
  { value: "momo", label: "MoMo" },
  { value: "bank", label: "Bank" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "completed", label: "Completed" },
  { value: "refunded", label: "Refunded" },
];

const RANGE_FILTERS: { value: SalesDateRange; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

export default function SalesScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;
  const currency = store?.currency || "GHS";

  const [query, setQuery] = useState("");
  const [paymentMode, setPaymentMode] = useState<TenderFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<SalesDateRange>("all");
  const [sales, setSales] = useState<SaleTransactionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSales = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const list = await api.getRecentSales({
          query,
          paymentMode,
          status: statusFilter,
          dateRange,
        });
        setSales(list);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, query, paymentMode, statusFilter, dateRange],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSales();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadSales]);

  useFocusEffect(
    useCallback(() => {
      void loadSales(sales.length > 0);
    }, [loadSales]),
  );

  const summaryStats = useMemo(() => {
    let completedTotal = 0;
    let completedCount = 0;
    let refundedCount = 0;
    for (const s of sales) {
      if (s.status === "completed") {
        completedTotal += s.totalAmount;
        completedCount += 1;
      } else if (s.status === "refunded") {
        refundedCount += 1;
      }
    }
    return {
      completedTotal,
      completedCount,
      refundedCount,
    };
  }, [sales]);

  const hasActiveFilters =
    query.length > 0 ||
    paymentMode !== "all" ||
    statusFilter !== "all" ||
    dateRange !== "all";

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <DemoBanner
        title="Sales"
        subtitle={`${sales.length} ${sales.length === 1 ? "transaction" : "transactions"}`}
      />

      <View
        style={{
          paddingHorizontal: spacing.base,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
          gap: spacing.sm + 2,
        }}
      >
        <View style={styles.searchActionRow}>
          <View style={{ flex: 1 }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search receipt #, customer, cashier..."
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon={<Search size={18} color={colors.mutedForeground} />}
              rightSlot={
                query.length > 0 ? (
                  <Pressable
                    onPress={() => setQuery("")}
                    hitSlop={8}
                    accessibilityLabel="Clear search"
                  >
                    <X size={16} color={colors.mutedForeground} />
                  </Pressable>
                ) : null
              }
            />
          </View>
          <Button
            variant="outline"
            size="icon"
            accessibilityLabel="Open Sales Report"
            leftIcon={<BarChart3 size={18} color={colors.foreground} />}
            onPress={() => router.push("/sales/summary")}
          />
          <Button
            title="New Sale"
            leftIcon={<Plus size={16} color={colors.primaryForeground} />}
            onPress={() => router.push("/sales/new")}
          />
        </View>

        <SegmentedTabs
          options={TENDER_FILTERS}
          value={paymentMode}
          onChange={setPaymentMode}
        />

        {/* Status & Date Range Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {STATUS_FILTERS.map((item) => {
            const selected = statusFilter === item.value;
            return (
              <Pressable
                key={`st-${item.value}`}
                onPress={() => setStatusFilter(item.value)}
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

          <View
            style={[styles.chipDivider, { backgroundColor: colors.border }]}
          />

          {RANGE_FILTERS.map((item) => {
            const selected = dateRange === item.value;
            return (
              <Pressable
                key={`dr-${item.value}`}
                onPress={() => setDateRange(item.value)}
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

        {/* Compact Summary Strip linking to Full Report */}
        <Pressable
          onPress={() => router.push("/sales/summary")}
          style={({ pressed }) => [
            styles.summaryStrip,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radii.xl,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm + 2,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={styles.summaryStats}>
            <View>
              <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                COMPLETED TOTAL
              </Text>
              <Text
                style={[
                  typography.bodySemibold,
                  typography.tabular,
                  { color: colors.foreground, fontFamily: fontFamilies.bold },
                ]}
              >
                {formatCurrency(summaryStats.completedTotal, currency)}
              </Text>
            </View>
            <View style={[styles.stripSep, { backgroundColor: colors.border }]} />
            <View>
              <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                COMPLETED
              </Text>
              <Text
                style={[
                  typography.bodySemibold,
                  typography.tabular,
                  { color: colors.successText },
                ]}
              >
                {formatNumber(summaryStats.completedCount)}
              </Text>
            </View>
            <View style={[styles.stripSep, { backgroundColor: colors.border }]} />
            <View>
              <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                REFUNDED
              </Text>
              <Text
                style={[
                  typography.bodySemibold,
                  typography.tabular,
                  {
                    color:
                      summaryStats.refundedCount > 0
                        ? colors.warningText
                        : colors.mutedForeground,
                  },
                ]}
              >
                {formatNumber(summaryStats.refundedCount)}
              </Text>
            </View>
          </View>

          <View style={styles.reportCta}>
            <Text
              style={[
                typography.caption,
                { color: colors.primary, fontFamily: fontFamilies.semibold },
              ]}
            >
              Report
            </Text>
            <ChevronRight size={14} color={colors.primary} />
          </View>
        </Pressable>
      </View>

      {loading && sales.length === 0 ? (
        <LoadingState message="Loading recent sales..." />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: spacing.base,
            paddingTop: spacing.xs,
            gap: spacing.md,
            paddingBottom: spacing["2xl"],
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadSales(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <SaleTransactionRow
              sale={item}
              onPress={() =>
                router.push({
                  pathname: "/sales/[id]",
                  params: { id: item.id },
                })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Receipt size={36} color={colors.mutedForeground} />}
              title="No transactions found"
              description="No sales match your search or active filters."
              action={
                hasActiveFilters ? (
                  <Button
                    title="Clear filters"
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      setQuery("");
                      setPaymentMode("all");
                      setStatusFilter("all");
                      setDateRange("all");
                    }}
                  />
                ) : undefined
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  searchActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipDivider: {
    width: 1,
    height: 18,
  },
  summaryStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    gap: 8,
  },
  summaryStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  stripSep: {
    width: 1,
    height: 24,
  },
  reportCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});
