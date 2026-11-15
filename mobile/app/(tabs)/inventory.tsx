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
import { SafeAreaView } from "react-native-safe-area-context";
import { FileSpreadsheet, Package, Plus, Search, X } from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ProductCard } from "@/components/ProductCard";
import { Button, Input, SegmentedTabs } from "@/components/ui";
import { useTheme } from "@/theme";
import type { ProductItem, StockStatusFilter } from "@/types/domain";

const STOCK_FILTER_OPTIONS: { value: StockStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_stock", label: "In Stock" },
  { value: "low_stock", label: "Low" },
  { value: "out_of_stock", label: "Out" },
];

export default function InventoryScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>("all");

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void api.getCategories().then(setCategories).catch(() => {});
  }, [api]);

  const loadProducts = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const list = await api.getProducts({
          query,
          category: selectedCategory,
          stockStatus,
        });
        setProducts(list);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, query, selectedCategory, stockStatus],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProducts();
    }, 120);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      void api.getCategories().then(setCategories).catch(() => {});
      void loadProducts(products.length > 0);
    }, [api, loadProducts]),
  );

  const resetFilters = () => {
    setQuery("");
    setSelectedCategory("All");
    setStockStatus("all");
  };

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <DemoBanner
        title="Inventory"
        subtitle={`${products.length} matching ${products.length === 1 ? "product" : "products"}`}
      />

      {/* Search & Filter Controls */}
      <View
        style={[
          styles.controls,
          {
            backgroundColor: colors.background,
            paddingHorizontal: spacing.base,
            paddingTop: spacing.md,
            paddingBottom: spacing.sm,
            gap: spacing.sm + 2,
          },
        ]}
      >
        <View style={styles.searchActionRow}>
          <View style={{ flex: 1 }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, category, or barcode..."
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
            title="Add"
            leftIcon={<Plus size={16} color="#FFFFFF" />}
            onPress={() => router.push("/product/new")}
          />
          <Button
            variant="outline"
            size="icon"
            style={{ height: 44, width: 44 }}
            accessibilityLabel="Import products from Excel or CSV"
            leftIcon={<FileSpreadsheet size={18} color={colors.foreground} />}
            onPress={() =>
              router.push({
                pathname: "/product/new",
                params: { mode: "import" },
              })
            }
          />
        </View>

        <SegmentedTabs
          options={STOCK_FILTER_OPTIONS}
          value={stockStatus}
          onChange={setStockStatus}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={({ pressed }) => [
                  styles.catChip,
                  {
                    borderRadius: radii.full,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primaryTint : colors.card,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs + 2,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.caption,
                    {
                      fontFamily: active
                        ? fontFamilies.semibold
                        : fontFamilies.medium,
                      color: active ? colors.primary : colors.mutedForeground,
                    },
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading && products.length === 0 ? (
        <LoadingState message="Loading product catalog..." />
      ) : (
        <FlatList
          data={products}
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
              onRefresh={() => void loadProducts(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() =>
                router.push({
                  pathname: "/product/[id]",
                  params: { id: item.id },
                })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Package size={36} color={colors.mutedForeground} />}
              title="No products found"
              description="No products match your search query or stock filter. Adjust filters to see more items."
              action={
                <Button
                  title="Reset filters"
                  variant="outline"
                  size="sm"
                  onPress={resetFilters}
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
  controls: {
    width: "100%",
  },
  searchActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catChip: {
    borderWidth: 1,
  },
});
