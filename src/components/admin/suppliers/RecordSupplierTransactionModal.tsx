"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { getCategories } from "@/actions/product-category";
import { getProducts } from "@/actions/products";
import { createSupplierTransaction } from "@/actions/supplier-transactions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { currencyFormatter } from "@/config/formatter";
import { cn } from "@/lib/utils";
import type { InsertSupplierTransactionItem } from "@/types/globals";
import { supplierOptionsQuery, supplierTransactionKeys } from "./supplier-transaction-queries";

interface RecordSupplierTransactionModalProps {
  initialSupplierId?: string;
  trigger?: ReactNode;
  onSuccess?: () => void;
}

type ItemRow = InsertSupplierTransactionItem & { key: string };

interface FormState {
  supplierId: string;
  deliveredBy: string;
  transactionDate: string; // "" until the dialog is first opened, then "now"
  paymentMode: string;
  status: string;
  notes: string;
  /** null means "paid in full": the amount follows the total. */
  amountPaidOverride: number | null;
}

interface ProductOption {
  id: string;
  name?: string;
  product_name?: string;
  category_name?: string;
  cost_price?: number | string;
}

interface CategoryOption {
  id?: string;
  name: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants & pure helpers (module scope)                                   */
/* -------------------------------------------------------------------------- */

const PACKAGING_TYPES = [
  { label: "Boxes", value: "boxes" },
  { label: "Sachets", value: "sachets" },
  { label: "Packs", value: "packs" },
  { label: "Cartons", value: "cartons" },
  { label: "Pieces", value: "pieces" },
  { label: "Units", value: "units" },
  { label: "Bottles", value: "bottles" },
  { label: "Bags", value: "bags" },
];

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cheque", label: "Cheque" },
  { value: "credit", label: "Credit (payable)" },
];

const STATUSES = [
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending delivery" },
  { value: "partially_paid", label: "Partially paid" },
];

const NO_PRODUCTS: ProductOption[] = [];
const NO_CATEGORIES: CategoryOption[] = [];

const PRODUCT_LIST_ID = "supplier-txn-products";
const CATEGORY_LIST_ID = "supplier-txn-categories";

let itemCounter = 0;
const makeKey = () => `item-${++itemCounter}`;

const round2 = (value: number) => Math.round(value * 100) / 100;

const lineTotal = (item: Pick<ItemRow, "quantity" | "unit_price">) =>
  round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0));

const withTotal = (item: ItemRow): ItemRow => ({ ...item, total_price: lineTotal(item) });

function createBlankItem(): ItemRow {
  return {
    key: makeKey(),
    product_id: "",
    product_name: "",
    category_name: "",
    product_type: "boxes",
    quantity: 1,
    unit_price: 0,
    total_price: 0,
  };
}

const createInitialForm = (supplierId?: string): FormState => ({
  supplierId: supplierId || "",
  deliveredBy: "",
  transactionDate: "",
  paymentMode: "cash",
  status: "completed",
  notes: "",
  amountPaidOverride: null,
});

/** The value a datetime-local input expects, in the user's own timezone (toISOString would give UTC). */
function toLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const TH = "px-2 py-2 font-medium";

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function RecordSupplierTransactionModal({
  initialSupplierId,
  trigger,
  onSuccess,
}: RecordSupplierTransactionModalProps) {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => createInitialForm(initialSupplierId));
  const [items, setItems] = useState<ItemRow[]>(() => [createBlankItem()]);
  const [showErrors, setShowErrors] = useState(false);

  /* ---- data: fetched only while the dialog is open, then cached ---- */

  const suppliersQuery = useQuery({ ...supplierOptionsQuery(), enabled: open });

  const productsQuery = useQuery({
    queryKey: supplierTransactionKeys.productOptions,
    queryFn: async () => {
      const res = await getProducts();
      if (!res.success) throw new Error(res.message || "Couldn't load products.");
      return (res.data ?? NO_PRODUCTS) as ProductOption[];
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const categoriesQuery = useQuery({
    queryKey: supplierTransactionKeys.categoryOptions,
    queryFn: async () => {
      const res = await getCategories();
      if (!res.success) throw new Error(res.message || "Couldn't load categories.");
      return (res.data ?? NO_CATEGORIES) as CategoryOption[];
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });

  // Product and category suggestions are a convenience: if they fail to load,
  // free typing still works, so their errors are not surfaced.
  const suppliers = suppliersQuery.data ?? [];
  const products = productsQuery.data ?? NO_PRODUCTS;
  const categories = categoriesQuery.data ?? NO_CATEGORIES;

  const productsByName = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const product of products) {
      const name = (product.name || product.product_name || "").trim();
      if (name) map.set(name.toLowerCase(), product);
    }
    return map;
  }, [products]);

  /* ---- save ---- */

  const createMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof createSupplierTransaction>[0]) => {
      const res = await createSupplierTransaction(payload);
      if (!res.success) throw new Error(res.message || "Failed to record the transaction.");
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message || "Supplier transaction recorded");
      setOpen(false);
      setForm(createInitialForm(initialSupplierId));
      setItems([createBlankItem()]);
      setShowErrors(false);
      onSuccess?.();
    },
    onError: (err) => {
      toast.error("Couldn't record the transaction", { description: err.message });
    },
    // Refreshes the listing page (and any other list) whether or not this succeeded.
    onSettled: () => queryClient.invalidateQueries({ queryKey: supplierTransactionKeys.lists }),
  });

  const isSaving = createMutation.isPending;

  /* ---- derived values ---- */

  const totalAmount = useMemo(
    () => round2(items.reduce((sum, item) => sum + lineTotal(item), 0)),
    [items]
  );
  const amountPaid = form.amountPaidOverride ?? totalAmount;
  const balance = round2(totalAmount - amountPaid);

  const errors = useMemo(() => {
    const itemErrors: Record<string, string> = {};
    for (const item of items) {
      if (!item.product_name.trim()) itemErrors[item.key] = "Enter a product name.";
    }
    return {
      supplier: form.supplierId ? undefined : "Choose a supplier.",
      items: itemErrors,
    };
  }, [items, form.supplierId]);

  const hasErrors = Boolean(errors.supplier) || Object.keys(errors.items).length > 0;

  /* ---- handlers ---- */

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(next: boolean) {
    if (isSaving) return;
    setOpen(next);
    // The date is "now" at the moment the dialog opens, not when the page loaded.
    if (next && !form.transactionDate) setField("transactionDate", toLocalInputValue(new Date()));
  }

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((item) => (item.key === key ? withTotal({ ...item, ...patch }) : item)));
  }

  /** One field for name: typing an existing product's name links it and fills in its details. */
  function handleProductName(key: string, name: string) {
    const match = productsByName.get(name.trim().toLowerCase());

    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        if (!match) return withTotal({ ...item, product_name: name, product_id: "" });

        // Fill in details only when the product is first matched, so later edits are never overwritten.
        const isNewMatch = item.product_id !== match.id;
        return withTotal({
          ...item,
          product_name: name,
          product_id: match.id,
          ...(isNewMatch
            ? {
                category_name: match.category_name || item.category_name || "",
                unit_price: match.cost_price ? Number(match.cost_price) : item.unit_price,
              }
            : {}),
        });
      })
    );
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.key !== key)));
  }

  // Enter in a text box shouldn't submit (and record) the whole transaction by accident.
  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    setShowErrors(true);
    if (hasErrors) return;

    createMutation.mutate({
      supplier_id: form.supplierId,
      delivered_by: form.deliveredBy.trim(),
      transaction_date: form.transactionDate,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      balance,
      payment_mode: form.paymentMode,
      status: form.status,
      notes: form.notes.trim(),
      items: items.map((item) => ({
        product_id: item.product_id || undefined,
        product_name: item.product_name.trim(),
        category_name: item.category_name?.trim() || undefined,
        product_type: item.product_type || "boxes",
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        total_price: lineTotal(item),
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger || <Button>Record transaction</Button>}</DialogTrigger>

      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle>Record supplier transaction</DialogTitle>
          <DialogDescription>
            Log a delivery: what was supplied, what it cost and how it was paid.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-5">
            {/* Delivery */}
            <section aria-labelledby="delivery-heading" className="space-y-4">
              <h3 id="delivery-heading" className="text-sm font-medium">
                Delivery
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Supplier"
                  htmlFor="txn-supplier"
                  error={
                    showErrors && errors.supplier
                      ? errors.supplier
                      : suppliersQuery.isError
                        ? "Couldn't load suppliers."
                        : undefined
                  }
                >
                  <Select value={form.supplierId} onValueChange={(v) => setField("supplierId", v)}>
                    <SelectTrigger
                      id="txn-supplier"
                      className="w-full"
                      aria-invalid={showErrors && !!errors.supplier}
                    >
                      <SelectValue
                        placeholder={suppliersQuery.isPending && open ? "Loading suppliers…" : "Choose a supplier"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                          {supplier.company_name ? ` (${supplier.company_name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Delivered by" htmlFor="txn-delivered-by">
                  <Input
                    id="txn-delivered-by"
                    placeholder="Driver or agent name"
                    value={form.deliveredBy}
                    onChange={(e) => setField("deliveredBy", e.target.value)}
                  />
                </Field>

                <Field label="Date and time" htmlFor="txn-date">
                  <Input
                    id="txn-date"
                    type="datetime-local"
                    value={form.transactionDate}
                    onChange={(e) => setField("transactionDate", e.target.value)}
                  />
                </Field>
              </div>
            </section>

            {/* Items */}
            <section aria-labelledby="items-heading" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 id="items-heading" className="text-sm font-medium">
                  Items supplied
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems((prev) => [...prev, createBlankItem()])}
                >
                  Add item
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[52rem] border-collapse text-sm">
                  <thead className="bg-muted text-left text-muted-foreground">
                    <tr className="border-b">
                      <th scope="col" className={cn(TH, "min-w-52")}>Product</th>
                      <th scope="col" className={cn(TH, "min-w-40")}>Category</th>
                      <th scope="col" className={cn(TH, "w-36")}>Packaging</th>
                      <th scope="col" className={cn(TH, "w-24 text-right")}>Qty</th>
                      <th scope="col" className={cn(TH, "w-32 text-right")}>Unit price</th>
                      <th scope="col" className={cn(TH, "w-32 text-right")}>Total</th>
                      <th scope="col" className={cn(TH, "w-12")}>
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const error = showErrors ? errors.items[item.key] : undefined;
                      const label = `Item ${index + 1}`;

                      return (
                        <tr key={item.key} className="border-b align-top last:border-b-0">
                          <td className="px-2 py-2">
                            <Input
                              list={PRODUCT_LIST_ID}
                              aria-label={`${label} product`}
                              aria-invalid={!!error}
                              placeholder="Type or pick a product"
                              value={item.product_name}
                              onChange={(e) => handleProductName(item.key, e.target.value)}
                            />
                            {error && (
                              <p role="alert" className="mt-1 text-xs text-destructive">
                                {error}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              list={CATEGORY_LIST_ID}
                              aria-label={`${label} category`}
                              placeholder="e.g. Beverages"
                              value={item.category_name || ""}
                              onChange={(e) => updateItem(item.key, { category_name: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Select
                              value={item.product_type}
                              onValueChange={(value) => updateItem(item.key, { product_type: value })}
                            >
                              <SelectTrigger aria-label={`${label} packaging`} className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PACKAGING_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              aria-label={`${label} quantity`}
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(item.key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                              }
                              className="text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min={0}
                              aria-label={`${label} unit price`}
                              value={item.unit_price}
                              onChange={(e) =>
                                updateItem(item.key, { unit_price: Math.max(0, parseFloat(e.target.value) || 0) })
                              }
                              className="text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                            {currencyFormatter(lineTotal(item))}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 text-muted-foreground hover:text-destructive"
                              disabled={items.length <= 1}
                              onClick={() => removeItem(item.key)}
                            >
                              <Trash2 aria-hidden className="size-4" />
                              <span className="sr-only">Remove {label.toLowerCase()}</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* One shared list of suggestions for every row */}
              <datalist id={PRODUCT_LIST_ID}>
                {products.map((product) => {
                  const name = product.name || product.product_name;
                  return name ? <option key={product.id} value={name} /> : null;
                })}
              </datalist>
              <datalist id={CATEGORY_LIST_ID}>
                {categories.map((category) => (
                  <option key={category.id ?? category.name} value={category.name} />
                ))}
              </datalist>
            </section>

            {/* Payment */}
            <section aria-labelledby="payment-heading" className="space-y-4">
              <h3 id="payment-heading" className="text-sm font-medium">
                Payment
              </h3>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Payment mode" htmlFor="txn-payment-mode">
                      <Select value={form.paymentMode} onValueChange={(v) => setField("paymentMode", v)}>
                        <SelectTrigger id="txn-payment-mode" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_MODES.map((mode) => (
                            <SelectItem key={mode.value} value={mode.value}>
                              {mode.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Status" htmlFor="txn-status">
                      <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                        <SelectTrigger id="txn-status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field label="Notes or invoice reference" htmlFor="txn-notes">
                    <Textarea
                      id="txn-notes"
                      rows={3}
                      placeholder="Invoice number, batch number or notes"
                      value={form.notes}
                      onChange={(e) => setField("notes", e.target.value)}
                      className="resize-none"
                    />
                  </Field>
                </div>

                <dl className="space-y-3 self-start rounded-lg border bg-muted/30 p-4 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="text-lg font-semibold tabular-nums">{currencyFormatter(totalAmount)}</dd>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <dt>
                      <Label htmlFor="txn-amount-paid">Amount paid</Label>
                    </dt>
                    <dd className="flex items-center gap-2">
                      {form.amountPaidOverride !== null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setField("amountPaidOverride", null)}
                        >
                          Pay in full
                        </Button>
                      )}
                      <Input
                        id="txn-amount-paid"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={amountPaid}
                        onChange={(e) => setField("amountPaidOverride", Math.max(0, parseFloat(e.target.value) || 0))}
                        className="h-9 w-32 text-right tabular-nums"
                      />
                    </dd>
                  </div>

                  <div className="flex items-baseline justify-between gap-4 border-t pt-3">
                    <dt className="text-muted-foreground">Balance due</dt>
                    <dd
                      aria-live="polite"
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        balance > 0 ? "text-destructive" : "text-foreground"
                      )}
                    >
                      {currencyFormatter(balance)}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
          </div>

          <DialogFooter className="items-center gap-3 border-t px-6 py-4 sm:justify-between">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {showErrors && hasErrors ? (
                <span className="text-destructive">Fix the highlighted fields to continue.</span>
              ) : (
                <>
                  Total <span className="font-medium text-foreground tabular-nums">{currencyFormatter(totalAmount)}</span>
                </>
              )}
            </p>

            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save transaction"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// "use client";

// import React, { useState, useEffect } from "react";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Textarea } from "@/components/ui/textarea";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Plus, Trash2, Truck, Package, Calendar, DollarSign, UserCheck } from "lucide-react";
// import { toast } from "sonner";
// import { createSupplierTransaction } from "@/actions/supplier-transactions";
// import { getSuppliers } from "@/actions/suppliers";
// import { getProducts } from "@/actions/products";
// import { getCategories } from "@/actions/product-category";
// import { SupplierInfoView, InsertSupplierTransactionItem } from "@/types/globals";

// const PACKAGING_TYPES = [
//   { label: "Boxes", value: "boxes" },
//   { label: "Sachets", value: "sachets" },
//   { label: "Packs", value: "packs" },
//   { label: "Cartons", value: "cartons" },
//   { label: "Pieces", value: "pieces" },
//   { label: "Units", value: "units" },
//   { label: "Bottles", value: "bottles" },
//   { label: "Bags", value: "bags" },
// ];

// interface RecordSupplierTransactionModalProps {
//   initialSupplierId?: string;
//   trigger?: React.ReactNode;
//   onSuccess?: () => void;
// }

// export default function RecordSupplierTransactionModal({
//   initialSupplierId,
//   trigger,
//   onSuccess,
// }: RecordSupplierTransactionModalProps) {
//   const [open, setOpen] = useState(false);
//   const [loading, setLoading] = useState(false);

//   // Form states
//   const [suppliers, setSuppliers] = useState<SupplierInfoView[]>([]);
//   const [existingProducts, setExistingProducts] = useState<any[]>([]);
//   const [existingCategories, setExistingCategories] = useState<any[]>([]);

//   const [selectedSupplierId, setSelectedSupplierId] = useState<string>(initialSupplierId || "");
//   const [deliveredBy, setDeliveredBy] = useState<string>("");
//   const [transactionDate, setTransactionDate] = useState<string>(
//     new Date().toISOString().slice(0, 16)
//   );
//   const [paymentMode, setPaymentMode] = useState<string>("cash");
//   const [status, setStatus] = useState<string>("completed");
//   const [notes, setNotes] = useState<string>("");

//   // Items state
//   const [items, setItems] = useState<
//     (InsertSupplierTransactionItem & { key: string })[]
//   >([
//     {
//       key: "1",
//       product_id: "",
//       product_name: "",
//       category_name: "",
//       product_type: "boxes",
//       quantity: 1,
//       unit_price: 0,
//       total_price: 0,
//     },
//   ]);

//   const [amountPaid, setAmountPaid] = useState<number>(0);
//   const [customAmountPaid, setCustomAmountPaid] = useState<boolean>(false);

//   // Load dropdown resources
//   useEffect(() => {
//     if (open) {
//       async function loadData() {
//         try {
//           const [supRes, prodRes, catRes] = await Promise.all([
//             getSuppliers(),
//             getProducts(),
//             getCategories(),
//           ]);

//           if (supRes.success && supRes.data) {
//             setSuppliers(supRes.data);
//             if (!selectedSupplierId && supRes.data.length > 0) {
//               setSelectedSupplierId(initialSupplierId || supRes.data[0].id);
//             }
//           }

//           if (prodRes.success && prodRes.data) {
//             setExistingProducts(prodRes.data);
//           }

//           if (catRes.success && catRes.data) {
//             setExistingCategories(catRes.data);
//           }
//         } catch (err) {
//           console.error("Error loading dropdown data:", err);
//         }
//       }
//       loadData();
//     }
//   }, [open, initialSupplierId, selectedSupplierId]);

//   // Calculate total amount
//   const totalAmount = items.reduce((acc, item) => {
//     return acc + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
//   }, 0);

//   // Sync amount paid if user hasn't explicitly set custom amount
//   useEffect(() => {
//     if (!customAmountPaid) {
//       setAmountPaid(totalAmount);
//     }
//   }, [totalAmount, customAmountPaid]);

//   const balance = totalAmount - amountPaid;

//   const handleAddItem = () => {
//     setItems((prev) => [
//       ...prev,
//       {
//         key: Date.now().toString(),
//         product_id: "",
//         product_name: "",
//         category_name: "",
//         product_type: "boxes",
//         quantity: 1,
//         unit_price: 0,
//         total_price: 0,
//       },
//     ]);
//   };

//   const handleRemoveItem = (key: string) => {
//     if (items.length <= 1) {
//       toast.error("At least one product item is required.");
//       return;
//     }
//     setItems((prev) => prev.filter((i) => i.key !== key));
//   };

//   const handleItemChange = (
//     key: string,
//     field: keyof InsertSupplierTransactionItem,
//     value: any
//   ) => {
//     setItems((prev) =>
//       prev.map((item) => {
//         if (item.key !== key) return item;

//         const updated = { ...item, [field]: value };

//         // Auto-fill from existing product selection
//         if (field === "product_id" && value) {
//           const selectedProd = existingProducts.find((p) => p.id === value);
//           if (selectedProd) {
//             updated.product_name = selectedProd.name || selectedProd.product_name || "";
//             updated.category_name = selectedProd.category_name || "";
//             if (selectedProd.cost_price) {
//               updated.unit_price = Number(selectedProd.cost_price);
//             }
//           }
//         }

//         // Recalculate line total
//         const qty = Number(updated.quantity) || 0;
//         const price = Number(updated.unit_price) || 0;
//         updated.total_price = qty * price;

//         return updated;
//       })
//     );
//   };

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();

//     if (!selectedSupplierId) {
//       toast.error("Please select a supplier.");
//       return;
//     }

//     // Validate items
//     for (let i = 0; i < items.length; i++) {
//       const item = items[i];
//       if (!item.product_name.trim()) {
//         toast.error(`Item #${i + 1} requires a product name.`);
//         return;
//       }
//       if (item.quantity <= 0) {
//         toast.error(`Item #${i + 1} quantity must be greater than 0.`);
//         return;
//       }
//     }

//     setLoading(true);
//     try {
//       const res = await createSupplierTransaction({
//         supplier_id: selectedSupplierId,
//         delivered_by: deliveredBy,
//         transaction_date: transactionDate,
//         total_amount: totalAmount,
//         amount_paid: amountPaid,
//         balance: balance,
//         payment_mode: paymentMode,
//         status: status,
//         notes: notes,
//         items: items.map((item) => ({
//           product_id: item.product_id || undefined,
//           product_name: item.product_name,
//           category_name: item.category_name || undefined,
//           product_type: item.product_type || "boxes",
//           quantity: Number(item.quantity) || 1,
//           unit_price: Number(item.unit_price) || 0,
//           total_price: (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
//         })),
//       });

//       if (res.success) {
//         toast.success(res.message || "Supplier transaction recorded!");
//         setOpen(false);

//         // Reset fields
//         setDeliveredBy("");
//         setNotes("");
//         setItems([
//           {
//             key: "1",
//             product_id: "",
//             product_name: "",
//             category_name: "",
//             product_type: "boxes",
//             quantity: 1,
//             unit_price: 0,
//             total_price: 0,
//           },
//         ]);
//         setCustomAmountPaid(false);

//         if (onSuccess) onSuccess();
//       } else {
//         toast.error(res.message || "Failed to record transaction.");
//       }
//     } catch (err: any) {
//       toast.error(err.message || "An unexpected error occurred.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <Dialog open={open} onOpenChange={setOpen}>
//       <DialogTrigger asChild>
//         {trigger || (
//           <Button className="gap-2">
//             <Plus className="h-4 w-4" />
//             Record Supplier Transaction
//           </Button>
//         )}
//       </DialogTrigger>
//       <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2 text-xl">
//             <Truck className="h-5 w-5 text-primary" />
//             Record Supplier Transaction
//           </DialogTitle>
//           <DialogDescription>
//             Record products supplied, delivery details, quantities, packaging types, and payment terms.
//           </DialogDescription>
//         </DialogHeader>

//         <form onSubmit={handleSubmit} className="space-y-6 pt-2">
//           {/* Header Metadata Section */}
//           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/40 border">
//             {/* Supplier Selection */}
//             <div className="space-y-1.5">
//               <Label className="text-xs font-semibold flex items-center gap-1">
//                 <Truck className="h-3.5 w-3.5 text-muted-foreground" />
//                 Supplier <span className="text-destructive">*</span>
//               </Label>
//               <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
//                 <SelectTrigger className="h-9">
//                   <SelectValue placeholder="Select Supplier" />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {suppliers.map((sup) => (
//                     <SelectItem key={sup.id} value={sup.id}>
//                       {sup.name} {sup.company_name ? `(${sup.company_name})` : ""}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>

//             {/* Delivered By */}
//             <div className="space-y-1.5">
//               <Label className="text-xs font-semibold flex items-center gap-1">
//                 <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
//                 Delivered By
//               </Label>
//               <Input
//                 placeholder="Driver or Agent Name"
//                 value={deliveredBy}
//                 onChange={(e) => setDeliveredBy(e.target.value)}
//                 className="h-9"
//               />
//             </div>

//             {/* Transaction Date */}
//             <div className="space-y-1.5">
//               <Label className="text-xs font-semibold flex items-center gap-1">
//                 <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
//                 Transaction Date
//               </Label>
//               <Input
//                 type="datetime-local"
//                 value={transactionDate}
//                 onChange={(e) => setTransactionDate(e.target.value)}
//                 className="h-9"
//               />
//             </div>
//           </div>

//           {/* Products Supplied Table / Multi-row */}
//           <div className="space-y-3">
//             <div className="flex items-center justify-between">
//               <h3 className="text-sm font-semibold flex items-center gap-2">
//                 <Package className="h-4 w-4 text-primary" />
//                 Products Supplied Details
//               </h3>
//               <Button
//                 type="button"
//                 variant="outline"
//                 size="sm"
//                 onClick={handleAddItem}
//                 className="h-8 gap-1 text-xs"
//               >
//                 <Plus className="h-3.5 w-3.5" />
//                 Add Item
//               </Button>
//             </div>

//             <div className="border rounded-lg overflow-x-auto">
//               <table className="w-full text-xs">
//                 <thead className="bg-muted/70 text-muted-foreground font-semibold border-b">
//                   <tr>
//                     <th className="p-2.5 text-left min-w-[180px]">Product Name</th>
//                     <th className="p-2.5 text-left min-w-[140px]">Category</th>
//                     <th className="p-2.5 text-left min-w-[130px]">Product Type</th>
//                     <th className="p-2.5 text-right w-[90px]">Qty</th>
//                     <th className="p-2.5 text-right w-[110px]">Unit Price (GHS)</th>
//                     <th className="p-2.5 text-right w-[110px]">Total (GHS)</th>
//                     <th className="p-2.5 text-center w-[50px]"></th>
//                   </tr>
//                 </thead>
//                 <tbody className="divide-y">
//                   {items.map((item, idx) => (
//                     <tr key={item.key} className="hover:bg-muted/20">
//                       {/* Product Name */}
//                       <td className="p-2">
//                         <div className="space-y-1">
//                           {existingProducts.length > 0 && (
//                             <Select
//                               value={item.product_id || ""}
//                               onValueChange={(val) => handleItemChange(item.key, "product_id", val)}
//                             >
//                               <SelectTrigger className="h-8 text-xs mb-1">
//                                 <SelectValue placeholder="-- Pick Existing Product --" />
//                               </SelectTrigger>
//                               <SelectContent>
//                                 {existingProducts.map((p) => (
//                                   <SelectItem key={p.id} value={p.id}>
//                                     {p.name || p.product_name}
//                                   </SelectItem>
//                                 ))}
//                               </SelectContent>
//                             </Select>
//                           )}
//                           <Input
//                             placeholder="Or type product name..."
//                             value={item.product_name}
//                             onChange={(e) =>
//                               handleItemChange(item.key, "product_name", e.target.value)
//                             }
//                             className="h-8 text-xs"
//                           />
//                         </div>
//                       </td>

//                       {/* Category */}
//                       <td className="p-2">
//                         <Input
//                           placeholder="Category e.g. Beverages"
//                           value={item.category_name || ""}
//                           onChange={(e) =>
//                             handleItemChange(item.key, "category_name", e.target.value)
//                           }
//                           className="h-8 text-xs"
//                         />
//                       </td>

//                       {/* Product Type (boxes, sachets, packs, etc.) */}
//                       <td className="p-2">
//                         <Select
//                           value={item.product_type}
//                           onValueChange={(val) => handleItemChange(item.key, "product_type", val)}
//                         >
//                           <SelectTrigger className="h-8 text-xs">
//                             <SelectValue />
//                           </SelectTrigger>
//                           <SelectContent>
//                             {PACKAGING_TYPES.map((pt) => (
//                               <SelectItem key={pt.value} value={pt.value}>
//                                 {pt.label}
//                               </SelectItem>
//                             ))}
//                           </SelectContent>
//                         </Select>
//                       </td>

//                       {/* Quantity */}
//                       <td className="p-2">
//                         <Input
//                           type="number"
//                           min="1"
//                           value={item.quantity}
//                           onChange={(e) =>
//                             handleItemChange(
//                               item.key,
//                               "quantity",
//                               Math.max(1, parseInt(e.target.value) || 1)
//                             )
//                           }
//                           className="h-8 text-xs text-right"
//                         />
//                       </td>

//                       {/* Unit Price */}
//                       <td className="p-2">
//                         <Input
//                           type="number"
//                           step="0.01"
//                           min="0"
//                           value={item.unit_price}
//                           onChange={(e) =>
//                             handleItemChange(
//                               item.key,
//                               "unit_price",
//                               Math.max(0, parseFloat(e.target.value) || 0)
//                             )
//                           }
//                           className="h-8 text-xs text-right"
//                         />
//                       </td>

//                       {/* Total Line Price */}
//                       <td className="p-2 text-right font-medium text-xs">
//                         GHS {((item.quantity || 1) * (item.unit_price || 0)).toFixed(2)}
//                       </td>

//                       {/* Remove */}
//                       <td className="p-2 text-center">
//                         <Button
//                           type="button"
//                           variant="ghost"
//                           size="icon"
//                           onClick={() => handleRemoveItem(item.key)}
//                           className="h-7 w-7 text-muted-foreground hover:text-destructive"
//                         >
//                           <Trash2 className="h-3.5 w-3.5" />
//                         </Button>
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           </div>

//           {/* Payment Terms & Summary Section */}
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t">
//             {/* Payment Details */}
//             <div className="space-y-3">
//               <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
//                 Payment & Notes
//               </h4>

//               <div className="grid grid-cols-2 gap-3">
//                 <div className="space-y-1">
//                   <Label className="text-xs">Payment Mode</Label>
//                   <Select value={paymentMode} onValueChange={setPaymentMode}>
//                     <SelectTrigger className="h-8 text-xs">
//                       <SelectValue />
//                     </SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="cash">Cash</SelectItem>
//                       <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
//                       <SelectItem value="mobile_money">Mobile Money</SelectItem>
//                       <SelectItem value="cheque">Cheque</SelectItem>
//                       <SelectItem value="credit">Credit / Payable</SelectItem>
//                     </SelectContent>
//                   </Select>
//                 </div>

//                 <div className="space-y-1">
//                   <Label className="text-xs">Transaction Status</Label>
//                   <Select value={status} onValueChange={setStatus}>
//                     <SelectTrigger className="h-8 text-xs">
//                       <SelectValue />
//                     </SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="completed">Completed</SelectItem>
//                       <SelectItem value="pending">Pending Delivery</SelectItem>
//                       <SelectItem value="partially_paid">Partially Paid</SelectItem>
//                     </SelectContent>
//                   </Select>
//                 </div>
//               </div>

//               <div className="space-y-1">
//                 <Label className="text-xs">Notes / Invoice Reference</Label>
//                 <Textarea
//                   placeholder="Invoice number, batch number, or notes..."
//                   value={notes}
//                   onChange={(e) => setNotes(e.target.value)}
//                   className="h-16 text-xs resize-none"
//                 />
//               </div>
//             </div>

//             {/* Financial Summary */}
//             <div className="p-4 rounded-lg bg-muted/30 border space-y-3 flex flex-col justify-between">
//               <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
//                 Transaction Summary
//               </h4>

//               <div className="space-y-2 text-sm">
//                 <div className="flex justify-between items-center">
//                   <span className="text-muted-foreground">Grand Total:</span>
//                   <span className="font-bold text-base text-primary">
//                     GHS {totalAmount.toFixed(2)}
//                   </span>
//                 </div>

//                 <div className="flex justify-between items-center gap-2">
//                   <span className="text-muted-foreground">Amount Paid:</span>
//                   <div className="flex items-center gap-1 w-32">
//                     <span className="text-xs font-semibold">GHS</span>
//                     <Input
//                       type="number"
//                       step="0.01"
//                       min="0"
//                       value={amountPaid}
//                       onChange={(e) => {
//                         setCustomAmountPaid(true);
//                         setAmountPaid(parseFloat(e.target.value) || 0);
//                       }}
//                       className="h-8 text-right text-xs font-semibold"
//                     />
//                   </div>
//                 </div>

//                 <div className="flex justify-between items-center pt-2 border-t">
//                   <span className="text-muted-foreground font-medium">Balance Due:</span>
//                   <span
//                     className={`font-bold ${
//                       balance > 0 ? "text-destructive" : "text-emerald-600"
//                     }`}
//                   >
//                     GHS {balance.toFixed(2)}
//                   </span>
//                 </div>
//               </div>

//               <DialogFooter className="pt-3">
//                 <Button
//                   type="button"
//                   variant="outline"
//                   onClick={() => setOpen(false)}
//                   disabled={loading}
//                 >
//                   Cancel
//                 </Button>
//                 <Button type="submit" disabled={loading} className="gap-2">
//                   {loading ? "Recording..." : "Save Transaction"}
//                 </Button>
//               </DialogFooter>
//             </div>
//           </div>
//         </form>
//       </DialogContent>
//     </Dialog>
//   );
// }
