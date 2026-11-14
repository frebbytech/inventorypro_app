"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import uniqueId from "lodash/uniqueId";
import {
  Banknote,
  Landmark,
  ShoppingCart,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { createProductSales } from "@/actions/sales";
import CartCard from "@/components/custom/CartCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { currencyFormatter } from "@/config/formatter";
import { hasInvalidValues, randomCode } from "@/config/helper";
import useLocalStorage from "@/hooks/useLocalStorage";
import { getPaperConfig } from "@/lib/paperConfig";
import { printReceiptInBrowser } from "@/lib/printReceiptBrowser";
import { renderReceiptHtml } from "@/lib/renderReceipt";
import { cn } from "@/lib/utils";
import { useSettings } from "@/providers/SettingsProvider";
import type {
  InsertSales,
  InsertSalesCustomer,
  PaymentInfo,
  PaymentMode,
  Settings,
} from "@/types/globals";
import type { PaperSizeValue } from "@/types/receipt";
import {
  ReceiptPrinterModal,
  type ReceiptModalData,
} from "@/components/receipts/ReceiptPrinterModal";

import { useCart } from "../providers/cart-provider";
import { Input } from "../ui/input";
import { UserInfo } from "./user-info";

/* -------------------------------------------------------------------------- */
/*  Constants & pure helpers (module scope)                                   */
/* -------------------------------------------------------------------------- */

const PAYMENT_MODES: { value: PaymentMode; label: string; icon: LucideIcon }[] =
  [
    { value: "cash", label: "Cash", icon: Banknote },
    { value: "momo", label: "Mobile money", icon: Smartphone },
    { value: "bank", label: "Bank", icon: Landmark },
    // { value: "cheque", label: "Cheque", icon: Wallet },
  ];

const DEFAULT_CUSTOMER: InsertSalesCustomer = {
  name: "Customer",
  phonenumber: "0200000000",
};

const STORAGE_KEYS_TO_CLEAR = ["order-user-details", "cart", "saved-orders"];

const RECEIPT_DEFAULTS = {
  storeName: "InventoryPro",
  storeAddress: "Plot 15 Block D,Kronum",
  storeEmail: "frebbytechsolutions@gmail.com",
  storePhone: "+233 543 77 2591 | +233 560 37 2844",
  accentColor: "#2f6f4f",
};

/** Money is compared in pesewas so 0.1 + 0.2 style rounding can't reject an exact payment. */
const toCents = (value: number | string) =>
  Math.round((Number(value) || 0) * 100);

/** Snaps a typed amount to 2 decimals once the field is left. */
const roundTo2dp = (value: string) => {
  const num = Number(value);
  return value.trim() === "" || Number.isNaN(num) ? value : num.toFixed(2);
};

const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

function buildReceiptOrder(data: PaymentInfo, settings: Settings | null) {
  const items = data.products.map((item) => ({
    product_name: item.name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: Number(item.unit_price) * Number(item.quantity),
  }));

  return {
    sale_id: data.receipt_number,
    customer_name: data.customer.name,
    sale_date: data.date || new Date(),
    total_amount: data.totalAmount || 0,
    payment_mode: data.paymentMode || "cash",
    status: "completed",
    storeName: settings?.business_name || RECEIPT_DEFAULTS.storeName,
    storeAddress: settings?.business_address || RECEIPT_DEFAULTS.storeAddress,
    storeEmail: settings?.business_email || RECEIPT_DEFAULTS.storeEmail,
    storePhone: settings?.business_phone || RECEIPT_DEFAULTS.storePhone,
    logoBase64: settings?.logo || "",
    qrCodeBase64: data.qrcode,
    attendantName: data?.attendantName || "Cashier",
    accentColor: settings?.accent_color || RECEIPT_DEFAULTS.accentColor,
    items,
  };
}

async function printReceiptForSale(
  data: PaymentInfo,
  settings: Settings | null,
) {
  const paperSize = settings?.paper_size as PaperSizeValue;
  const config = getPaperConfig(paperSize);
  const html = renderReceiptHtml(buildReceiptOrder(data, settings), paperSize);

  if (typeof window !== "undefined" && window.api?.printer) {
    await window.api.printer.printReceipt(
      html,
      settings?.printer_device_name || "",
      {
        width: config.micronsWidth,
        height: config.micronsHeight,
      },
    );
  } else {
    await printReceiptInBrowser(html);
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

const CartSummary = () => {
  const { settings, playStockAlert } = useSettings();
  const { cartItems, grandTotal, getTotalItemsBought, clearCart } = useCart();

  const [savedCustomer] = useLocalStorage(
    "order-user-details",
    DEFAULT_CUSTOMER,
  );
  const [userDetails, setUserDetails] = useState<InsertSalesCustomer>({
    name: savedCustomer?.name ?? DEFAULT_CUSTOMER.name,
    phonenumber: savedCustomer?.phonenumber ?? DEFAULT_CUSTOMER.phonenumber,
  });

  const [loading, setLoading] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false); // mobile-only "view cart" modal
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [amountPaid, setAmountPaid] = useState("0.00");
  const [amountPaidErr, setAmountPaidErr] = useState("");
  const [userErr, setUserErr] = useState("");

  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [receiptModalData, setReceiptModalData] = useState<string | null>(null);
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string>("");
  const [pendingTotal, setPendingTotal] = useState<number>(0);

  const amountInputRef = useRef<HTMLInputElement>(null);
  // Refs, not state: they must be right in the same tick as a key press, before React re-renders.
  const submittingRef = useRef(false);
  const justPaidRef = useRef(false);

  const isEmpty = !cartItems?.length;
  const currency = settings?.currency || "GHS";
  const itemCount = getTotalItemsBought();

  const totalCents = toCents(grandTotal);
  const paidCents = toCents(amountPaid);
  const shortCents = Math.max(0, totalCents - paidCents);
  const changeCents = Math.max(0, paidCents - totalCents);

  // Neither dialog should outlive the cart: a stale `true` on either would
  // pop back open on the next sale, or show an empty items sheet.
  useEffect(() => {
    if (isEmpty) {
      setPaymentOpen(false);
      setItemsOpen(false);
    }
  }, [isEmpty]);

  function openPaymentModal() {
    if (loading || submittingRef.current || isEmpty) return;
    justPaidRef.current = false;
    setUserErr("");
    setAmountPaidErr("");
    setAmountPaid(grandTotal.toFixed(2));
    setItemsOpen(false); // charging from the items sheet shouldn't leave it open behind the payment dialog
    setPaymentOpen(true);
  }

  function handlePaymentOpenChange(next: boolean) {
    if (loading) return; // don't let the dialog close mid-payment
    setPaymentOpen(next);
  }

  function setExactAmount() {
    setAmountPaid(grandTotal.toFixed(2));
    setAmountPaidErr("");
  }

  function handleSubmitOrder() {
    if (submittingRef.current || isEmpty) return;

    setUserErr("");
    setAmountPaidErr("");

    if (hasInvalidValues(userDetails)) {
      setUserErr("Add the customer's name and phone number.");
      return;
    }
    if (paidCents <= 0) {
      setAmountPaidErr("Enter the amount paid.");
      return;
    }
    if (paidCents < totalCents) {
      setAmountPaidErr(
        `That's ${currencyFormatter(shortCents / 100)} short of the total.`,
      );
      return;
    }

    void processPayment();
  }

  async function processPayment() {
    submittingRef.current = true;
    setLoading(true);
    const receiptNo = `${uniqueId("INVP-")}${randomCode(10)}`;
    setPaymentOpen(false);
    setReceiptModalData(null);
    setPendingInvoiceId(receiptNo);
    setPendingTotal(grandTotal);
    setPrinterModalOpen(true);

    try {
      const sales: InsertSales = {
        receipt_number: receiptNo,
        customer: userDetails,
        total_amount: grandTotal,
        payment_mode: paymentMode,
      };

      const { data, success, message } = await createProductSales(
        sales,
        cartItems,
      );

      if (!success) {
        setPrinterModalOpen(false);
        toast.error("Payment failed", {
          description: message,
          position: "top-right",
        });
        return;
      }

      if (data && settings?.print_after_sale) {
        printReceipt(data);
        const html = renderReceiptHtml(
          buildReceiptOrder(data, settings),
          "thermal_80mm",
        );
        setReceiptModalData(html);

    
        //   sale_id: data.receipt_number,
        //   customer_name: data?.customer?.name || "Walk-in",
        //   customer_phone: data?.customer?.phonenumber,
        //   sale_date: data?.date || new Date().toISOString(),
        //   total_amount: Number(data?.totalAmount || 0),
        //   amount_paid: Number(data?.amountPaid || 0),
        //   balance: Number(data?.balance || 0),
        //   payment_mode: data?.paymentMode || "cash",
        //   status: "completed",
        //   attendantName: (data as any)?.user_name || "Cashier",
        //   qrCodeBase64: data?.qrcode,
        //   items: data.products,
        // });
      } else {
        toast.success("Payment recorded", { position: "top-right" });
      }

      // The sale is saved. Close and clear straight away, before anything that
      // can fail (alerts, printing), so a later error can never leave a paid-for
      // cart on screen or invite a second payment.
      justPaidRef.current = true;
      setPaymentOpen(false);
      setItemsOpen(false);
      setAmountPaid("0.00");
      clearCart();

      if (data?.lowStockAlerts?.length) {
        playStockAlert();
        data.lowStockAlerts.forEach((alert) => {
          toast.warning(`${alert.name} is running low`, {
            description: `${alert.remainingStock} left (threshold ${alert.threshold}).`,
            position: "top-right",
            duration: 6000,
          });
        });
      }
    } catch (error) {
      toast.error("Payment failed", {
        description: errorMessage(error, "Something went wrong. Try again."),
        position: "top-right",
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setPaymentOpen(false);
    }
  }

  // Printing is separate from payment: a print failure must not look like a failed sale.
  async function printReceipt(data: PaymentInfo) {
    try {
      await printReceiptForSale(data, settings);
    } catch (error) {
      console.error("Error printing receipt:", error);
      toast.error("Receipt didn't print", {
        description:
          "The payment was saved, but the receipt couldn't be printed.",
        position: "top-right",
      });
    }
  }

  function confirmCancelOrder() {
    clearCart();
    setUserDetails(DEFAULT_CUSTOMER);
    STORAGE_KEYS_TO_CLEAR.forEach((key) => localStorage.removeItem(key));
    setCancelOpen(false);
    setItemsOpen(false);
  }

  const cartItemsList = (
    <ul className="divide-y">
      {cartItems.map((item) => (
        <CartCard key={item.id} item={item} />
      ))}
    </ul>
  );

  return (
    <>
      <section
        aria-label="Cart"
        className="flex h-full  max-h-[85svh] min-h-0 flex-col rounded-xl border bg-card"
      >
        <header className="hidden md:flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Cart</h2>
            <p className="text-sm text-muted-foreground">
              {isEmpty ? "No items yet" : pluralize(itemCount, "item")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={loading || isEmpty}
            onClick={() => setCancelOpen(true)}
          >
            Cancel order
          </Button>
        </header>

        {/* Full item list: only on screens wide enough to show cart + catalogue side by
            side. On narrower screens the list moves into the "view items" sheet below,
            since there isn't room for it inline next to the product grid. */}
        <div className="hidden min-h-0 flex-1 overflow-y-auto md:block">
          {isEmpty ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-1 p-6 text-center">
              <ShoppingCart aria-hidden />
              <p className="text-sm font-medium">Your cart is empty</p>
              <p className="text-sm text-muted-foreground">
                Add a product to start a sale.
              </p>
            </div>
          ) : (
            cartItemsList
          )}
        </div>

        {/* Desktop footer: sits at the bottom of this panel, in normal flow. */}
        <footer className="hidden space-y-4 border-t px-4 py-4 md:block">
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Items</dt>
              <dd className="tabular-nums">{itemCount}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-medium">Total</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">
                {currencyFormatter(grandTotal)}
              </dd>
            </div>
          </dl>

          <Button
            size="lg"
            className="w-full"
            disabled={loading || isEmpty}
            onClick={openPaymentModal}
            onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
              if (e.repeat) e.preventDefault();
            }}
          >
            {loading
              ? "Processing…"
              : isEmpty
                ? "Charge"
                : `Charge ${currencyFormatter(grandTotal)}`}
          </Button>
        </footer>
      </section>

      {/* Mobile footer: fixed to the bottom of the viewport, since there's no
          room to show the cart as a panel alongside the product grid here. */}
      <footer
        className="fixed inset-x-0 bottom-0 z-40 space-y-2 border-t bg-card px-4 pt-3 shadow-[0_-2px_12px_rgb(0_0_0_/_0.06)] md:hidden"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <button
          type="button"
          onClick={() => setItemsOpen(true)}
          disabled={isEmpty}
          className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left disabled:opacity-60"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ShoppingCart
              aria-hidden
              className="size-4 text-muted-foreground"
            />
            {isEmpty ? "Cart is empty" : `View ${pluralize(itemCount, "item")}`}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {currencyFormatter(grandTotal)}
          </span>
        </button>

        <Button
          size="lg"
          className="w-full"
          disabled={loading || isEmpty}
          onClick={openPaymentModal}
          onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
            if (e.repeat) e.preventDefault();
          }}
        >
          {loading
            ? "Processing…"
            : isEmpty
              ? "Charge"
              : `Charge ${currencyFormatter(grandTotal)}`}
        </Button>
      </footer>

      {/* View cart items (mobile only) */}
      <Dialog open={itemsOpen} onOpenChange={setItemsOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b px-6 py-4 text-left">
            <DialogTitle>
              {isEmpty ? "Cart" : pluralize(itemCount, "item")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Items currently in the cart.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center gap-1 p-6 text-center">
                <ShoppingCart aria-hidden />
                <p className="text-sm font-medium">Your cart is empty</p>
              </div>
            ) : (
              cartItemsList
            )}
          </div>

          <DialogFooter className="flex-col gap-2 border-t px-6 py-4 sm:flex-col">
            <div className="flex w-full items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-semibold tabular-nums">
                {currencyFormatter(grandTotal)}
              </span>
            </div>
            <Button
              size="lg"
              className="w-full"
              disabled={loading || isEmpty}
              onClick={openPaymentModal}
            >
              {isEmpty ? "Charge" : `Charge ${currencyFormatter(grandTotal)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment */}
      <Dialog open={paymentOpen} onOpenChange={handlePaymentOpenChange}>
        <DialogContent
          className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md"
          // Put the cursor on the amount, ready to type over the exact total.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            amountInputRef.current?.focus();
            amountInputRef.current?.select();
          }}
          // After a sale, don't hand focus back to the Charge button: a repeated
          // Enter or Space would activate it and reopen this dialog.
          onCloseAutoFocus={(e) => {
            if (justPaidRef.current) {
              e.preventDefault();
              justPaidRef.current = false;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "F2") {
              e.preventDefault();
              setExactAmount();
            }
          }}
        >
          <DialogHeader className="border-b px-6 py-4 text-left">
            <DialogTitle>Take payment</DialogTitle>
            <DialogDescription>
              Confirm the customer and how they're paying.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto divide-y">
            <div className="flex items-baseline justify-between gap-4 px-6 py-5">
              <span className="text-sm text-muted-foreground">Amount due</span>
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {currencyFormatter(grandTotal)}
              </span>
            </div>

            <div className="space-y-2 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Customer</p>
                <UserInfo setUser={setUserDetails} user={userDetails} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="truncate">{userDetails?.name}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="tabular-nums">{userDetails?.phonenumber}</dd>
              </dl>
              {userErr && (
                <p role="alert" className="text-sm text-destructive">
                  {userErr}
                </p>
              )}
            </div>

            <div className="space-y-2 px-6 py-4">
              <p id="payment-method-label" className="text-sm font-medium">
                Payment method
              </p>
              <div
                role="radiogroup"
                aria-labelledby="payment-method-label"
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {PAYMENT_MODES.map(({ value, label, icon: Icon }) => (
                  <label key={value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="payment-mode"
                      value={value}
                      checked={paymentMode === value}
                      onChange={() => setPaymentMode(value)}
                      className="peer sr-only"
                    />
                    <span className="flex h-full flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center text-sm transition-colors hover:bg-muted/40 peer-checked:border-primary peer-checked:font-medium peer-checked:ring-2 peer-checked:ring-primary/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="amount-paid" className="text-sm font-medium">
                  Amount paid
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={setExactAmount}
                >
                  Exact amount (F2)
                </Button>
              </div>

              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground select-none">
                  {currency}
                </span>
                <Input
                  id="amount-paid"
                  ref={amountInputRef}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  value={amountPaid}
                  aria-invalid={!!amountPaidErr}
                  aria-describedby={
                    amountPaidErr ? "amount-paid-error" : undefined
                  }
                  onChange={(e) => setAmountPaid(e.target.value)}
                  onBlur={() =>
                    setAmountPaid((prev) =>
                      roundTo2dp(prev === "" ? "0" : prev),
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmitOrder();
                    }
                  }}
                  className="pl-12 tabular-nums"
                />
              </div>
              {amountPaidErr && (
                <p
                  id="amount-paid-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {amountPaidErr}
                </p>
              )}

              <div
                aria-live="polite"
                className="flex items-baseline justify-between text-sm"
              >
                <span className="text-muted-foreground">
                  {shortCents > 0 ? "Still owed" : "Change due"}
                </span>
                <span
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    shortCents > 0 && "text-destructive",
                  )}
                >
                  {currencyFormatter(
                    (shortCents > 0 ? shortCents : changeCents) / 100,
                  )}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPaymentOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              className="dark:text-white"
              onClick={handleSubmitOrder}
              disabled={loading}
            >
              {loading ? "Processing…" : "Confirm payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel order */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              This removes every item from the cart and clears the customer
              details.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="destructive" onClick={confirmCancelOrder}>
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptPrinterModal
        open={printerModalOpen}
        onOpenChange={setPrinterModalOpen}
        receiptData={receiptModalData}
        processingInvoiceId={pendingInvoiceId}
        processingTotal={pendingTotal}
        autoTriggerPrint={true}
      />
    </>
  );
};

export default CartSummary;
