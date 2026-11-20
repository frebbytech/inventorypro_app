import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  AlertCircle,
  Edit3,
  FolderKanban,
  Layers,
  Plus,
  Power,
  Search,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { useTheme } from "@/theme";
import type { CategoryItem } from "@/types/domain";
import { formatDateTime } from "@/utils/formatters";

export default function CategoriesManagerScreen() {
  const { theme } = useTheme();
  const api = useApiClient();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(
    null,
  );
  const [nameInput, setNameInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [activeInput, setActiveInput] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadCategories = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setActionError(null);
      try {
        const list = await api.getCategoryDetails(query);
        setCategories(list);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to load categories.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, query],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCategories();
    }, 100);
    return () => clearTimeout(timer);
  }, [loadCategories]);

  useFocusEffect(
    useCallback(() => {
      void loadCategories(categories.length > 0);
    }, [loadCategories]),
  );

  const stats = useMemo(() => {
    const activeCount = categories.filter((c) => c.isActive).length;
    const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0);
    return {
      total: categories.length,
      activeCount,
      totalProducts,
    };
  }, [categories]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setNameInput("");
    setDescInput("");
    setActiveInput(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: CategoryItem) => {
    setEditingCategory(item);
    setNameInput(item.name);
    setDescInput(item.description);
    setActiveInput(item.isActive);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveModal = async () => {
    const cleanName = nameInput.trim();
    if (!cleanName) {
      setFormError("Category name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, {
          name: cleanName,
          description: descInput.trim(),
          isActive: activeInput,
        });
        toast.success("Category updated", `${cleanName} changes saved.`);
      } else {
        await api.createCategory({
          name: cleanName,
          description: descInput.trim(),
          isActive: activeInput,
        });
        toast.success("Category created", `${cleanName} added to catalog.`);
      }
      setModalOpen(false);
      await loadCategories(true);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save category.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: CategoryItem) => {
    setActionError(null);
    try {
      const updated = await api.updateCategory(item.id, {
        isActive: !item.isActive,
      });
      setCategories((prev) =>
        prev.map((c) => (c.id === item.id ? updated : c)),
      );
      toast.success(
        updated.isActive ? "Category activated" : "Category disabled",
        `${updated.name} status updated.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update category status.";
      setActionError(msg);
      toast.error("Category update failed", msg);
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
              placeholder="Search categories..."
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
            title="New"
            leftIcon={<Plus size={16} color="#FFFFFF" />}
            onPress={openCreateModal}
          />
        </View>

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
            <FolderKanban size={15} color={colors.primary} />
            <Text
              style={[
                typography.caption,
                typography.tabular,
                { color: colors.foreground },
              ]}
            >
              {stats.total} {stats.total === 1 ? "category" : "categories"} ·{" "}
              {stats.activeCount} active
            </Text>
          </View>
          <Text
            style={[
              typography.caption,
              typography.tabular,
              { color: colors.mutedForeground },
            ]}
          >
            {stats.totalProducts} products
          </Text>
        </View>

        {actionError ? (
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
            <Text style={[typography.caption, { color: colors.dangerText, flex: 1 }]}>
              {actionError}
            </Text>
          </View>
        ) : null}
      </View>

      {loading && categories.length === 0 ? (
        <LoadingState message="Loading product categories..." />
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: spacing.base,
            paddingTop: spacing.xs,
            gap: spacing.md,
            paddingBottom: spacing["3xl"],
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadCategories(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <Card>
              <View style={{ padding: spacing.base, gap: spacing.sm + 2 }}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.titleBlock}>
                    <View
                      style={[
                        styles.iconCircle,
                        {
                          backgroundColor: item.isActive
                            ? colors.primaryTint
                            : colors.muted,
                          borderRadius: radii.lg,
                        },
                      ]}
                    >
                      <Layers
                        size={18}
                        color={
                          item.isActive ? colors.primary : colors.mutedForeground
                        }
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[typography.subtitle, { color: colors.foreground }]}
                      >
                        {item.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.caption,
                          typography.tabular,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {item.productCount}{" "}
                        {item.productCount === 1 ? "product" : "products"} ·{" "}
                        {item.totalUnits} units in stock
                      </Text>
                    </View>
                  </View>

                  <Badge
                    label={item.isActive ? "Active" : "Inactive"}
                    variant={item.isActive ? "success" : "danger"}
                  />
                </View>

                {item.description ? (
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {item.description}
                  </Text>
                ) : null}

                <View
                  style={[
                    styles.cardFooterRow,
                    {
                      borderTopColor: colors.border,
                      paddingTop: spacing.sm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.micro,
                      { color: colors.mutedForeground, flex: 1 },
                    ]}
                  >
                    Updated {formatDateTime(item.updatedAt)}
                  </Text>

                  <Button
                    title="Edit"
                    variant="outline"
                    size="sm"
                    leftIcon={<Edit3 size={13} color={colors.foreground} />}
                    onPress={() => openEditModal(item)}
                  />
                  <Button
                    title={item.isActive ? "Disable" : "Enable"}
                    variant={item.isActive ? "secondary" : "default"}
                    size="sm"
                    leftIcon={
                      <Power
                        size={13}
                        color={item.isActive ? colors.foreground : "#FFFFFF"}
                      />
                    }
                    onPress={() => void handleToggleActive(item)}
                  />
                </View>
              </View>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Layers size={36} color={colors.mutedForeground} />}
              title="No categories found"
              description={
                query
                  ? `No categories match "${query}".`
                  : "Create product categories to organize your inventory catalog."
              }
              action={
                query ? (
                  <Button
                    title="Clear search"
                    variant="outline"
                    size="sm"
                    onPress={() => setQuery("")}
                  />
                ) : (
                  <Button
                    title="Create Category"
                    size="sm"
                    leftIcon={<Plus size={14} color="#FFFFFF" />}
                    onPress={openCreateModal}
                  />
                )
              }
            />
          }
        />
      )}

      {/* Add / Edit Category Modal */}
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
                {editingCategory ? "Edit Category" : "New Category"}
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
                Category Name *
              </Text>
              <Input
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="e.g. Beverages, Electronics, Frozen Foods"
                autoCapitalize="words"
                autoFocus
              />
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Description
              </Text>
              <Input
                value={descInput}
                onChangeText={setDescInput}
                placeholder="Optional notes about items in this category..."
                multiline
                numberOfLines={3}
                containerStyle={{
                  height: 76,
                  alignItems: "flex-start",
                  paddingVertical: 10,
                }}
                style={{ textAlignVertical: "top" }}
              />
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Status
              </Text>
              <View style={styles.rowTwoCol}>
                <Pressable
                  onPress={() => setActiveInput(true)}
                  style={[
                    styles.statusBtn,
                    {
                      borderRadius: radii.lg,
                      borderColor: activeInput ? colors.primary : colors.border,
                      backgroundColor: activeInput
                        ? colors.primaryTint
                        : colors.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        fontFamily: fontFamilies.semibold,
                        color: activeInput
                          ? colors.primary
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    Active
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveInput(false)}
                  style={[
                    styles.statusBtn,
                    {
                      borderRadius: radii.lg,
                      borderColor: !activeInput
                        ? colors.dangerBorder
                        : colors.border,
                      backgroundColor: !activeInput
                        ? colors.dangerTint
                        : colors.background,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        fontFamily: fontFamilies.semibold,
                        color: !activeInput
                          ? colors.dangerText
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    Inactive
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => setModalOpen(false)}
              />
              <Button
                title={editingCategory ? "Update" : "Create"}
                loading={saving}
                style={{ flex: 1 }}
                onPress={() => void handleSaveModal()}
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
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  iconCircle: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTwoCol: {
    flexDirection: "row",
    gap: 10,
  },
  statusBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});
