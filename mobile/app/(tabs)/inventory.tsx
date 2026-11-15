import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  Minus,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { LowStockToast } from "@/components/LowStockToast";
import { ProductCard } from "@/components/ProductCard";
import { Button, Card, Input, SegmentedTabs } from "@/components/ui";
import { useTheme } from "@/theme";
import {
  LOW_STOCK_THRESHOLD,
  type ProductItem,
  type StockStatusFilter,
} from "@/types/domain";

const THRESHOLD_PRESETS = [3, 5, 10, 15, 25] as const;

export default function InventoryScreen() {
  const params = useLocalSearchParams<{ stock?: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { store, updateStockThreshold } = useAuth();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const storeThreshold = store?.stockAlertThreshold || LOW_STOCK_THRESHOLD;

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>(
    params.stock === "low_stock" ||
      params.stock === "out_of_stock" ||
      params.stock === "in_stock"
      ? params.stock
      : "all",
  );

  // Configurable low-stock threshold (persisted to SQLite settings)
  const [threshold, setThreshold] = useState<number>(storeThreshold);
  const [thresholdInput, setThresholdInput] = useState<string>(
    String(storeThreshold),
  );
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Low-stock toast state
  const [toastVisible, setToastVisible] = useState(false);
  const toastDismissedManuallyRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [catalogForCounts, setCatalogForCounts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sync local threshold if store profile refreshes
  useEffect(() => {
    setThreshold(storeThreshold);
    setThresholdInput(String(storeThreshold));
  }, [storeThreshold]);

  useEffect(() => {
    if (
      params.stock === "low_stock" ||
      params.stock === "out_of_stock" ||
      params.stock === "in_stock" ||
      params.stock === "all"
    ) {
      setStockStatus(params.stock);
    }
  }, [params.stock]);

  useEffect(() => {
    void api.getCategories().then(setCategories).catch(() => {});
  }, [api]);

  const showLowStockToast = useCallback((force = false) => {
    if (toastDismissedManuallyRef.current && !force) {
      return;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 7000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const loadProducts = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [filtered, allForQuery] = await Promise.all([
          api.getProducts({
            query,
            category: selectedCategory,
            stockStatus,
            threshold,
          }),
          stockStatus === "all"
            ? Promise.resolve(null)
            : api.getProducts({
                query,
                category: selectedCategory,
                threshold,
              }),
        ]);
        setProducts(filtered);
        setCatalogForCounts(allForQuery ?? filtered);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, query, selectedCategory, stockStatus, threshold],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProducts();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      void api.getCategories().then(setCategories).catch(() => {});
      void loadProducts(products.length > 0);
    }, [api, loadProducts]),
  );

  const counts = useMemo(() => {
    let low = 0;
    let out = 0;
    let inStock = 0;
    for (const item of catalogForCounts) {
      if (item.stockQuantity <= 0) {
        out += 1;
      } else if (item.stockQuantity < threshold) {
        low += 1;
      } else {
        inStock += 1;
      }
    }
    return {
      all: catalogForCounts.length,
      inStock,
      low,
      out,
      flagged: low + out,
    };
  }, [catalogForCounts, threshold]);

  // Show the Low Stock toast automatically when items are below the configured threshold
  useEffect(() => {
    if (!loading && counts.flagged > 0 && stockStatus === "all") {
      showLowStockToast(false);
    } else if (counts.flagged === 0) {
      setToastVisible(false);
    }
  }, [loading, counts.flagged, stockStatus, showLowStockToast]);

  const stockFilterOptions = useMemo<
    { value: StockStatusFilter; label: string }[]
  >(
    () => [
      { value: "all", label: "All" },
      { value: "in_stock", label: "In Stock" },
      { value: "low_stock", label: `Low (${counts.low})` },
      { value: "out_of_stock", label: `Out (${counts.out})` },
    ],
    [counts.low, counts.out],
  );

  const applyNewThreshold = async (nextValue: number) => {
    const clean = Math.trunc(nextValue);
    if (!Number.isFinite(clean) || clean < 1 || clean > 9999) {
      setThresholdError("Enter a whole number between 1 and 9,999.");
      return;
    }

    setThresholdError(null);
    setThreshold(clean);
    setThresholdInput(String(clean));
    toastDismissedManuallyRef.current = false;

    setSavingThreshold(true);
    try {
      await updateStockThreshold(clean);
      showLowStockToast(true);
    } catch (err) {
      setThresholdError(
        err instanceof Error ? err.message : "Failed to save threshold.",
      );
    } finally {
      setSavingThreshold(false);
    }
  };

  const handleApplyInputThreshold = () => {
    const parsed = Number.parseInt(thresholdInput.trim(), 10);
    if (Number.isNaN(parsed)) {
      setThresholdError("Enter a valid numeric threshold.");
      return;
    }
    void applyNewThreshold(parsed);
  };

  const handleJumpToLowStock = () => {
    if (counts.low > 0) {
      setStockStatus("low_stock");
    } else if (counts.out > 0) {
      setStockStatus("out_of_stock");
    } else {
      setStockStatus("low_stock");
    }
    setToastVisible(false);
  };

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
        subtitle={`${products.length} matching ${products.length === 1 ? "product" : "products"} · Alert < ${threshold} units`}
      />

      {/* Search, Threshold & Filter Controls */}
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
          options={stockFilterOptions}
          value={stockStatus}
          onChange={setStockStatus}
        />

        {/* Low-Stock Status & Configurable Threshold Bar */}
        <View
          style={[
            styles.thresholdBar,
            {
              backgroundColor: colors.card,
              borderColor:
                counts.flagged > 0 ? colors.warningBorder : colors.border,
              borderRadius: radii.xl,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs + 3,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              if (counts.flagged > 0) {
                if (stockStatus === "low_stock" || stockStatus === "out_of_stock") {
                  setStockStatus("all");
                } else {
                  handleJumpToLowStock();
                }
              } else {
                setShowThresholdConfig((v) => !v);
              }
            }}
            style={styles.thresholdSummaryPress}
          >
            <AlertTriangle
              size={15}
              color={counts.flagged > 0 ? colors.warningText : colors.successText}
            />
            <Text
              numberOfLines={1}
              style={[
                typography.caption,
                typography.tabular,
                { color: colors.foreground, flex: 1 },
              ]}
            >
              {counts.flagged > 0
                ? `${counts.flagged} below ${threshold} units (${counts.low} low · ${counts.out} out)`
                : `All items stocked ≥ ${threshold} units`}
            </Text>
          </Pressable>

          {counts.flagged > 0 ? (
            <Pressable
              onPress={() => {
                if (
                  stockStatus === "low_stock" ||
                  stockStatus === "out_of_stock"
                ) {
                  setStockStatus("all");
                } else {
                  handleJumpToLowStock();
                }
              }}
              style={({ pressed }) => [
                styles.quickFilterPill,
                {
                  backgroundColor:
                    stockStatus === "low_stock" ||
                    stockStatus === "out_of_stock"
                      ? colors.warning
                      : colors.warningTint,
                  borderColor: colors.warningBorder,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xxs + 2,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[
                  typography.micro,
                  {
                    color:
                      stockStatus === "low_stock" ||
                      stockStatus === "out_of_stock"
                        ? "#FFFFFF"
                        : colors.warningText,
                  },
                ]}
              >
                {stockStatus === "low_stock" || stockStatus === "out_of_stock"
                  ? "Show All"
                  : counts.low > 0
                    ? "Low Stock"
                    : "Out of Stock"}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setShowThresholdConfig((v) => !v)}
            accessibilityLabel="Configure low stock threshold"
            style={({ pressed }) => [
              styles.configToggleBtn,
              {
                backgroundColor: showThresholdConfig
                  ? colors.primaryTint
                  : colors.muted,
                borderColor: showThresholdConfig
                  ? colors.primary
                  : colors.border,
                borderRadius: radii.md,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xxs + 2,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <SlidersHorizontal
              size={12}
              color={
                showThresholdConfig ? colors.primary : colors.mutedForeground
              }
            />
            <Text
              style={[
                typography.micro,
                typography.tabular,
                {
                  color: showThresholdConfig
                    ? colors.primary
                    : colors.foreground,
                },
              ]}
            >
              &lt; {threshold}
            </Text>
          </Pressable>
        </View>

        {/* Expandable Configurable Threshold Card */}
        {showThresholdConfig ? (
          <Card>
            <View style={{ padding: spacing.md, gap: spacing.sm + 2 }}>
              <View style={styles.configHeader}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      { color: colors.foreground },
                    ]}
                  >
                    Configurable Low-Stock Threshold
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Highlights and filters items with stock below this count
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowThresholdConfig(false)}
                  hitSlop={8}
                  accessibilityLabel="Close threshold settings"
                >
                  <X size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <View style={styles.stepperRow}>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={savingThreshold || threshold <= 1}
                  accessibilityLabel="Decrease threshold"
                  leftIcon={<Minus size={16} color={colors.foreground} />}
                  onPress={() => void applyNewThreshold(Math.max(1, threshold - 1))}
                />

                <View style={{ flex: 1 }}>
                  <Input
                    value={thresholdInput}
                    onChangeText={(txt) => {
                      setThresholdInput(txt.replace(/[^0-9]/g, ""));
                      setThresholdError(null);
                    }}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleApplyInputThreshold}
                    placeholder="5"
                    style={[typography.tabular, { textAlign: "center" }]}
                  />
                </View>

                <Button
                  variant="outline"
                  size="icon"
                  disabled={savingThreshold}
                  accessibilityLabel="Increase threshold"
                  leftIcon={<Plus size={16} color={colors.foreground} />}
                  onPress={() => void applyNewThreshold(threshold + 1)}
                />

                <Button
                  title="Apply"
                  size="sm"
                  loading={savingThreshold}
                  leftIcon={<Check size={14} color="#FFFFFF" />}
                  onPress={handleApplyInputThreshold}
                />
              </View>

              <View style={styles.presetRow}>
                {THRESHOLD_PRESETS.map((preset) => {
                  const active = threshold === preset;
                  return (
                    <Pressable
                      key={preset}
                      onPress={() => void applyNewThreshold(preset)}
                      style={({ pressed }) => [
                        styles.presetChip,
                        {
                          borderRadius: radii.full,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active
                            ? colors.primaryTint
                            : colors.muted,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.xs + 1,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.caption,
                          typography.tabular,
                          {
                            fontFamily: active
                              ? fontFamilies.semibold
                              : fontFamilies.medium,
                            color: active
                              ? colors.primary
                              : colors.mutedForeground,
                          },
                        ]}
                      >
                        &lt; {preset}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {thresholdError ? (
                <Text
                  style={[typography.caption, { color: colors.dangerText }]}
                >
                  {thresholdError}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

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
            paddingBottom: toastVisible ? 92 : spacing["2xl"],
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                toastDismissedManuallyRef.current = false;
                void loadProducts(true);
              }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              alertThreshold={threshold}
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
              description={
                stockStatus === "low_stock"
                  ? `No products currently have between 1 and ${threshold - 1} units in stock.`
                  : "No products match your search query or stock filter. Adjust filters or threshold to see more items."
              }
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

      <LowStockToast
        visible={toastVisible && counts.flagged > 0}
        lowCount={counts.low}
        outCount={counts.out}
        threshold={threshold}
        isFiltered={stockStatus === "low_stock" || stockStatus === "out_of_stock"}
        onFilterLowStock={handleJumpToLowStock}
        onDismiss={() => {
          toastDismissedManuallyRef.current = true;
          setToastVisible(false);
        }}
      />
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
  thresholdBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  thresholdSummaryPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  quickFilterPill: {
    borderWidth: 1,
  },
  configToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
  },
  configHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    borderWidth: 1,
  },
  catChip: {
    borderWidth: 1,
  },
});
