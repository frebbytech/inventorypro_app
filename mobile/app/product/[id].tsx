import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Barcode, Minus, Package, Plus, ShoppingCart } from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { StockMeter } from "@/components/StockMeter";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from "@/components/ui";
import { useTheme } from "@/theme";
import { LOW_STOCK_THRESHOLD, type ProductDetailResponse } from "@/types/domain";
import {
  calculateMarginPercent,
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
} from "@/utils/formatters";

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);
  const [customQty, setCustomQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await api.getProductById(String(id));
        if (active) setDetail(res);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [api, id]);

  if (loading) {
    return <LoadingState message="Loading product details..." />;
  }

  if (!detail) {
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
              title="Back to Inventory"
              variant="outline"
              size="sm"
              onPress={() => router.back()}
            />
          }
        />
      </View>
    );
  }

  const handleAdjustStock = async (delta: number) => {
    if (!detail || adjusting) return;
    setAdjusting(true);
    setAdjustError(null);
    setAdjustSuccess(null);
    try {
      const updated = await api.adjustProductStock(detail.product.id, {
        delta,
        reason: adjustReason.trim() || undefined,
      });
      setDetail({ ...detail, product: updated });
      setCustomQty("");
      setAdjustSuccess(
        `Stock updated (${delta >= 0 ? `+${delta}` : delta}) → ${updated.stockQuantity} units`,
      );
    } catch (err) {
      setAdjustError(
        err instanceof Error ? err.message : "Failed to update stock.",
      );
    } finally {
      setAdjusting(false);
    }
  };

  const handleApplyCustom = async () => {
    const parsed = Number.parseInt(customQty.trim(), 10);
    if (Number.isNaN(parsed) || parsed < 0 || !detail || adjusting) {
      setAdjustError("Enter a valid non-negative stock count.");
      return;
    }
    setAdjusting(true);
    setAdjustError(null);
    setAdjustSuccess(null);
    try {
      const updated = await api.adjustProductStock(detail.product.id, {
        setQuantity: parsed,
        reason: adjustReason.trim() || "Manual physical stock count",
      });
      setDetail({ ...detail, product: updated });
      setCustomQty("");
      setAdjustSuccess(`Stock count set to ${updated.stockQuantity} units`);
    } catch (err) {
      setAdjustError(
        err instanceof Error ? err.message : "Failed to set stock count.",
      );
    } finally {
      setAdjusting(false);
    }
  };

  const { product, recentSales } = detail;
  const isOut = product.stockQuantity <= 0;
  const threshold =
    store?.stockAlertThreshold || product.lowStockThreshold || LOW_STOCK_THRESHOLD;
  const isLow =
    product.stockQuantity > 0 && product.stockQuantity < threshold;
  const margin = calculateMarginPercent(product.unitPrice, product.costPrice);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.base,
        gap: spacing.base,
        paddingBottom: spacing["2xl"],
      }}
    >
      {/* Product Identity Card */}
      <Card>
        <CardContent style={{ paddingTop: spacing.base, gap: spacing.md }}>
          <View style={styles.badgesRow}>
            <Badge
              label={product.active ? "Active" : "Disabled"}
              variant={product.active ? "success" : "danger"}
            />
            <Badge
              label={
                isOut
                  ? "Out of Stock"
                  : isLow
                    ? `${product.stockQuantity} left · Low`
                    : `${product.stockQuantity} in stock`
              }
              variant={isOut ? "danger" : isLow ? "warning" : "success"}
            />
            {api.isDemo ? <Badge label="DEMO" variant="outline" /> : null}
          </View>

          <View>
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              {product.categoryName}
            </Text>
            <Text
              style={[
                typography.titleMd,
                { color: colors.foreground, marginTop: 2 },
              ]}
            >
              {product.name}
            </Text>
            {product.description ? (
              <Text
                style={[
                  typography.body,
                  { color: colors.mutedForeground, marginTop: spacing.xs },
                ]}
              >
                {product.description}
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.barcodePill,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              },
            ]}
          >
            <Barcode size={16} color={colors.mutedForeground} />
            <Text
              style={[
                typography.bodyMedium,
                typography.tabular,
                {
                  color: product.barcode
                    ? colors.foreground
                    : colors.mutedForeground,
                },
              ]}
            >
              {product.barcode || "No barcode assigned"}
            </Text>
          </View>
        </CardContent>
      </Card>

      {/* Hairline-divided 2x2 KPI Strip matching product/[id]/page.tsx */}
      <View
        style={[
          styles.kpiGrid,
          {
            backgroundColor: colors.border,
            borderColor: colors.border,
            borderRadius: radii.xl,
          },
        ]}
      >
        <View style={styles.kpiRow}>
          <View
            style={[
              styles.kpiCell,
              { backgroundColor: colors.card, padding: spacing.base },
            ]}
          >
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Unit price
            </Text>
            <Text
              style={[
                typography.titleSm,
                typography.tabular,
                {
                  color: colors.foreground,
                  fontFamily: fontFamilies.bold,
                  marginTop: spacing.xs,
                },
              ]}
            >
              {formatCurrency(product.unitPrice)}
            </Text>
          </View>

          <View
            style={[
              styles.kpiCell,
              { backgroundColor: colors.card, padding: spacing.base },
            ]}
          >
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Cost price
            </Text>
            <Text
              style={[
                typography.titleSm,
                typography.tabular,
                { color: colors.foreground, marginTop: spacing.xs },
              ]}
            >
              {formatCurrency(product.costPrice)}
            </Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View
            style={[
              styles.kpiCell,
              { backgroundColor: colors.card, padding: spacing.base },
            ]}
          >
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Markup margin
            </Text>
            <Text
              style={[
                typography.titleSm,
                typography.tabular,
                { color: colors.successText, marginTop: spacing.xs },
              ]}
            >
              {margin !== null ? `${margin.toFixed(1)}%` : "—"}
            </Text>
          </View>

          <View
            style={[
              styles.kpiCell,
              { backgroundColor: colors.card, padding: spacing.base },
            ]}
          >
            <Text style={[typography.caption, { color: colors.mutedForeground }]}>
              Stock value
            </Text>
            <Text
              style={[
                typography.titleSm,
                typography.tabular,
                { color: colors.foreground, marginTop: spacing.xs },
              ]}
            >
              {formatCurrency(product.stockValue)}
            </Text>
          </View>
        </View>
      </View>

      {/* Stock Level Breakdown */}
      <Card>
        <CardHeader bordered>
          <CardTitle>Stock health</CardTitle>
        </CardHeader>
        <CardContent style={{ paddingTop: spacing.md, gap: spacing.md }}>
          <View style={styles.stockRow}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodySemibold, { color: colors.foreground }]}>
                {product.stockQuantity} units on hand
              </Text>
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                Alert threshold: below {threshold} units · Updated{" "}
                {formatDateTime(product.updatedAt)}
              </Text>
            </View>
            <StockMeter
              stock={product.stockQuantity}
              threshold={threshold}
            />
          </View>

          <View style={styles.quickAdjustRow}>
            <Button
              title="-1"
              variant="outline"
              size="sm"
              disabled={adjusting || product.stockQuantity <= 0}
              leftIcon={<Minus size={14} color={colors.foreground} />}
              onPress={() => void handleAdjustStock(-1)}
            />
            <Button
              title="+1"
              variant="outline"
              size="sm"
              disabled={adjusting}
              leftIcon={<Plus size={14} color={colors.foreground} />}
              onPress={() => void handleAdjustStock(1)}
            />
            <Button
              title="+5"
              variant="outline"
              size="sm"
              disabled={adjusting}
              onPress={() => void handleAdjustStock(5)}
            />
            <Button
              title="+10"
              variant="outline"
              size="sm"
              disabled={adjusting}
              onPress={() => void handleAdjustStock(10)}
            />
            <Button
              title="Sell"
              size="sm"
              style={{ flex: 1 }}
              disabled={product.stockQuantity <= 0}
              leftIcon={<ShoppingCart size={14} color="#FFFFFF" />}
              onPress={() =>
                router.push({
                  pathname: "/sales/new",
                  params: { productId: product.id },
                })
              }
            />
          </View>

          <View style={styles.customAdjustRow}>
            <View style={{ flex: 1 }}>
              <Input
                value={customQty}
                onChangeText={setCustomQty}
                placeholder="Set exact stock count..."
                keyboardType="number-pad"
              />
            </View>
            <Button
              title="Set Qty"
              variant="secondary"
              loading={adjusting}
              disabled={!customQty.trim()}
              onPress={() => void handleApplyCustom()}
            />
          </View>

          <Input
            value={adjustReason}
            onChangeText={setAdjustReason}
            placeholder="Optional adjustment note (e.g. Supplier delivery)"
          />

          {adjustError ? (
            <Text style={[typography.caption, { color: colors.dangerText }]}>
              {adjustError}
            </Text>
          ) : null}
          {adjustSuccess ? (
            <Text style={[typography.caption, { color: colors.successText }]}>
              {adjustSuccess}
            </Text>
          ) : null}
        </CardContent>
      </Card>

      {/* Recent Sales Containing This Product */}
      <Card>
        <CardHeader bordered>
          <CardTitle>Recent sales ({recentSales.length})</CardTitle>
        </CardHeader>

        {recentSales.length === 0 ? (
          <View style={styles.emptySales}>
            <ShoppingCart size={28} color={colors.mutedForeground} />
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              No sample sales recorded for this product yet.
            </Text>
          </View>
        ) : (
          <View>
            {recentSales.map((sale, idx) => (
              <Pressable
                key={sale.id}
                onPress={() =>
                  router.push({
                    pathname: "/sales/[id]",
                    params: { id: sale.saleId },
                  })
                }
                style={({ pressed }) => [
                  styles.saleRow,
                  {
                    paddingHorizontal: spacing.base,
                    paddingVertical: spacing.md,
                    borderBottomWidth:
                      idx < recentSales.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: colors.border,
                    backgroundColor: pressed ? colors.muted : colors.card,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      typography.tabular,
                      { color: colors.foreground },
                    ]}
                  >
                    {sale.receiptNo}
                  </Text>
                  <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                    {sale.customerName} · {capitalizeLabel(sale.paymentMode)} ·{" "}
                    {formatDateTime(sale.saleDate)}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      typography.tabular,
                      { color: colors.foreground },
                    ]}
                  >
                    {formatCurrency(sale.subtotal)}
                  </Text>
                  <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                    {sale.quantity} × {formatCurrency(sale.unitPrice)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notFoundWrap: {
    flex: 1,
    justifyContent: "center",
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  barcodePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  kpiGrid: {
    borderWidth: 1,
    overflow: "hidden",
    gap: 1,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 1,
  },
  kpiCell: {
    flex: 1,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  emptySales: {
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 8,
  },
  saleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  quickAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  customAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
