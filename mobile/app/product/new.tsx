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
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Barcode,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FolderPlus,
  Layers,
  PackagePlus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { LocalProductImagePicker } from "@/components/LocalProductImagePicker";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  SegmentedTabs,
  useToast,
} from "@/components/ui";
import { useTheme } from "@/theme";
import { LOW_STOCK_THRESHOLD } from "@/types/domain";
import { formatCurrency } from "@/utils/formatters";
import { isLocalDeviceImageUri } from "@/utils/productImage";
import {
  buildProductTemplateCsv,
  parseCsvTextToProducts,
  parsePickedSpreadsheetAsset,
  shareOrDownloadProductTemplate,
  type ParsedSpreadsheetResult,
} from "@/utils/productImport";

type AddMode = "manual" | "import";

const MODE_OPTIONS: { value: AddMode; label: string }[] = [
  { value: "manual", label: "Manual Entry" },
  { value: "import", label: "Upload Excel / CSV" },
];

export default function NewProductScreen() {
  const params = useLocalSearchParams<{ mode?: string; barcode?: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { workspaceMode } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const initialMode: AddMode = params.mode === "import" ? "import" : "manual";
  const [mode, setMode] = useState<AddMode>(initialMode);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);

  // Manual Entry State
  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [barcode, setBarcode] = useState(params.barcode ? String(params.barcode) : "");
  const [costPriceText, setCostPriceText] = useState("");
  const [unitPriceText, setUnitPriceText] = useState("");
  const [stockText, setStockText] = useState("0");
  const [thresholdText, setThresholdText] = useState(String(LOW_STOCK_THRESHOLD));
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);

  // Import State
  const [pickingFile, setPickingFile] = useState(false);
  const [showPasteCsv, setShowPasteCsv] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [parsedImport, setParsedImport] = useState<ParsedSpreadsheetResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<{
    createdCount: number;
    newCategoriesCount: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void api
      .getCategories()
      .then((cats) => {
        if (!active) return;
        const clean = cats.filter((c) => c !== "All");
        setExistingCategories(clean);
        if (clean.length > 0) {
          setSelectedCategory((prev) => prev || clean[0]);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api]);

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
    return {
      profit,
      pct,
    };
  }, [costPriceText, unitPriceText]);

  const handleGenerateBarcode = () => {
    const prefix = "603";
    const body = String(Math.floor(100000000 + Math.random() * 900000000));
    const check = String(Math.floor(Math.random() * 10));
    setBarcode(`${prefix}${body}${check}`);
  };

  const handleSaveManual = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setManualError("Product name is required.");
      return;
    }

    const costPrice = costPriceText.trim() ? Number.parseFloat(costPriceText) : 0;
    const unitPrice = unitPriceText.trim() ? Number.parseFloat(unitPriceText) : NaN;
    const stockQuantity = stockText.trim() ? Number.parseInt(stockText, 10) : 0;
    const lowStockThreshold = thresholdText.trim()
      ? Number.parseInt(thresholdText, 10)
      : LOW_STOCK_THRESHOLD;

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      setManualError("Enter a valid cost price (0 or greater).");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setManualError("Enter a valid selling price (0 or greater).");
      return;
    }
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      setManualError("Opening stock must be 0 or greater.");
      return;
    }
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 1) {
      setManualError("Low-stock alert threshold must be at least 1.");
      return;
    }

    setManualSaving(true);
    setManualError(null);
    setCreatedNotice(null);

    try {
      const created = await api.createProduct({
        name: trimmedName,
        categoryName: effectiveCategory,
        barcode: barcode.trim(),
        photoUrl: photoUrl.trim() || undefined,
        description: description.trim(),
        costPrice,
        unitPrice,
        stockQuantity,
        lowStockThreshold,
        active: isActive,
      });

      if (
        !existingCategories.some(
          (c) => c.toLowerCase() === created.categoryName.toLowerCase(),
        )
      ) {
        setExistingCategories((prev) => [...prev, created.categoryName].sort());
      }

      if (
        workspaceMode === "synced" &&
        isLocalDeviceImageUri(created.photoUrl)
      ) {
        toast.info(
          "Saved offline with local photo",
          `${created.name} and its photo will upload automatically when synced.`,
        );
      } else {
        toast.success("Product created", `${created.name} added to catalog.`);
      }
      router.replace({
        pathname: "/product/[id]",
        params: { id: created.id },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to save product.";
      setManualError(msg);
      toast.error("Could not create product", msg);
    } finally {
      setManualSaving(false);
    }
  };

  const handlePickSpreadsheet = async () => {
    setImportError(null);
    setImportSuccess(null);
    setPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/csv",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "*/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const parsed = await parsePickedSpreadsheetAsset(
        result.assets[0],
        existingCategories,
      );
      setParsedImport(parsed);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to read spreadsheet file.",
      );
    } finally {
      setPickingFile(false);
    }
  };

  const handleParsePastedCsv = () => {
    setImportError(null);
    setImportSuccess(null);
    try {
      const parsed = parseCsvTextToProducts(csvText, existingCategories);
      setParsedImport(parsed);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid CSV format.");
    }
  };

  const handleDownloadTemplate = async () => {
    setImportError(null);
    try {
      await shareOrDownloadProductTemplate();
    } catch (err) {
      // Fallback: populate pasted CSV editor with the sample template
      setCsvText(buildProductTemplateCsv());
      setShowPasteCsv(true);
      setImportError(
        err instanceof Error
          ? `${err.message} Sample CSV loaded into paste box below.`
          : "Sample CSV loaded into paste box below.",
      );
    }
  };

  const handleRemoveImportRow = (localId: string) => {
    setParsedImport((prev) => {
      if (!prev) return null;
      const remaining = prev.validRows.filter((r) => r.localId !== localId);
      if (remaining.length === 0) return null;

      const existingLower = new Set(existingCategories.map((c) => c.toLowerCase()));
      const newCategoryNames: string[] = [];
      const seenNew = new Set<string>();
      for (const row of remaining) {
        const lower = row.input.categoryName.toLowerCase();
        if (!existingLower.has(lower) && !seenNew.has(lower)) {
          seenNew.add(lower);
          newCategoryNames.push(row.input.categoryName);
        }
      }

      return {
        ...prev,
        validRows: remaining,
        newCategoryNames,
      };
    });
  };

  const handleConfirmBulkImport = async () => {
    if (!parsedImport || parsedImport.validRows.length === 0) return;

    setImporting(true);
    setImportError(null);
    try {
      const result = await api.bulkCreateProducts(
        parsedImport.validRows.map((r) => r.input),
      );
      setImportSuccess({
        createdCount: result.createdCount,
        newCategoriesCount: result.newCategoriesCount,
      });
      toast.success(
        "Products imported",
        `${result.createdCount} ${
          result.createdCount === 1 ? "product" : "products"
        } added to catalog.`,
      );
      setParsedImport(null);
      setCsvText("");

      const refreshedCats = await api.getCategories();
      setExistingCategories(refreshedCats.filter((c) => c !== "All"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk import failed.";
      setImportError(msg);
      toast.error("Bulk import failed", msg);
    } finally {
      setImporting(false);
    }
  };

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
        <SegmentedTabs
          options={MODE_OPTIONS}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setManualError(null);
            setImportError(null);
          }}
        />

        {mode === "manual" ? (
          <>
            {manualError ? (
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
                  {manualError}
                </Text>
              </View>
            ) : null}

            {createdNotice ? (
              <View
                style={[
                  styles.alertBox,
                  {
                    backgroundColor: colors.successTint,
                    borderColor: colors.successBorder,
                    borderRadius: radii.lg,
                    padding: spacing.md,
                  },
                ]}
              >
                <CheckCircle2 size={16} color={colors.successText} />
                <Text style={[typography.caption, { color: colors.successText, flex: 1 }]}>
                  {createdNotice}
                </Text>
              </View>
            ) : null}

            <Card>
              <CardHeader bordered>
                <View style={styles.cardTitleRow}>
                  <PackagePlus size={16} color={colors.primary} />
                  <CardTitle>Product details</CardTitle>
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
                    placeholder="e.g. Peak Evaporated Milk 170g"
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
                    placeholder="Or type a new category name..."
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
                      Opening Stock
                    </Text>
                    <Input
                      value={stockText}
                      onChangeText={setStockText}
                      placeholder="0"
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
                      Low Stock Alert
                    </Text>
                    <Input
                      value={thresholdText}
                      onChangeText={setThresholdText}
                      placeholder="5"
                      keyboardType="number-pad"
                    />
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
                          borderColor: !isActive ? colors.primary : colors.border,
                          backgroundColor: !isActive ? colors.primaryTint : colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.caption,
                          {
                            fontFamily: fontFamilies.semibold,
                            color: !isActive ? colors.primary : colors.mutedForeground,
                          },
                        ]}
                      >
                        Inactive (Hidden)
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
                    containerStyle={{ height: 84, alignItems: "flex-start", paddingVertical: 10 }}
                    style={{ textAlignVertical: "top" }}
                  />
                </View>
              </CardContent>

              <CardFooter style={{ gap: spacing.sm }}>
                <Button
                  title={
                    workspaceMode === "synced"
                      ? "Save Product"
                      : "Save Product to SQLite"
                  }
                  size="lg"
                  loading={manualSaving}
                  leftIcon={<PackagePlus size={17} color="#FFFFFF" />}
                  onPress={() => void handleSaveManual()}
                />
              </CardFooter>
            </Card>
          </>
        ) : (
          <>
            {importError ? (
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
                  {importError}
                </Text>
              </View>
            ) : null}

            {importSuccess ? (
              <Card style={{ borderColor: colors.successBorder }}>
                <CardContent style={{ paddingTop: spacing.base, gap: spacing.sm }}>
                  <View style={styles.cardTitleRow}>
                    <CheckCircle2 size={18} color={colors.successText} />
                    <Text
                      style={[
                        typography.bodySemibold,
                        { color: colors.foreground, flex: 1 },
                      ]}
                    >
                      Imported {importSuccess.createdCount}{" "}
                      {importSuccess.createdCount === 1 ? "product" : "products"}
                    </Text>
                  </View>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    Saved directly to on-device SQLite via Drizzle ORM
                    {importSuccess.newCategoriesCount > 0
                      ? ` and created ${importSuccess.newCategoriesCount} new ${
                          importSuccess.newCategoriesCount === 1 ? "category" : "categories"
                        }.`
                      : "."}
                  </Text>
                  <View style={styles.rowTwoCol}>
                    <Button
                      title="View Inventory"
                      style={{ flex: 1 }}
                      onPress={() => router.replace("/(tabs)/inventory")}
                    />
                    <Button
                      title="Import Another"
                      variant="outline"
                      style={{ flex: 1 }}
                      onPress={() => setImportSuccess(null)}
                    />
                  </View>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader bordered>
                <View style={styles.cardTitleRow}>
                  <FileSpreadsheet size={16} color={colors.primary} />
                  <CardTitle>Upload Excel or CSV</CardTitle>
                </View>
              </CardHeader>

              <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
                <View
                  style={[
                    styles.uploadDropBox,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      borderRadius: radii.xl,
                      padding: spacing.base,
                    },
                  ]}
                >
                  <Upload size={26} color={colors.primary} />
                  <Text
                    style={[
                      typography.bodySemibold,
                      { color: colors.foreground, textAlign: "center" },
                    ]}
                  >
                    Select a .xlsx, .xls, or .csv spreadsheet
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground, textAlign: "center" },
                    ]}
                  >
                    Columns: Product Name, Category, Cost Price, Selling Price,
                    Stock Quantity, Barcode, Status, Description
                  </Text>

                  <Button
                    title="Choose Excel or CSV File"
                    size="lg"
                    loading={pickingFile}
                    leftIcon={<Upload size={16} color="#FFFFFF" />}
                    onPress={() => void handlePickSpreadsheet()}
                    style={{ alignSelf: "stretch", marginTop: 4 }}
                  />
                </View>

                <View style={styles.rowTwoCol}>
                  <Button
                    title="Sample CSV"
                    variant="outline"
                    size="sm"
                    style={{ flex: 1 }}
                    leftIcon={<Download size={14} color={colors.foreground} />}
                    onPress={() => void handleDownloadTemplate()}
                  />
                  <Button
                    title={showPasteCsv ? "Hide CSV Box" : "Paste CSV Text"}
                    variant="outline"
                    size="sm"
                    style={{ flex: 1 }}
                    leftIcon={<Sparkles size={14} color={colors.foreground} />}
                    onPress={() => {
                      setShowPasteCsv((v) => !v);
                      if (!csvText.trim()) {
                        setCsvText(buildProductTemplateCsv());
                      }
                    }}
                  />
                </View>

                {showPasteCsv ? (
                  <View style={{ gap: spacing.sm }}>
                    <Input
                      value={csvText}
                      onChangeText={setCsvText}
                      placeholder="Product Name,Category,Cost Price,Selling Price,Stock Quantity,Barcode"
                      multiline
                      numberOfLines={6}
                      autoCapitalize="none"
                      autoCorrect={false}
                      containerStyle={{
                        height: 138,
                        alignItems: "flex-start",
                        paddingVertical: 10,
                      }}
                      style={{ textAlignVertical: "top", fontSize: 12 }}
                    />
                    <Button
                      title="Parse CSV Rows"
                      variant="secondary"
                      onPress={handleParsePastedCsv}
                    />
                  </View>
                ) : null}
              </CardContent>
            </Card>

            {parsedImport ? (
              <Card>
                <CardHeader bordered>
                  <View style={styles.previewHeader}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <CardTitle>{parsedImport.fileName}</CardTitle>
                      <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                        {parsedImport.validRows.length} ready to import
                        {parsedImport.skippedRows > 0
                          ? ` · ${parsedImport.skippedRows} empty skipped`
                          : ""}
                      </Text>
                    </View>
                    <Badge
                      label={`${parsedImport.validRows.length} rows`}
                      variant="secondary"
                    />
                  </View>
                </CardHeader>

                <CardContent style={{ paddingTop: spacing.md, gap: spacing.sm }}>
                  {parsedImport.newCategoryNames.length > 0 ? (
                    <View
                      style={[
                        styles.newCatsBanner,
                        {
                          backgroundColor: colors.primaryTint,
                          borderColor: colors.demoBannerBorder,
                          borderRadius: radii.lg,
                          padding: spacing.sm + 2,
                        },
                      ]}
                    >
                      <Layers size={15} color={colors.primary} />
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.primary, flex: 1 },
                        ]}
                      >
                        Auto-creating {parsedImport.newCategoryNames.length}{" "}
                        {parsedImport.newCategoryNames.length === 1
                          ? "category"
                          : "categories"}
                        : {parsedImport.newCategoryNames.join(", ")}
                      </Text>
                    </View>
                  ) : null}

                  {parsedImport.validRows.map((row) => (
                    <View
                      key={row.localId}
                      style={[
                        styles.previewRow,
                        {
                          borderColor: colors.border,
                          borderRadius: radii.lg,
                          padding: spacing.sm + 2,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={styles.previewTitleRow}>
                          <Text
                            numberOfLines={1}
                            style={[
                              typography.bodySemibold,
                              { color: colors.foreground, flex: 1 },
                            ]}
                          >
                            {row.input.name}
                          </Text>
                          {row.isNewCategory ? (
                            <Badge label="New Cat" variant="warning" />
                          ) : null}
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[
                            typography.caption,
                            typography.tabular,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {row.input.categoryName} · Cost{" "}
                          {formatCurrency(row.input.costPrice)} · Sell{" "}
                          {formatCurrency(row.input.unitPrice)} · Qty{" "}
                          {row.input.stockQuantity}
                          {row.input.barcode ? ` · ${row.input.barcode}` : ""}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleRemoveImportRow(row.localId)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${row.input.name}`}
                      >
                        <Trash2 size={16} color={colors.dangerText} />
                      </Pressable>
                    </View>
                  ))}
                </CardContent>

                <CardFooter style={{ gap: spacing.sm }}>
                  <Button
                    title={`Import ${parsedImport.validRows.length} ${
                      parsedImport.validRows.length === 1 ? "Product" : "Products"
                    }`}
                    size="lg"
                    loading={importing}
                    leftIcon={<PackagePlus size={17} color="#FFFFFF" />}
                    onPress={() => void handleConfirmBulkImport()}
                  />
                </CardFooter>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  statusBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadDropBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    gap: 8,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  newCatsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  previewTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
