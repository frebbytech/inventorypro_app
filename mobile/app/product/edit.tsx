import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Barcode,
  FolderPlus,
  Package,
  Save,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { InlineErrorBanner } from "@/components/InlineErrorBanner";
import { LoadingState } from "@/components/LoadingState";
import { LocalProductImagePicker } from "@/components/LocalProductImagePicker";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  useToast,
} from "@/components/ui";
import { useTheme } from "@/theme";
import { LOW_STOCK_THRESHOLD } from "@/types/domain";
import {
  normalizeError,
  type NormalizedAppError,
} from "@/utils/errorHandler";
import { formatCurrency } from "@/utils/formatters";
import { isLocalDeviceImageUri } from "@/utils/productImage";

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { workspaceMode } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [barcode, setBarcode] = useState("");
  const [costPriceText, setCostPriceText] = useState("");
  const [unitPriceText, setUnitPriceText] = useState("");
  const [thresholdText, setThresholdText] = useState(String(LOW_STOCK_THRESHOLD));
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");
  const [currentStock, setCurrentStock] = useState(0);

  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<NormalizedAppError | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) {
        if (active) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const [detail, cats] = await Promise.all([
          api.getProductById(String(id)),
          api.getCategories(),
        ]);

        if (!active) return;

        const cleanCats = cats.filter((c) => c !== "All");
        setExistingCategories(cleanCats);

        if (!detail) {
          setNotFound(true);
          return;
        }

        const p = detail.product;
        setName(p.name);
        setPhotoUrl(p.photoUrl || "");
        setSelectedCategory(p.categoryName);
        if (
          p.categoryName &&
          !cleanCats.some((c) => c.toLowerCase() === p.categoryName.toLowerCase())
        ) {
          setExistingCategories((prev) => [...prev, p.categoryName].sort());
        }
        setBarcode(p.barcode);
        setCostPriceText(String(p.costPrice));
        setUnitPriceText(String(p.unitPrice));
        setThresholdText(String(p.lowStockThreshold || LOW_STOCK_THRESHOLD));
        setIsActive(p.active);
        setDescription(p.description || "");
        setCurrentStock(p.stockQuantity);
      } catch (err) {
        if (active) {
          setLoadError(
            normalizeError(err, {
              fallback: "Could not load this product for editing.",
              context: "product-edit.load",
            }),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [api, id]);

  const effectiveCategory = useMemo(() => {
    const custom = customCategory.trim();
    if (custom) return custom;
    return selectedCategory.trim() || "General";
  }, [customCategory, selectedCategory]);

  const marginPreview = useMemo(() => {
    const cost = Number.parseFloat(costPriceText);
    const sell = Number.parseFloat(unitPriceText);
    if (!Number.isFinite(cost) || !Number.isFinite(sell) || sell <= 0) {
      return null;
    }
    const profit = sell - cost;
    const pct = (profit / sell) * 100;
    return { profit, pct };
  }, [costPriceText, unitPriceText]);

  const handleGenerateBarcode = () => {
    const prefix = "603";
    const body = String(Math.floor(100000000 + Math.random() * 900000000));
    const check = String(Math.floor(Math.random() * 10));
    setBarcode(`${prefix}${body}${check}`);
  };

  const handleSave = async () => {
    if (!id || saving) return;

    const cleanName = name.trim();
    if (!cleanName) {
      setError("Product name is required.");
      return;
    }

    const costPrice = costPriceText.trim() ? Number.parseFloat(costPriceText) : 0;
    const unitPrice = unitPriceText.trim() ? Number.parseFloat(unitPriceText) : NaN;
    const lowStockThreshold = thresholdText.trim()
      ? Number.parseInt(thresholdText, 10)
      : LOW_STOCK_THRESHOLD;

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      setError("Enter a valid cost price (0 or greater).");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Enter a valid selling price (0 or greater).");
      return;
    }
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 1) {
      setError("Low-stock alert threshold must be at least 1.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProduct(String(id), {
        name: cleanName,
        categoryName: effectiveCategory,
        barcode: barcode.trim(),
        photoUrl: photoUrl.trim(),
        description: description.trim(),
        costPrice,
        unitPrice,
        lowStockThreshold,
        active: isActive,
      });
      if (
        workspaceMode === "synced" &&
        isLocalDeviceImageUri(updated.photoUrl)
      ) {
        toast.info(
          "Saved offline with local photo",
          `${cleanName} and its photo will upload automatically when synced.`,
        );
      } else {
        toast.success("Product updated", `${cleanName} changes saved.`);
      }
      router.back();
    } catch (err) {
      const normalized = normalizeError(err, {
        fallback: "Could not save product changes right now. Please try again.",
        context: "product-edit.save",
      });
      setError(normalized.userMessage);
      toast.error(
        "Could not update product",
        normalized.userMessage,
        undefined,
        normalized.requiresSignIn
          ? { label: "Sign In", onPress: () => router.replace("/sign-in") }
          : normalized.retryable
            ? { label: "Retry", onPress: () => void handleSave() }
            : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading product for editing..." />;
  }

  if (loadError) {
    return (
      <View
        style={[
          styles.notFoundWrap,
          { backgroundColor: colors.background, padding: spacing.base },
        ]}
      >
        <InlineErrorBanner
          message={loadError.userMessage}
          category={loadError.category}
          onRetry={() => router.back()}
          retryLabel="Go Back"
          onSignIn={
            loadError.requiresSignIn
              ? () => router.replace("/sign-in")
              : undefined
          }
        />
      </View>
    );
  }

  if (notFound) {
    return (
      <View
        style={[
          styles.notFoundWrap,
          { backgroundColor: colors.background, padding: spacing.base },
        ]}
      >
        <EmptyState
          icon={<Package size={36} color={colors.mutedForeground} />}
          title="Product not found"
          description="This item could not be found in the SQLite product catalog."
          action={
            <Button
              title="Go Back"
              variant="outline"
              size="sm"
              onPress={() => router.back()}
            />
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: spacing.base,
          gap: spacing.base,
          paddingBottom: spacing["3xl"],
        }}
      >
        {error ? (
          <View
            style={[
              styles.alertBox,
              {
                backgroundColor: colors.dangerTint,
                borderColor: colors.dangerBorder,
                borderRadius: radii.lg,
                padding: spacing.md,
              },
            ]}
          >
            <AlertCircle size={16} color={colors.dangerText} />
            <Text style={[typography.caption, { color: colors.dangerText, flex: 1 }]}>
              {error}
            </Text>
          </View>
        ) : null}

        <Card>
          <CardHeader bordered>
            <View style={styles.cardTitleRow}>
              <Package size={16} color={colors.primary} />
              <CardTitle>Edit product details</CardTitle>
            </View>
          </CardHeader>

          <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Product Name *
              </Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Product name"
                autoCapitalize="words"
              />
            </View>

            <LocalProductImagePicker
              value={photoUrl}
              onChange={setPhotoUrl}
            />

            <View style={{ gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Category
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.xs + 2, paddingVertical: 2 }}
              >
                {existingCategories.map((cat) => {
                  const active =
                    !customCategory.trim() &&
                    selectedCategory.toLowerCase() === cat.toLowerCase();
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => {
                        setSelectedCategory(cat);
                        setCustomCategory("");
                      }}
                      style={[
                        styles.chip,
                        {
                          borderRadius: radii.full,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active
                            ? colors.primaryTint
                            : colors.muted,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.xs + 2,
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
                            color: active
                              ? colors.primary
                              : colors.mutedForeground,
                          },
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Input
                value={customCategory}
                onChangeText={setCustomCategory}
                placeholder="Or enter a new category name..."
                leftIcon={<FolderPlus size={16} color={colors.mutedForeground} />}
                autoCapitalize="words"
              />
            </View>

            <View style={{ gap: spacing.xs }}>
              <View style={styles.labelWithAction}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Barcode / SKU
                </Text>
                <Pressable onPress={handleGenerateBarcode} hitSlop={8}>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.primary, fontFamily: fontFamilies.semibold },
                    ]}
                  >
                    Generate SKU
                  </Text>
                </Pressable>
              </View>
              <Input
                value={barcode}
                onChangeText={setBarcode}
                placeholder="Scan or enter EAN / UPC / Code 128"
                autoCapitalize="none"
                autoCorrect={false}
                leftIcon={<Barcode size={17} color={colors.mutedForeground} />}
              />
            </View>

            <View style={styles.rowTwoCol}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Cost Price (GHS)
                </Text>
                <Input
                  value={costPriceText}
                  onChangeText={setCostPriceText}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Selling Price (GHS) *
                </Text>
                <Input
                  value={unitPriceText}
                  onChangeText={setUnitPriceText}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {marginPreview ? (
              <View
                style={[
                  styles.marginStrip,
                  {
                    backgroundColor: colors.muted,
                    borderRadius: radii.lg,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs + 3,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                  Unit profit margin
                </Text>
                <Text
                  style={[
                    typography.caption,
                    typography.tabular,
                    {
                      fontFamily: fontFamilies.semibold,
                      color:
                        marginPreview.profit >= 0
                          ? colors.successText
                          : colors.dangerText,
                    },
                  ]}
                >
                  {formatCurrency(marginPreview.profit)} ({marginPreview.pct.toFixed(1)}%)
                </Text>
              </View>
            ) : null}

            <View style={styles.rowTwoCol}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                <Text
                  style={[
                    typography.caption,
                    { color: colors.foreground, fontFamily: fontFamilies.semibold },
                  ]}
                >
                  Low Stock Alert
                </Text>
                <Input
                  value={thresholdText}
                  onChangeText={setThresholdText}
                  placeholder="5"
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
                  Current Stock
                </Text>
                <View
                  style={[
                    styles.readonlyBox,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      borderRadius: radii.lg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.bodySemibold,
                      typography.tabular,
                      { color: colors.foreground },
                    ]}
                  >
                    {currentStock} units
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Catalog Status
              </Text>
              <View style={styles.rowTwoCol}>
                <Pressable
                  onPress={() => setIsActive(true)}
                  style={[
                    styles.statusBtn,
                    {
                      borderRadius: radii.lg,
                      borderColor: isActive ? colors.primary : colors.border,
                      backgroundColor: isActive ? colors.primaryTint : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        fontFamily: fontFamilies.semibold,
                        color: isActive ? colors.primary : colors.mutedForeground,
                      },
                    ]}
                  >
                    Active (Sellable)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsActive(false)}
                  style={[
                    styles.statusBtn,
                    {
                      borderRadius: radii.lg,
                      borderColor: !isActive ? colors.dangerBorder : colors.border,
                      backgroundColor: !isActive ? colors.dangerTint : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        fontFamily: fontFamilies.semibold,
                        color: !isActive ? colors.dangerText : colors.mutedForeground,
                      },
                    ]}
                  >
                    Disabled (Hidden)
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text
                style={[
                  typography.caption,
                  { color: colors.foreground, fontFamily: fontFamilies.semibold },
                ]}
              >
                Description / Notes
              </Text>
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="Pack size, supplier notes, or shelf location..."
                multiline
                numberOfLines={3}
                containerStyle={{
                  height: 84,
                  alignItems: "flex-start",
                  paddingVertical: 10,
                }}
                style={{ textAlignVertical: "top" }}
              />
            </View>
          </CardContent>

          <CardFooter style={{ gap: spacing.sm }}>
            <Button
              title="Save Changes"
              size="lg"
              loading={saving}
              leftIcon={<Save size={17} color="#FFFFFF" />}
              onPress={() => void handleSave()}
            />
          </CardFooter>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  notFoundWrap: {
    flex: 1,
    justifyContent: "center",
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
  },
  labelWithAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTwoCol: {
    flexDirection: "row",
    gap: 10,
  },
  marginStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  readonlyBox: {
    height: 44,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  statusBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
