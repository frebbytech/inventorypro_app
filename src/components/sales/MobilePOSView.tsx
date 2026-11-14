"use client";

import { useEffect, useMemo, useState } from "react";
import _ from "lodash";
import { toast } from "sonner";
import {
  Search,
  X,
  Plus,
  Minus,
  ChevronUp,
  LayoutGrid,
  Banknote,
  Wallet,
  Smartphone,
  Landmark,
  Check,
  RefreshCcw,
  Trash2,
  ShoppingBag,
  Tag,
  Coffee,
  Shirt,
  Home,
  BookOpen,
  Wrench,
  Gift,
  Dumbbell,
  Palette,
  Music,
  Car,
  Baby,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ProductCatalogView,
  InsertSales,
  InsertSalesCustomer,
  PaymentMode,
  PaymentInfo,
} from "@/types/globals";
import { currencyFormatter } from "@/config/formatter";
import { randomCode } from "@/config/helper";
import { useCart } from "@/components/providers/cart-provider";
import { useSettings } from "@/providers/SettingsProvider";
import { createProductSales } from "@/actions/sales";
import { generateReceiptPDF } from "@/lib/receipt";
import { cn } from "@/lib/utils";
import { parseAsInteger, useQueryState } from "nuqs";
import { useProductTableFilters } from "@/sections/sales/product-tables/use-product-table-filters";

interface CategoryOption {
  label: string;
  value: string;
}

type StockFilterValue = "all" | "in_stock" | "low_stock";

interface MobilePOSViewProps {
  data: ProductCatalogView[];
  totalData: number;
  categoryList: CategoryOption[];
}

const PAYMENT_MODES: {
  value: PaymentMode;
  label: string;
  icon: typeof Banknote;
}[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "cheque", label: "Cheque", icon: Wallet },
  { value: "momo", label: "Momo", icon: Smartphone },
  { value: "bank", label: "Bank", icon: Landmark },
];

// Same deterministic category -> icon set used on the desktop grid, so a
// category shows the same icon on both surfaces.
const CATEGORY_ICONS = [
  Tag,
  Coffee,
  Shirt,
  Home,
  BookOpen,
  Wrench,
  Gift,
  Dumbbell,
  Palette,
  Music,
  Car,
  Baby,
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getCategoryIcon(value: string) {
  if (!value) return Tag;
  return CATEGORY_ICONS[hashString(value) % CATEGORY_ICONS.length];
}

// Mobile-only POS screen. Render this alongside POSProductGridView, each
// hidden at the opposite breakpoint, so only one is ever visible:
//
//   <div className="hidden md:block"><POSProductGridView {...props} /></div>
//   <MobilePOSView {...props} />   {/* has md:hidden built in below */}
//
export function MobilePOSView({
  data,
  totalData,
  categoryList,
}: MobilePOSViewProps) {
  const { settings } = useSettings();
  const {
    cartItems,
    addItemToCart,
    increaseItemQuantity,
    decreaseItemQuantity,
    removeItemFromCart,
    clearCart,
    getTotalItemsBought,
    grandTotal,
  } = useCart();

  const {
    categoriesFilter,
    setCategoriesFilter,
    isAnyFilterActive,
    resetFilters,
    searchQuery,
    setPage,
    page,
    limit = 12,
    setLimit,
    view,
    setView,
    setSearchQuery,
    setStock,
    stock,
  } = useProductTableFilters();

  const [localSearch, setLocalSearch] = useState(searchQuery || "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [customerName, setCustomerName] = useState("Customer");
  const [customerPhone, setCustomerPhone] = useState("0200000000");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [amountPaid, setAmountPaid] = useState("0");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [localStockFilter, setLocalStockFilter] =
    useState<StockFilterValue>("all");
  const stockFilter = stock ?? localStockFilter;
  const setStockFilter = setStock ?? setLocalStockFilter;

  // URL query state for pagination
  const [currentPage, setCurrentPage] = useQueryState(
    "page",
    parseAsInteger
      .withOptions({ shallow: false, history: "push" })
      .withDefault(page),
  );
  const [pageSize, setPageSize] = useQueryState(
    "limit",
    parseAsInteger
      .withOptions({ shallow: false, history: "push" })
      .withDefault(limit),
  );

  useEffect(() => {
    setLocalSearch(searchQuery || "");
  }, [searchQuery]);

  // Default the amount to the exact total every time the sheet opens, same
  // as the desktop payment modal.
  useEffect(() => {
    if (sheetOpen) {
      setAmountPaid(String(grandTotal));
      setSubmitted(false);
    }
  }, [sheetOpen, grandTotal]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    setSearchQuery(val ? val : null);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setLocalSearch("");
    setSearchQuery(null);
    setCurrentPage(1);
  };

  const handleSelectCategory = (value: string | null) => {
    setCategoriesFilter(value);
    setCurrentPage(1);
  };

  const handleStockFilterChange = (val: StockFilterValue) => {
    setStockFilter(val);
    setCurrentPage(1);
  };

  const displayedProducts = useMemo(() => {
    if (stockFilter === "in_stock") {
      return data.filter((p) => (Number(p.stock_quantity) || 0) > 0);
    }
    if (stockFilter === "low_stock") {
      return data.filter((p) => {
        const s = Number(p.stock_quantity) || 0;
        return s > 0 && s <= 5;
      });
    }
    return data;
  }, [data, stockFilter]);

  const cartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cartItems.forEach((item) => map.set(item.id, item.quantity));
    return map;
  }, [cartItems]);

  const pageCount = Math.max(1, Math.ceil(totalData / pageSize));
  const itemsCount = getTotalItemsBought();

  const handleIncreaseQty = (product: ProductCatalogView) => {
    const stock = Number(product.stock_quantity) || 0;
    const currentQty = cartQuantities.get(product.id) || 0;
    if (currentQty >= stock) return;
    if (currentQty > 0) {
      increaseItemQuantity(product.id);
    } else {
      addItemToCart({
        id: product.id,
        name: product.name,
        cost_price: Number(product.cost_price) || 0,
        unit_price: Number(product.unit_price) || 0,
        quantity: 1,
        stock_quantity: stock,
      });
    }
  };

  const handleDecreaseQty = (product: ProductCatalogView) => {
    const currentQty = cartQuantities.get(product.id) || 0;
    if (currentQty <= 0) return;
    if (currentQty === 1) {
      removeItemFromCart(product.id);
    } else {
      decreaseItemQuantity(product.id);
    }
  };

  const balance = Math.max(0, Number(amountPaid || 0) - grandTotal);
  const canConfirm = grandTotal > 0 && Number(amountPaid || 0) >= grandTotal;

  const handlePrintReceipt = (saleData: PaymentInfo) => {
    generateReceiptPDF(
      {
        sale_id: saleData.receipt_number,
        customer_name: saleData?.customer?.name,
        sale_date: saleData?.date || new Date(),
        total_amount: saleData?.totalAmount || grandTotal,
        payment_mode: saleData?.paymentMode || paymentMode,
        status: "completed",
        storeName: settings?.business_name || "",
        storeAddress: settings?.business_address || "",
        storeEmail: settings?.business_email || "",
        storePhone: settings?.business_phone || "",
        logoBase64: settings?.logo || "",
        qrCodeBase64: (saleData as any)?.qrcode,
        attendantName: (saleData as any)?.user_name,
        accentColor: settings?.accent_color,
      },
      (saleData as any)?.products?.map((item: any) => ({
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: Number(item.unit_price) * Number(item.quantity),
      })) || [],
    );
  };

  const handleConfirmPayment = async () => {
    if (!canConfirm) return;
    setLoading(true);
    try {
      const id = _.uniqueId("INVP-");
      const randomNum = randomCode(10);
      const uq = `${id}${randomNum}`;

      const customer: InsertSalesCustomer = {
        name: customerName,
        phonenumber: customerPhone,
      };

      const sales: InsertSales = {
        receipt_number: uq,
        customer,
        total_amount: grandTotal,
        payment_mode: paymentMode,
      };

      const {
        data: saleData,
        success,
        message,
      } = await createProductSales(sales, cartItems);

      if (!success) {
        toast.error("Failed! An error has occurred.", {
          description: message,
          position: "top-right",
          className: "p-4 text-red-600",
        });
        return;
      }

      toast.success("Payment Done!", {
        position: "top-right",
        className: "p-4 text-green-500",
      });

      if (settings?.print_after_sale && saleData) {
        handlePrintReceipt(saleData);
      }

      setSubmitted(true);
      setTimeout(() => {
        clearCart();
        setSheetOpen(false);
      }, 1400);
    } catch (error: any) {
      toast.error("Failed! An error has occurred.", {
        description: error?.message,
        position: "top-right",
        className: "p-4 text-red-600",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative md:hidden flex flex-col h-[100dvh] bg-neutral-50 dark:bg-card">
      {/* Header */}
      <div className="sticky top-0 z-10 space-y-3 border-b bg-white/95 dark:bg-card backdrop-blur px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Point of Sale
            </p>
            <h1 className="text-lg font-extrabold tracking-tight text-foreground">
              Storefront
            </h1>
          </div>
          {(isAnyFilterActive || stockFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-sm text-rose-600 dark:text-rose-400"
              onClick={() => {
                resetFilters();
                setStockFilter("all");
                setCurrentPage(1);
              }}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={localSearch}
            onChange={handleSearchChange}
            placeholder="Search products..."
            className="pl-9 pr-9 h-10 bg-background text-sm"
          />
          {localSearch && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          <button
            type="button"
            onClick={() => handleSelectCategory(null)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition",
              !categoriesFilter
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-muted text-muted-foreground",
            )}
          >
            <LayoutGrid className="h-3 w-3" />
            All
          </button>
          {categoryList.map((cat) => {
            const Icon = getCategoryIcon(cat.value);
            const active = categoriesFilter === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => handleSelectCategory(cat.value)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                  active
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-muted text-muted-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product list */}
      <main className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto px-4 py-3 space-y-2 pb-28">
        {displayedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              No products found
            </p>
          </div>
        ) : (
          displayedProducts.map((product) => {
            const stock = Number(product.stock_quantity) || 0;
            const isOut = stock <= 0;
            const isLow = stock > 0 && stock <= 5;
            const cartQty = cartQuantities.get(product.id) || 0;
            const Icon = getCategoryIcon(product.category_name || "");

            return (
              <div
                key={product.id}
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl border p-2.5 transition-colors",
                  isOut
                    ? "border-dashed bg-muted/30 opacity-60"
                    : cartQty > 0
                      ? "border-primary dark:border-primary bg-muted/20"
                      : "border-muted bg-card",
                )}
              >
                {/* In-cart quantity badge */}
                {cartQty && (
                  <div className="absolute -top-2 -right-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-md">
                    {cartQty}
                  </div>
                )}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight">
                    {product.name}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-sm font-bold tabular-nums">
                      {currencyFormatter(Number(product.unit_price) || 0)}
                    </span>
                    {isOut ? (
                      <span className="rounded-full bg-rose-100 dark:bg-rose-950 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                        Out of stock
                      </span>
                    ) : isLow ? (
                      <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        {stock} left
                      </span>
                    ) : null}
                  </div>
                </div>

                {isOut ? (
                  <span className="text-[11px] font-semibold text-muted-foreground/50 pr-1">
                    N/A
                  </span>
                ) : cartQty > 0 ? (
                  <div className="flex items-center rounded-full border bg-background shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDecreaseQty(product)}
                      className="h-9 w-9 flex items-center justify-center active:scale-90 transition"
                      aria-label={`Remove one ${product.name}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums">
                      {cartQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleIncreaseQty(product)}
                      disabled={cartQty >= stock}
                      className="h-9 w-9 flex items-center justify-center active:scale-90 disabled:opacity-30 transition"
                      aria-label={`Add one ${product.name}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleIncreaseQty(product)}
                    className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black active:scale-90 transition"
                    aria-label={`Add ${product.name} to cart`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })
        )}

        {/* Pagination stays inline in the scroll area — the fixed bottom
            zone belongs to the cart bar. */}
        {pageCount > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t px-1">
            <div className="text-sm text-muted-foreground">
              Showing page {page} of {pageCount} ({totalData} total products)
            </div>

            <div className="w-full flex flex-col sm:flex-row justify-center items-center gap-2">
              {pageSize && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>Per page:</span>
                  <Select
                    value={String(limit)}
                    onValueChange={(val) => {
                      setPageSize(Number(val));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-16 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8</SelectItem>
                      <SelectItem value="12">12</SelectItem>
                      <SelectItem value="24">24</SelectItem>
                      <SelectItem value="48">48</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Prev / Next buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>
                <div className="text-sm font-semibold px-2">
                  {page} / {pageCount}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-sm"
                  onClick={() =>
                    setCurrentPage(Math.min(pageCount, currentPage + 1))
                  }
                  disabled={currentPage >= pageCount}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Cart summary bar — position absolute at the bottom */}
      {itemsCount > 0 && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 border-t bg-white dark:bg-neutral-950 px-4 pt-3"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="w-full flex items-center justify-between rounded-2xl bg-black dark:bg-white text-white dark:text-black px-4 py-3.5 shadow-lg active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/15 dark:bg-black/10 px-1.5 text-sm font-bold">
                {itemsCount}
              </span>
              <div className="text-left leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                  Total
                </p>
                <p className="text-sm font-bold tabular-nums">
                  {currencyFormatter(grandTotal)}
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-sm font-semibold">
              Make Payment
              <ChevronUp className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}

      {/* Payment bottom sheet */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity duration-300",
          sheetOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
        onClick={() => setSheetOpen(false)}
      />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 max-h-[88vh] rounded-t-[28px] bg-white dark:bg-neutral-950 shadow-2xl transition-transform duration-300 ease-out",
          sheetOpen ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-muted" />
        </div>

        {submitted ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-white" strokeWidth={3} />
            </div>
            <h3 className="text-lg font-bold">Payment Successful</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {currencyFormatter(grandTotal)} received via{" "}
              {PAYMENT_MODES.find((m) => m.value === paymentMode)?.label}
            </p>
          </div>
        ) : (
          <div
            className="overflow-y-auto px-5"
            style={{
              maxHeight: "calc(88vh - 28px)",
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
            }}
          >
            {/* Amount to be paid */}
            <div className="rounded-2xl bg-black dark:bg-white px-4 py-4 text-center mt-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60 dark:text-black/50">
                Amount to be Paid
              </p>
              <p className="mt-1 text-3xl font-extrabold text-white dark:text-black tabular-nums">
                {currencyFormatter(grandTotal)}
              </p>
            </div>

            {/* Items */}
            <div className="mt-4">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2">
                Items ({cartItems.length})
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="flex-1 truncate font-medium">
                      {item.name}
                    </span>
                    <div className="flex items-center rounded-full border shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          item.quantity === 1
                            ? removeItemFromCart(item.id)
                            : decreaseItemQuantity(item.id)
                        }
                        className="h-7 w-7 flex items-center justify-center"
                        aria-label={`Remove one ${item.name}`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-4 text-center text-sm font-bold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => increaseItemQuantity(item.id)}
                        className="h-7 w-7 flex items-center justify-center"
                        aria-label={`Add one ${item.name}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="w-16 text-right font-semibold tabular-nums shrink-0">
                      {currencyFormatter(item.unit_price * item.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItemFromCart(item.id)}
                      className="text-muted-foreground/40 hover:text-rose-500 shrink-0"
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Customer
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Phone
                </label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>

            {/* Payment mode */}
            <div className="mt-4">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2">
                Payment Mode
              </p>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_MODES.map(({ value, label, icon: Icon }) => {
                  const active = paymentMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentMode(value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-[10px] font-semibold transition",
                        active
                          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount received */}
            <div className="mt-4">
              <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Amount Received
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                  GHS
                </span>
                <Input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="pl-11 h-11 text-sm font-bold"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">Balance</span>
              <span className="font-bold tabular-nums">
                {currencyFormatter(balance)}
              </span>
            </div>

            <Button
              onClick={handleConfirmPayment}
              disabled={!canConfirm || loading}
              className="mt-5 w-full h-12 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-bold text-sm hover:bg-black/90 dark:hover:bg-white/90"
            >
              {loading ? (
                <>
                  <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Payment"
              )}
            </Button>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-2 w-full h-11 text-sm font-semibold text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
