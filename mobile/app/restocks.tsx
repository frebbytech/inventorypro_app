import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronRight,
  ClipboardList,
  PackagePlus,
  Plus,
  Search,
  User,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { EmptyState } from "@/components/EmptyState";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
import { LoadingState } from "@/components/LoadingState";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { useTheme } from "@/theme";
import type { ProductItem, RestockLogItem } from "@/types/domain";
import {
  getUserErrorMessage,
  normalizeError,
  type NormalizedAppError,
} from "@/utils/errorHandler";
import { formatDateTime } from "@/utils/formatters";

const QUICK_QTY_PRESETS = [5, 10, 25, 50] as const;

export default function RestocksHistoryScreen() {
  const params = useLocalSearchParams<{
    productId?: string;
    productName?: string;
  }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [filterProductId, setFilterProductId] = useState<string | undefined>(
    params.productId ? String(params.productId) : undefined,
  );
  const [filterProductName, setFilterProductName] = useState<string | undefined>(
    params.productName ? String(params.productName) : undefined,
  );

  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<RestockLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<NormalizedAppError | null>(null);

  // Record restock modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qtyText, setQtyText] = useState("10");
  const [restockDate, setRestockDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notesInput, setNotesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setFilterProductId(params.productId ? String(params.productId) : undefined);
    setFilterProductName(
      params.productName ? String(params.productName) : undefined,
    );
  }, [params.productId, params.productName]);

  const loadLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const list = await api.getRestockLogs({
          query,
          productId: filterProductId,
          limit: 120,
        });
        setLogs(list);
      } catch (err) {
        setLoadError(
          normalizeError(err, {
            fallback: "Could not load restock history. Please try again.",
            context: "restocks.loadLogs",
          }),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, query, filterProductId],
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

  const openRestockModal = async () => {
    setFormError(null);
    setQtyText("10");
    setRestockDate(new Date().toISOString().slice(0, 10));
    setNotesInput("");
    setProductSearch("");
    setModalOpen(true);

    try {
      const items = await api.getProducts();
      setCatalogProducts(items);
      if (filterProductId && items.some((p) => p.id === filterProductId)) {
        setSelectedProductId(filterProductId);
      } else if (items.length > 0) {
        setSelectedProductId((prev) =>
          prev && items.some((p) => p.id === prev) ? prev : items[0].id,
        );
      }
    } catch (err) {
      setCatalogProducts([]);
      setFormError(
        getUserErrorMessage(
          err,
          "Could not load product list. Please try again.",
          "restocks.loadProducts",
        ),
      );
    }
  };

  const filteredModalProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return catalogProducts;
    return catalogProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q),
    );
  }, [catalogProducts, productSearch]);

  const summary = useMemo(() => {
    let added = 0;
    let deducted = 0;
    for (const log of logs) {
      if (log.quantity >= 0) added += log.quantity;
      else deducted += Math.abs(log.quantity);
    }
    return {
      count: logs.length,
      added,
      deducted,
    };
  }, [logs]);

  const handleSaveRestock = async () => {
    if (!selectedProductId) {
      setFormError("Select a product to restock.");
      return;
    }

    const quantity = Number.parseInt(qtyText.trim(), 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Enter a positive whole number quantity.");
      return;
    }

    const cleanDate = restockDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      setFormError("Use YYYY-MM-DD format for the restock date.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const created = await api.recordRestock({
        productId: selectedProductId,
        quantity,
        restockDate: cleanDate,
        notes: notesInput.trim() || undefined,
      });
      setModalOpen(false);
      toast.success(
        "Restock recorded",
        `+${quantity} units added for ${created.productName}.`,
      );
      await loadLogs(true);
    } catch (err) {
      setFormError(
        getUserErrorMessage(
          err,
          "Could not record restock. Please try again.",
          "restocks.save",
        ),
      );
    } finally {
      setSaving(false);
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
        <View style={styles.searchActionRow}>
          <View style={{ flex: 1 }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search product, note, or staff..."
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
          </View>
          <Button
            title="Restock"
            leftIcon={<Plus size={16} color="#FFFFFF" />}
            onPress={() => void openRestockModal()}
          />
        </View>

        {filterProductId ? (
          <View
            style={[
              styles.filterChipBar,
              {
                backgroundColor: colors.primaryTint,
                borderColor: colors.demoBannerBorder,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs + 2,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                typography.caption,
                {
                  color: colors.primary,
                  fontFamily: fontFamilies.semibold,
                  flex: 1,
                },
              ]}
            >
              Filtered by: {filterProductName || "Selected product"}
            </Text>
            <Pressable
              onPress={() => {
                setFilterProductId(undefined);
                setFilterProductName(undefined);
              }}
              hitSlop={8}
            >
              <X size={15} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.summaryBar,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radii.xl,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}
        >
          <View style={styles.summaryItem}>
            <ClipboardList size={15} color={colors.primary} />
            <Text
              style={[
                typography.caption,
                typography.tabular,
                { color: colors.foreground },
              ]}
            >
              {summary.count} {summary.count === 1 ? "entry" : "entries"}
            </Text>
          </View>
          <Text
            style={[
              typography.caption,
              typography.tabular,
              { color: colors.successText, fontFamily: fontFamilies.semibold },
            ]}
          >
            +{summary.added} added
            {summary.deducted > 0 ? ` · -${summary.deducted} adj` : ""}
          </Text>
        </View>

        {loadError ? (
          <InlineErrorBanner
            message={loadError.userMessage}
            category={loadError.category}
            onRetry={() => void loadLogs(logs.length > 0)}
            retrying={loading || refreshing}
            onSignIn={
              loadError.requiresSignIn
                ? () => router.push("/sign-in")
                : undefined
            }
            onDismiss={() => setLoadError(null)}
          />
        ) : null}
      </View>

      {loading && logs.length === 0 ? (
        <LoadingState message="Loading restock history..." />
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
            const isPositive = item.quantity >= 0;
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/product/[id]",
                    params: { id: item.productId },
                  })
                }
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Card>
                  <View style={{ padding: spacing.md + 2, gap: 6 }}>
                    <View style={styles.logTopRow}>
                      <View style={styles.logTitleBlock}>
                        <View
                          style={[
                            styles.dirIcon,
                            {
                              backgroundColor: isPositive
                                ? colors.successTint
                                : colors.warningTint,
                              borderRadius: radii.md,
                            },
                          ]}
                        >
                          {isPositive ? (
                            <ArrowUpRight size={15} color={colors.successText} />
                          ) : (
                            <ArrowDownLeft size={15} color={colors.warningText} />
                          )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            numberOfLines={1}
                            style={[
                              typography.bodySemibold,
                              { color: colors.foreground },
                            ]}
                          >
                            {item.productName}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              typography.micro,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {item.categoryName}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.rightBadgeWrap}>
                        <Badge
                          label={`${isPositive ? "+" : ""}${item.quantity} units`}
                          variant={isPositive ? "success" : "warning"}
                        />
                        <ChevronRight size={16} color={colors.mutedForeground} />
                      </View>
                    </View>

                    {item.notes ? (
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.foreground },
                        ]}
                      >
                        {item.notes}
                      </Text>
                    ) : null}

                    <View style={styles.metaFooter}>
                      <View style={styles.metaItem}>
                        <Calendar size={12} color={colors.mutedForeground} />
                        <Text
                          style={[
                            typography.micro,
                            typography.tabular,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {item.restockDate}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <User size={12} color={colors.mutedForeground} />
                        <Text
                          style={[
                            typography.micro,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {item.userName}
                        </Text>
                      </View>
                      <Text
                        style={[
                          typography.micro,
                          { color: colors.mutedForeground, marginLeft: "auto" },
                        ]}
                      >
                        {formatDateTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<PackagePlus size={36} color={colors.mutedForeground} />}
              title="No restock logs found"
              description={
                query || filterProductId
                  ? "No stock movement entries match your current filter."
                  : "Record a supplier delivery or adjust product stock to build a restock history."
              }
              action={
                query || filterProductId ? (
                  <Button
                    title="Show All Restocks"
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      setQuery("");
                      setFilterProductId(undefined);
                      setFilterProductName(undefined);
                    }}
                  />
                ) : (
                  <Button
                    title="Record Restock"
                    size="sm"
                    leftIcon={<Plus size={14} color="#FFFFFF" />}
                    onPress={() => void openRestockModal()}
                  />
                )
              }
            />
          }
        />
      )}

      {/* Record Restock Modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii["2xl"],
                padding: spacing.lg,
                gap: spacing.md,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[typography.titleSm, { color: colors.foreground }]}>
                Record Restock Delivery
              </Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
                <X size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {formError ? (
              <View
                style={[
                  styles.alertBox,
                  {
                    backgroundColor: colors.dangerTint,
                    borderColor: colors.dangerBorder,
                    borderRadius: radii.lg,
                    padding: spacing.sm + 2,
                  },
                ]}
              >
                <AlertCircle size={15} color={colors.dangerText} />
                <Text
                  style={[typography.caption, { color: colors.dangerText, flex: 1 }]}
                >
                  {formError}
                </Text>
              </View>
            ) : null}

            <View style={{ gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Product *
              </Text>
              <Input
                value={productSearch}
                onChangeText={setProductSearch}
                placeholder="Filter product list..."
                autoCapitalize="none"
                leftIcon={<Search size={15} color={colors.mutedForeground} />}
              />
              <ScrollView
                style={[
                  styles.productPickerList,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    borderRadius: radii.lg,
                  },
                ]}
                nestedScrollEnabled
              >
                {filteredModalProducts.length === 0 ? (
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.mutedForeground,
                        padding: spacing.md,
                        textAlign: "center",
                      },
                    ]}
                  >
                    No matching products
                  </Text>
                ) : (
                  filteredModalProducts.map((p) => {
                    const selected = p.id === selectedProductId;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setSelectedProductId(p.id)}
                        style={[
                          styles.pickerItem,
                          {
                            borderBottomColor: colors.border,
                            backgroundColor: selected
                              ? colors.primaryTint
                              : "transparent",
                            paddingHorizontal: spacing.md,
                            paddingVertical: spacing.sm,
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            typography.caption,
                            {
                              flex: 1,
                              color: selected ? colors.primary : colors.foreground,
                              fontFamily: selected
                                ? fontFamilies.semibold
                                : fontFamilies.medium,
                            },
                          ]}
                        >
                          {p.name}
                        </Text>
                        <Text
                          style={[
                            typography.micro,
                            typography.tabular,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {p.stockQuantity} in stock
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>

            <View style={styles.rowTwoCol}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Quantity Added *
                </Text>
                <Input
                  value={qtyText}
                  onChangeText={(txt) => setQtyText(txt.replace(/[^0-9]/g, ""))}
                  placeholder="10"
                  keyboardType="number-pad"
                />
              </View>

              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Restock Date
                </Text>
                <Input
                  value={restockDate}
                  onChangeText={setRestockDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.presetRow}>
              {QUICK_QTY_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => setQtyText(String(preset))}
                  style={[
                    styles.presetChip,
                    {
                      borderRadius: radii.full,
                      borderColor:
                        qtyText === String(preset)
                          ? colors.primary
                          : colors.border,
                      backgroundColor:
                        qtyText === String(preset)
                          ? colors.primaryTint
                          : colors.muted,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      typography.tabular,
                      {
                        color:
                          qtyText === String(preset)
                            ? colors.primary
                            : colors.mutedForeground,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    +{preset}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Supplier / Delivery Notes
              </Text>
              <Input
                value={notesInput}
                onChangeText={setNotesInput}
                placeholder="e.g. Kasapreko distributor invoice #INV-204"
              />
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setModalOpen(false)}
              />
              <Button
                title="Add Stock"
                loading={saving}
                style={{ flex: 1 }}
                onPress={() => void handleSaveRestock()}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterChipBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  logTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  logTitleBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  dirIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  rightBadgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderWidth: 1,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  productPickerList: {
    maxHeight: 140,
    borderWidth: 1,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTwoCol: {
    flexDirection: "row",
    gap: 10,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});
