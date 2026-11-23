import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
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
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertCircle,
  Barcode,
  Check,
  Keyboard,
  Minus,
  Package,
  Plus,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react-native";
import { useApiClient } from "@/api/ApiProvider";
import { useAuth } from "@/api/AuthProvider";
import {
  getStoredHidScannerEnabled,
  setStoredHidScannerEnabled,
} from "@/api/tokenStorage";
import { EmptyState } from "@/components/EmptyState";
import { HidScannerBanner } from "@/components/HidScannerBanner";
import { LoadingState } from "@/components/LoadingState";
import { SalesBarcodeScannerModal } from "@/components/SalesBarcodeScannerModal";
import {
  Button,
  Card,
  CardFooter,
  Input,
  SegmentedTabs,
  useToast,
} from "@/components/ui";
import { useHidBarcodeScanner } from "@/hooks/useHidBarcodeScanner";
import { useTheme } from "@/theme";
import type { CustomerItem, PaymentMode, ProductItem } from "@/types/domain";
import { formatCurrency } from "@/utils/formatters";
import { hapticError, hapticLight, hapticSuccess, hapticWarning } from "@/utils/haptics";
import { resolveProductImageUri } from "@/utils/productImage";

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

function SaleProductThumb({
  photoUrl,
  inCart,
  size = 42,
  iconSize = 18,
  borderRadius,
}: {
  photoUrl?: string;
  inCart?: boolean;
  size?: number;
  iconSize?: number;
  borderRadius: number;
}) {
  const { theme } = useTheme();
  const { serverUrl } = useAuth();
  const { colors } = theme;
  const [imageError, setImageError] = useState(false);

  const resolvedPhotoUri = resolveProductImageUri(photoUrl, serverUrl);

  useEffect(() => {
    setImageError(false);
  }, [resolvedPhotoUri]);

  const showImage = Boolean(resolvedPhotoUri) && !imageError;

  return (
    <View
      style={[
        styles.productIconBox,
        {
          width: size,
          height: size,
          backgroundColor: inCart ? colors.primaryTint : colors.muted,
          borderColor: inCart ? colors.primary : colors.border,
          borderRadius,
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: resolvedPhotoUri }}
          style={styles.productThumbImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <Package
          size={iconSize}
          color={inCart ? colors.primary : colors.mutedForeground}
        />
      )}
    </View>
  );
}

export default function NewSaleScreen() {
  const { productId, scan } = useLocalSearchParams<{
    productId?: string;
    scan?: string;
  }>();
  const { theme } = useTheme();
  const api = useApiClient();
  const { store } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radii, typography, fontFamilies } = theme;

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartRef = useRef<CartLine[]>([]);
  cartRef.current = cart;
  const [cartOpen, setCartOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(scan === "1");
  const [hidScannerEnabled, setHidScannerEnabled] = useState(false);
  const [searchInputFocused, setSearchInputFocused] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [cashTenderedText, setCashTenderedText] = useState("");
  const [applyTax, setApplyTax] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getStoredHidScannerEnabled().then(setHidScannerEnabled);
  }, []);

  useEffect(() => {
    if (!cartOpen || customers.length > 0) return;
    void api
      .getCustomers()
      .then((list) => setCustomers(list))
      .catch(() => {});
  }, [api, cartOpen, customers.length]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phonenumber?.toLowerCase().includes(q) ?? false) ||
        (c.email?.toLowerCase().includes(q) ?? false),
    );
  }, [customers, customerSearch]);

  const loadProducts = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const list = await api.getProducts();
        const sellable = list.filter((p) => p.active);
        setProducts(sellable);

        if (!isRefresh && productId) {
          const initial = sellable.find(
            (p) => p.id === String(productId) && p.stockQuantity > 0,
          );
          if (initial) {
            setCart((prev) =>
              prev.some((c) => c.product.id === initial.id)
                ? prev
                : [...prev, { product: initial, quantity: 1 }],
            );
          }
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, productId],
  );

  useEffect(() => {
    void loadProducts(false);
  }, [loadProducts]);

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

  const cartQtyById = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) {
      map.set(line.product.id, line.quantity);
    }
    return map;
  }, [cart]);

  const totalSelectedCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart],
  );

  useEffect(() => {
    if (scan === "1") {
      setScannerOpen(true);
    }
  }, [scan]);

  const addToCart = useCallback((product: ProductItem) => {
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
  }, []);

  const addScannedProductToCart = useCallback(
    (
      product: ProductItem,
    ): { ok: boolean; quantity: number; reason?: string } => {
      if (product.stockQuantity <= 0) {
        return {
          ok: false,
          quantity: 0,
          reason: `${product.name} is currently out of stock.`,
        };
      }
      const existing = cartRef.current.find((c) => c.product.id === product.id);
      const currentQty = existing?.quantity ?? 0;
      if (currentQty >= product.stockQuantity) {
        return {
          ok: false,
          quantity: currentQty,
          reason: `Maximum available stock (${product.stockQuantity}) already in cart.`,
        };
      }
      addToCart(product);
      return { ok: true, quantity: currentQty + 1 };
    },
    [addToCart],
  );

  const handleHidBarcodeScan = useCallback(
    async (rawBarcode: string) => {
      const code = rawBarcode.trim();
      if (!code) return;
      const lower = code.toLowerCase();
      let matched =
        products.find((p) => p.barcode.trim().toLowerCase() === lower) ?? null;
      if (!matched) {
        matched = await api.lookupProductByBarcode(code).catch(() => null);
      }

      if (!matched) {
        void hapticError();
        toast.error(
          "Barcode not found",
          `No active product matches barcode "${code}".`,
        );
        return;
      }

      if (!matched.active) {
        void hapticWarning();
        toast.warning(
          "Product inactive",
          `${matched.name} is archived and cannot be sold.`,
        );
        return;
      }

      const added = addScannedProductToCart(matched);
      if (added.ok) {
        void hapticSuccess();
        toast.success(
          `Added ${matched.name}`,
          `Qty in cart: ${added.quantity} · ${formatCurrency(matched.unitPrice, store?.currency || "GHS")}`,
        );
      } else {
        void hapticError();
        toast.warning(
          "Stock limit reached",
          added.reason || `${matched.name} cannot be added.`,
        );
      }
    },
    [products, api, addScannedProductToCart, toast, store?.currency],
  );

  const hidScanner = useHidBarcodeScanner({
    enabled: hidScannerEnabled,
    suspended:
      cartOpen || scannerOpen || customerPickerOpen || searchInputFocused,
    onScan: (code) => {
      void handleHidBarcodeScan(code);
    },
  });

  const handleToggleHidScanner = () => {
    const next = !hidScannerEnabled;
    void hapticLight();
    setHidScannerEnabled(next);
    void setStoredHidScannerEnabled(next);
    if (next) {
      toast.info(
        "HID Scanner Mode On",
        "Scan items directly with a Bluetooth or USB-C barcode gun.",
      );
    }
  };

  const updateCartQty = useCallback((id: string, delta: number) => {
    setError(null);
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.product.id !== id) return line;
          const next = Math.min(line.product.stockQuantity, line.quantity + delta);
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0),
    );
  }, []);

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
      void hapticSuccess();
      setCartOpen(false);
      toast.success(
        "Sale completed",
        `Receipt ${receipt.receiptNo} (${formatCurrency(receipt.totalAmount, currency)}) recorded.`,
      );
      router.replace({
        pathname: "/sales/[id]",
        params: {
          id: receipt.id,
          ...(store?.printAfterSale ? { autoPrint: "1" } : {}),
        },
      });
    } catch (err) {
      void hapticError();
      const msg = err instanceof Error ? err.message : "Failed to record sale.";
      setError(msg);
      toast.error("Sale failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderHeaderCartButton = () => (
    <Pressable
      onPress={() => setCartOpen(true)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Open sales cart (${totalSelectedCount} selected)`}
      style={({ pressed }) => [
        styles.headerCartBtn,
        { opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <ShoppingCart size={22} color={colors.foreground} />
      {totalSelectedCount > 0 ? (
        <View
          style={[
            styles.headerCartBadge,
            {
              backgroundColor: colors.primary,
              borderColor: colors.headerBackground,
            },
          ]}
        >
          <Text
            style={[
              typography.tabular,
              {
                color: colors.primaryForeground,
                fontSize: 10,
                lineHeight: 12,
                fontFamily: fontFamilies.bold,
              },
            ]}
          >
            {totalSelectedCount > 99 ? "99+" : totalSelectedCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "New Sale",
          headerBackTitle: "Back",
          headerRight: renderHeaderCartButton,
        }}
      />

      {/* Search bar + HID wedge toggle + camera barcode scanner trigger */}
      <View
        style={{
          paddingHorizontal: spacing.base,
          paddingTop: spacing.md,
          paddingBottom: spacing.sm,
          gap: spacing.xs + 2,
        }}
      >
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <Input
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchInputFocused(true)}
              onBlur={() => setSearchInputFocused(false)}
              placeholder="Search products by name, category, or barcode..."
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              leftIcon={<Search size={18} color={colors.mutedForeground} />}
              rightSlot={
                searchQuery.length > 0 ? (
                  <Pressable
                    onPress={() => setSearchQuery("")}
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
            variant={hidScannerEnabled ? "default" : "outline"}
            size="icon"
            style={{ height: 48, width: 48 }}
            accessibilityLabel="Toggle Bluetooth or USB HID barcode scanner mode"
            leftIcon={
              <Keyboard
                size={20}
                color={
                  hidScannerEnabled ? colors.primaryForeground : colors.foreground
                }
              />
            }
            onPress={handleToggleHidScanner}
          />
          <Button
            variant="outline"
            size="icon"
            style={{ height: 48, width: 48 }}
            accessibilityLabel="Scan product barcode with camera"
            leftIcon={<ScanBarcode size={20} color={colors.foreground} />}
            onPress={() => setScannerOpen(true)}
          />
        </View>

        <HidScannerBanner
          scanner={hidScanner}
          enabled={hidScannerEnabled}
          suspended={
            cartOpen || scannerOpen || customerPickerOpen || searchInputFocused
          }
          contextHint="Scan product barcode to add directly to cart"
        />
      </View>

      {loading && products.length === 0 ? (
        <LoadingState message="Loading products..." />
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: spacing.base,
            paddingTop: spacing.xs,
            gap: spacing.sm + 2,
            paddingBottom: Math.max(insets.bottom, spacing["2xl"]),
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadProducts(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => {
            const inCart = cartQtyById.get(item.id) ?? 0;
            const atMax = inCart >= item.stockQuantity;

            return (
              <Pressable
                onPress={() => {
                  void hapticLight();
                  addToCart(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Add ${item.name} to cart`}
                style={({ pressed }) => [
                  styles.productRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: inCart > 0 ? colors.primary : colors.border,
                    borderWidth: inCart > 0 ? 1.5 : 1,
                    borderRadius: radii.xl,
                    padding: spacing.md + 2,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
              >
                <SaleProductThumb
                  photoUrl={item.photoUrl}
                  inCart={inCart > 0}
                  borderRadius={radii.lg}
                />

                <View style={styles.productInfo}>
                  <Text
                    numberOfLines={1}
                    style={[typography.bodySemibold, { color: colors.foreground }]}
                  >
                    {item.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.caption,
                      typography.tabular,
                      { color: colors.mutedForeground, marginTop: 2 },
                    ]}
                  >
                    {item.stockQuantity} available · {item.categoryName}
                  </Text>
                  {item.barcode ? (
                    <View style={styles.barcodeRow}>
                      <Barcode size={11} color={colors.mutedForeground} />
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.micro,
                          typography.tabular,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {item.barcode}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.productRight}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      typography.tabular,
                      {
                        color: colors.foreground,
                        fontFamily: fontFamilies.bold,
                      },
                    ]}
                  >
                    {formatCurrency(item.unitPrice, currency)}
                  </Text>

                  {inCart > 0 ? (
                    <View style={styles.inlineStepper}>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          updateCartQty(item.id, -1);
                        }}
                        hitSlop={6}
                        accessibilityLabel={`Decrease ${item.name} quantity`}
                        style={[
                          styles.stepperBtn,
                          {
                            backgroundColor: colors.muted,
                            borderColor: colors.border,
                            borderRadius: radii.md,
                          },
                        ]}
                      >
                        {inCart === 1 ? (
                          <Trash2 size={13} color={colors.dangerText} />
                        ) : (
                          <Minus size={13} color={colors.foreground} />
                        )}
                      </Pressable>

                      <Text
                        style={[
                          typography.caption,
                          typography.tabular,
                          {
                            color: colors.primary,
                            fontFamily: fontFamilies.bold,
                            minWidth: 20,
                            textAlign: "center",
                          },
                        ]}
                      >
                        {inCart}
                      </Text>

                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          addToCart(item);
                        }}
                        disabled={atMax}
                        hitSlop={6}
                        accessibilityLabel={`Increase ${item.name} quantity`}
                        style={[
                          styles.stepperBtn,
                          {
                            backgroundColor: colors.primaryTint,
                            borderColor: colors.primary,
                            borderRadius: radii.md,
                            opacity: atMax ? 0.4 : 1,
                          },
                        ]}
                      >
                        <Plus size={13} color={colors.primary} />
                      </Pressable>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.addIconPill,
                        {
                          backgroundColor: colors.primaryTint,
                          borderRadius: radii.md,
                        },
                      ]}
                    >
                      <Plus size={15} color={colors.primary} />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Package size={36} color={colors.mutedForeground} />}
              title="No products available"
              description={
                searchQuery.trim().length > 0
                  ? "No in-stock products match your search query."
                  : "All active products are currently out of stock."
              }
              action={
                searchQuery.trim().length > 0 ? (
                  <Button
                    title="Clear search"
                    variant="outline"
                    size="sm"
                    onPress={() => setSearchQuery("")}
                  />
                ) : undefined
              }
            />
          }
        />
      )}

      {/* Sales Cart Modal opened from header cart icon */}
      <Modal
        visible={cartOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!submitting) setCartOpen(false);
        }}
      >
        <View
          style={[
            styles.modalRoot,
            {
              backgroundColor: colors.background,
              paddingTop: Platform.OS === "ios" ? spacing.sm : insets.top,
            },
          ]}
        >
          {/* Modal Header */}
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: colors.headerBackground,
                borderBottomColor: colors.border,
                paddingHorizontal: spacing.base,
                paddingVertical: spacing.md,
              },
            ]}
          >
            <View style={styles.rowCenter}>
              <ShoppingCart size={18} color={colors.primary} />
              <Text style={[typography.titleSm, { color: colors.foreground }]}>
                Sale Cart ({totalSelectedCount})
              </Text>
            </View>

            <View style={styles.rowCenter}>
              {cart.length > 0 ? (
                <Pressable
                  onPress={() => {
                    void hapticWarning();
                    setCart([]);
                  }}
                  disabled={submitting}
                  hitSlop={6}
                  style={{ paddingHorizontal: spacing.xs }}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: colors.dangerText,
                        fontFamily: fontFamilies.semibold,
                      },
                    ]}
                  >
                    Clear
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  if (!submitting) setCartOpen(false);
                }}
                hitSlop={8}
                accessibilityLabel="Close sales cart"
                style={[
                  styles.closeBtn,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    borderRadius: radii.lg,
                  },
                ]}
              >
                <X size={18} color={colors.foreground} />
              </Pressable>
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: spacing.base,
                gap: spacing.base,
                paddingBottom: Math.max(insets.bottom, spacing["2xl"]) + 16,
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
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.dangerText, flex: 1 },
                    ]}
                  >
                    {error}
                  </Text>
                </View>
              ) : null}

              {cart.length === 0 ? (
                <EmptyState
                  icon={<ShoppingCart size={36} color={colors.mutedForeground} />}
                  title="Your sale cart is empty"
                  description="Select products from the products list to add items to this sale."
                  action={
                    <Button
                      title="Browse products"
                      variant="outline"
                      size="sm"
                      onPress={() => setCartOpen(false)}
                    />
                  }
                />
              ) : (
                <Card>
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
                              idx < cart.length - 1
                                ? StyleSheet.hairlineWidth
                                : 0,
                            borderBottomColor: colors.border,
                          },
                        ]}
                      >
                        <SaleProductThumb
                          photoUrl={line.product.photoUrl}
                          size={36}
                          iconSize={16}
                          borderRadius={radii.md}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              typography.bodySemibold,
                              { color: colors.foreground },
                            ]}
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
                            {formatCurrency(line.product.unitPrice, currency)} ×{" "}
                            {line.quantity} ={" "}
                            {formatCurrency(
                              line.product.unitPrice * line.quantity,
                              currency,
                            )}{" "}
                            · Max {line.product.stockQuantity}
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
                              {
                                color: colors.foreground,
                                minWidth: 24,
                                textAlign: "center",
                              },
                            ]}
                          >
                            {line.quantity}
                          </Text>

                          <Pressable
                            onPress={() => updateCartQty(line.product.id, 1)}
                            disabled={line.quantity >= line.product.stockQuantity}
                            style={[
                              styles.qtyBtn,
                              {
                                backgroundColor: colors.muted,
                                borderColor: colors.border,
                                borderRadius: radii.md,
                                opacity:
                                  line.quantity >= line.product.stockQuantity
                                    ? 0.4
                                    : 1,
                              },
                            ]}
                          >
                            <Plus size={14} color={colors.foreground} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>

                  <CardFooter style={{ gap: spacing.md }}>
                    <View style={{ gap: spacing.xs + 2 }}>
                      <View style={styles.rowBetween}>
                        <Text
                          style={[
                            typography.caption,
                            {
                              color: colors.mutedForeground,
                              fontFamily: fontFamilies.semibold,
                            },
                          ]}
                        >
                          Customer
                        </Text>
                        <Pressable
                          onPress={() => {
                            setCustomerSearch("");
                            setCustomerPickerOpen(true);
                          }}
                          style={styles.pickCustomerBtn}
                        >
                          <Users size={13} color={colors.primary} />
                          <Text
                            style={[
                              typography.caption,
                              {
                                color: colors.primary,
                                fontFamily: fontFamilies.semibold,
                              },
                            ]}
                          >
                            Pick Saved ({customers.length})
                          </Text>
                        </Pressable>
                      </View>

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
                              onPress={() =>
                                setCashTenderedText(String(chip.val))
                              }
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
                                    (Number.parseFloat(cashTenderedText) || 0) >=
                                    totalAmount
                                      ? colors.successText
                                      : colors.dangerText,
                                  fontFamily: fontFamilies.bold,
                                },
                              ]}
                            >
                              {(Number.parseFloat(cashTenderedText) || 0) >=
                              totalAmount
                                ? `Change: ${formatCurrency(
                                    (Number.parseFloat(cashTenderedText) || 0) -
                                      totalAmount,
                                    currency,
                                  )}`
                                : `Short: ${formatCurrency(
                                    totalAmount -
                                      (Number.parseFloat(cashTenderedText) || 0),
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
                            backgroundColor: applyTax
                              ? colors.primary
                              : "transparent",
                            borderRadius: radii.sm,
                          },
                        ]}
                      >
                        {applyTax ? <Check size={12} color="#FFFFFF" /> : null}
                      </View>
                      <Text
                        style={[typography.caption, { color: colors.foreground }]}
                      >
                        Apply store tax ({(taxRate * 100).toFixed(1)}%)
                      </Text>
                    </Pressable>

                    <View style={styles.totalsBlock}>
                      <View style={styles.rowBetween}>
                        <Text
                          style={[
                            typography.caption,
                            { color: colors.mutedForeground },
                          ]}
                        >
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
                          <Text
                            style={[
                              typography.caption,
                              { color: colors.mutedForeground },
                            ]}
                          >
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
                          <Text
                            style={[
                              typography.caption,
                              { color: colors.mutedForeground },
                            ]}
                          >
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
                        <Text
                          style={[
                            typography.subtitle,
                            { color: colors.foreground },
                          ]}
                        >
                          Total Due
                        </Text>
                        <Text
                          style={[
                            typography.titleSm,
                            typography.tabular,
                            {
                              color: colors.foreground,
                              fontFamily: fontFamilies.bold,
                            },
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
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <SalesBarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onOpenCart={() => setCartOpen(true)}
        cartCount={totalSelectedCount}
        cartQtyById={cartQtyById}
        onAddProduct={addScannedProductToCart}
        onDecrementProduct={(id) => updateCartQty(id, -1)}
        currency={currency}
      />

      {/* Saved Customer Picker Modal */}
      <Modal
        visible={customerPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomerPickerOpen(false)}
      >
        <View style={styles.pickerOverlay}>
          <View
            style={[
              styles.pickerCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: radii["2xl"],
                padding: spacing.base,
                gap: spacing.sm + 2,
              },
            ]}
          >
            <View style={styles.rowBetween}>
              <Text style={[typography.titleSm, { color: colors.foreground }]}>
                Select Customer
              </Text>
              <Pressable
                onPress={() => setCustomerPickerOpen(false)}
                hitSlop={8}
              >
                <X size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Input
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search saved customers..."
              autoCapitalize="none"
              leftIcon={<Search size={16} color={colors.mutedForeground} />}
            />

            <ScrollView style={{ maxHeight: 320 }}>
              <Pressable
                onPress={() => {
                  setCustomerName("");
                  setCustomerPhone("");
                  setCustomerPickerOpen(false);
                }}
                style={({ pressed }) => [
                  styles.pickerRow,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: pressed ? colors.muted : "transparent",
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      { color: colors.foreground },
                    ]}
                  >
                    Walk-in Customer
                  </Text>
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Default quick checkout
                  </Text>
                </View>
                {!customerName.trim() ? (
                  <UserCheck size={16} color={colors.primary} />
                ) : null}
              </Pressable>

              {filteredCustomers.map((c) => {
                const selected =
                  customerName.trim().toLowerCase() === c.name.toLowerCase();
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCustomerName(c.name);
                      setCustomerPhone(c.phonenumber ?? "");
                      setCustomerPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: pressed ? colors.muted : "transparent",
                      },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.bodySemibold,
                          { color: colors.foreground },
                        ]}
                      >
                        {c.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          typography.caption,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {c.phonenumber || "No phone"} · {c.orderCount} orders
                      </Text>
                    </View>
                    {selected ? (
                      <UserCheck size={16} color={colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCartBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerCartBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  productIconBox: {
    width: 42,
    height: 42,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  productThumbImage: {
    width: "100%",
    height: "100%",
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  barcodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  productRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  inlineStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addIconPill: {
    width: 28,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
  pickCustomerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    padding: 20,
  },
  pickerCard: {
    borderWidth: 1,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
