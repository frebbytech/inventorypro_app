import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, Receipt, Search, X } from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { SaleTransactionRow } from "@/components/SaleTransactionRow";
import { Button, Input, SegmentedTabs } from "@/components/ui";
import { useTheme } from "@/theme";
import type { PaymentMode, SaleTransactionSummary } from "@/types/domain";

type TenderFilter = "all" | PaymentMode;

const TENDER_FILTERS: { value: TenderFilter; label: string }[] = [
  { value: "all", label: "All Tender" },
  { value: "cash", label: "Cash" },
  { value: "momo", label: "MoMo" },
  { value: "bank", label: "Bank" },
];

export default function SalesScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const router = useRouter();
  const { colors, spacing } = theme;

  const [query, setQuery] = useState("");
  const [paymentMode, setPaymentMode] = useState<TenderFilter>("all");
  const [sales, setSales] = useState<SaleTransactionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSales = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const list = await api.getRecentSales({ query, paymentMode });
        setSales(list);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, query, paymentMode],
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

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <DemoBanner
        title="Sales"
        subtitle={`${sales.length} recent ${sales.length === 1 ? "transaction" : "transactions"}`}
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
              placeholder="Search receipt #, customer, or cashier..."
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
            title="New Sale"
            leftIcon={<Plus size={16} color="#FFFFFF" />}
            onPress={() => router.push("/sales/new")}
          />
        </View>

        <SegmentedTabs
          options={TENDER_FILTERS}
          value={paymentMode}
          onChange={setPaymentMode}
        />
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
              description="No sales match your search or selected tender filter."
              action={
                <Button
                  title="Clear filters"
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setQuery("");
                    setPaymentMode("all");
                  }}
                />
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
});
