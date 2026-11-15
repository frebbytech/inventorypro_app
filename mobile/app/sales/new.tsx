import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle,
  Check,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import { LoadingState } from "@/components/LoadingState";
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
} from "@/components/ui";
import { useTheme } from "@/theme";
import type { PaymentMode, ProductItem } from "@/types/domain";
import { formatCurrency } from "@/utils/formatters";

interface CartLine {
  product: ProductItem;
  quantity: number;
}

const PAYMENT_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "momo", label: "MoMo" },
  { value: "bank", label: "Bank" },
  { value: "cheque", label: "Cheque" },
];

export default function NewSaleScreen() {
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const router = useRouter();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [cashTenderedText, setCashTenderedText] = useState("");
  const [applyTax, setApplyTax] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const list = await api.getProducts();
        if (!active) return;
        const sellable = list.filter((p) => p.active);
        setProducts(sellable);

        if (productId) {
          const initial = sellable.find(
            (p) => p.id === String(productId) && p.stockQuantity > 0,
          );
          if (initial) {
            setCart([{ product: initial, quantity: 1 }]);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [api, productId]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.stockQuantity > 0 &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q)),
    );
  }, [products, searchQuery]);

  const addToCart = (product: ProductItem) => {
    setError(null);
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) return prev;
        return prev.map((c) =>
          c.product.id === product.id
            ? { ...c, quantity: c.quantity + 1 }
            : c,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.product.id !== id) return line;
          const next = Math.min(line.product.stockQuantity, line.quantity + delta);
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0),
    );
  };

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + line.product.unitPrice * line.quantity,
        0,
      ),
    [cart],
  );

  const discountAmount = Math.max(
    0,
    Math.min(subtotal, Number.parseFloat(discountText) || 0),
  );
  const taxRate = store?.taxRate ?? 0.01;
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = applyTax ? Number((taxable * taxRate).toFixed(2)) : 0;
  const totalAmount = Number((taxable + taxAmount).toFixed(2));
  const currency = store?.currency || "GHS";

  const handleCompleteSale = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const receipt = await api.createSale({
        customerName: customerName.trim() || "Walk-in Customer",
        customerPhone: customerPhone.trim() || undefined,
        paymentMode,
        discountAmount,
        applyTax,
        items: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      });
      router.replace({
        pathname: "/sales/[id]",
        params: { id: receipt.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record sale.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading products for POS checkout..." />;
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: spacing.base,
        gap: spacing.base,
        paddingBottom: spacing["3xl"],
      }}
    >
      {error ? (
        <View
          style={[
            styles.errorBox,
            {
              backgroundColor: colors.dangerTint,
              borderColor: colors.dangerBorder,
              borderRadius: radii.xl,
              padding: spacing.md,
            },
          ]}
        >
          <AlertCircle size={18} color={colors.dangerText} />
          <Text style={[typography.caption, { color: colors.dangerText, flex: 1 }]}>
            {error}
          </Text>
        </View>
      ) : null}

      {/* Cart Summary Card */}
      <Card>
        <CardHeader bordered>
          <View style={styles.rowBetween}>
            <View style={styles.rowCenter}>
              <ShoppingCart size={16} color={colors.primary} />
              <CardTitle>Sale Cart ({cart.length})</CardTitle>
            </View>
            <Badge
              label={formatCurrency(totalAmount, currency)}
              variant="outline"
            />
          </View>
        </CardHeader>

        {cart.length === 0 ? (
          <CardContent style={{ paddingTop: spacing.md }}>
            <Text style={[typography.body, { color: colors.mutedForeground }]}>
              Tap products below to add items to this receipt.
            </Text>
          </CardContent>
        ) : (
          <View>
            {cart.map((line, idx) => (
              <View
                key={line.product.id}
                style={[
                  styles.cartRow,
                  {
                    paddingHorizontal: spacing.base,
                    paddingVertical: spacing.md,
                    borderBottomWidth:
                      idx < cart.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[typography.bodySemibold, { color: colors.foreground }]}
                  >
                    {line.product.name}
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      typography.tabular,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {formatCurrency(line.product.unitPrice, currency)} · Max{" "}
                    {line.product.stockQuantity}
                  </Text>
                </View>

                <View style={styles.qtyControls}>
                  <Pressable
                    onPress={() => updateCartQty(line.product.id, -1)}
                    style={[
                      styles.qtyBtn,
                      {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    {line.quantity === 1 ? (
                      <Trash2 size={14} color={colors.dangerText} />
                    ) : (
                      <Minus size={14} color={colors.foreground} />
                    )}
                  </Pressable>

                  <Text
                    style={[
                      typography.bodySemibold,
                      typography.tabular,
                      { color: colors.foreground, minWidth: 24, textAlign: "center" },
                    ]}
                  >
                    {line.quantity}
                  </Text>

                  <Pressable
                    onPress={() => updateCartQty(line.product.id, 1)}
                    style={[
                      styles.qtyBtn,
                      {
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        borderRadius: radii.md,
                        opacity:
                          line.quantity >= line.product.stockQuantity ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Plus size={14} color={colors.foreground} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        <CardFooter style={{ gap: spacing.md }}>
          <View style={styles.inputRow}>
            <View style={{ flex: 1.3 }}>
              <Input
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Customer (Walk-in)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="Phone (opt)"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <Input
                value={discountText}
                onChangeText={setDiscountText}
                placeholder="Discount (0)"
                keyboardType="decimal-pad"
              />
            </View>
            {paymentMode === "cash" ? (
              <View style={{ flex: 1 }}>
                <Input
                  value={cashTenderedText}
                  onChangeText={setCashTenderedText}
                  placeholder={`Cash tendered (${totalAmount.toFixed(0)})`}
                  keyboardType="decimal-pad"
                />
              </View>
            ) : null}
          </View>

          <SegmentedTabs
            options={PAYMENT_OPTIONS}
            value={paymentMode}
            onChange={setPaymentMode}
          />

          {paymentMode === "cash" && totalAmount > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <View style={styles.quickCashRow}>
                {[
                  { label: "Exact", val: totalAmount },
                  { label: "50", val: 50 },
                  { label: "100", val: 100 },
                  { label: "200", val: 200 },
                ].map((chip) => (
                  <Pressable
                    key={chip.label}
                    onPress={() => setCashTenderedText(String(chip.val))}
                    style={[
                      styles.cashChip,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.micro,
                        typography.tabular,
                        { color: colors.foreground },
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                ))}
                {cashTenderedText.trim().length > 0 ? (
                  <Text
                    style={[
                      typography.caption,
                      typography.tabular,
                      {
                        marginLeft: "auto",
                        color:
                          (Number.parseFloat(cashTenderedText) || 0) >= totalAmount
                            ? colors.successText
                            : colors.dangerText,
                        fontFamily: fontFamilies.bold,
                      },
                    ]}
                  >
                    {(Number.parseFloat(cashTenderedText) || 0) >= totalAmount
                      ? `Change: ${formatCurrency(
                          (Number.parseFloat(cashTenderedText) || 0) - totalAmount,
                          currency,
                        )}`
                      : `Short: ${formatCurrency(
                          totalAmount - (Number.parseFloat(cashTenderedText) || 0),
                          currency,
                        )}`}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={() => setApplyTax((v) => !v)}
            style={styles.taxToggle}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: applyTax ? colors.primary : colors.border,
                  backgroundColor: applyTax ? colors.primary : "transparent",
                  borderRadius: radii.sm,
                },
              ]}
            >
              {applyTax ? <Check size={12} color="#FFFFFF" /> : null}
            </View>
            <Text style={[typography.caption, { color: colors.foreground }]}>
              Apply store tax ({(taxRate * 100).toFixed(1)}%)
            </Text>
          </Pressable>

          <View style={styles.totalsBlock}>
            <View style={styles.rowBetween}>
              <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                Subtotal
              </Text>
              <Text
                style={[
                  typography.bodyMedium,
                  typography.tabular,
                  { color: colors.foreground },
                ]}
              >
                {formatCurrency(subtotal, currency)}
              </Text>
            </View>
            {discountAmount > 0 ? (
              <View style={styles.rowBetween}>
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                  Discount
                </Text>
                <Text
                  style={[
                    typography.bodyMedium,
                    typography.tabular,
                    { color: colors.successText },
                  ]}
                >
                  -{formatCurrency(discountAmount, currency)}
                </Text>
              </View>
            ) : null}
            {taxAmount > 0 ? (
              <View style={styles.rowBetween}>
                <Text style={[typography.caption, { color: colors.mutedForeground }]}>
                  Tax
                </Text>
                <Text
                  style={[
                    typography.bodyMedium,
                    typography.tabular,
                    { color: colors.foreground },
                  ]}
                >
                  {formatCurrency(taxAmount, currency)}
                </Text>
              </View>
            ) : null}
            <View style={styles.rowBetween}>
              <Text style={[typography.subtitle, { color: colors.foreground }]}>
                Total Due
              </Text>
              <Text
                style={[
                  typography.titleSm,
                  typography.tabular,
                  { color: colors.foreground, fontFamily: fontFamilies.bold },
                ]}
              >
                {formatCurrency(totalAmount, currency)}
              </Text>
            </View>
          </View>

          <Button
            title={`Record Sale · ${formatCurrency(totalAmount, currency)}`}
            size="lg"
            loading={submitting}
            disabled={cart.length === 0}
            onPress={() => void handleCompleteSale()}
          />
        </CardFooter>
      </Card>

      {/* Product Picker */}
      <Card>
        <CardHeader bordered>
          <CardTitle>Add products</CardTitle>
        </CardHeader>

        <CardContent style={{ paddingTop: spacing.md, gap: spacing.sm }}>
          <Input
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Filter available products..."
            leftIcon={<Search size={16} color={colors.mutedForeground} />}
          />

          {filteredProducts.map((p) => {
            const inCart = cart.find((c) => c.product.id === p.id)?.quantity ?? 0;
            return (
              <Pressable
                key={p.id}
                onPress={() => addToCart(p)}
                style={({ pressed }) => [
                  styles.pickerRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.muted : colors.card,
                    borderRadius: radii.lg,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[typography.bodyMedium, { color: colors.foreground }]}
                  >
                    {p.name}
                  </Text>
                  <Text style={[typography.micro, { color: colors.mutedForeground }]}>
                    {p.stockQuantity} available · {p.categoryName}
                  </Text>
                </View>

                <View style={styles.pickerRight}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      typography.tabular,
                      { color: colors.foreground },
                    ]}
                  >
                    {formatCurrency(p.unitPrice, currency)}
                  </Text>
                  {inCart > 0 ? (
                    <Badge label={`×${inCart}`} variant="success" />
                  ) : (
                    <Plus size={16} color={colors.primary} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </CardContent>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  taxToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  totalsBlock: {
    gap: 4,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    gap: 10,
  },
  pickerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickCashRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  cashChip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
