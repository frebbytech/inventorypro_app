"use client";

import { memo, useCallback, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { bulkCreateCategories } from "@/actions/product-category";
import { bulkCreateProducts, type BulkProductImportItem } from "@/actions/products";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Category } from "@/types/globals";

export type ImportType = "products" | "categories";

interface ProductRow {
  id: string; // client-only temporary id
  name: string;
  category_name: string;
  category_id?: string;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  description: string;
  active: boolean;
}

interface CategoryRow {
  id: string; // client-only temporary id
  name: string;
  description: string;
}

interface BulkImportDialogProps {
  initialType?: ImportType;
  availableCategories?: Category[];
  triggerButton?: ReactNode;
  onSuccess?: () => void;
}

type RawRow = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Stable reference so a default prop doesn't break memoised callbacks.
const NO_CATEGORIES: Category[] = [];

/** Header aliases, already normalised (lowercase, letters and digits only). Earlier aliases win. */
const ALIASES = {
  productName: ["productname", "name", "title", "item"],
  productCategory: ["category", "categoryname", "cat"],
  costPrice: ["costprice", "cost", "buyingprice"],
  unitPrice: ["sellingprice", "unitprice", "price", "rate"],
  stock: ["stockquantity", "quantity", "qty", "stock"],
  status: ["status", "isactive", "active"],
  description: ["description", "desc", "details", "notes"],
  categoryName: ["categoryname", "name", "title", "category"],
};

const INACTIVE_VALUES = new Set(["disabled", "inactive", "0", "false"]);

const TEMPLATES: Record<
  ImportType,
  { filename: string; sheet: string; headers: string[]; rows: (string | number)[][] }
> = {
  products: {
    filename: "products_import_template",
    sheet: "Products",
    headers: [
      "Product Name",
      "Category",
      "Cost Price",
      "Selling Price",
      "Stock Quantity",
      "Status",
      "Description",
    ],
    rows: [
      ["Wireless Bluetooth Earbuds", "Electronics", 45, 79.99, 150, "Active", "Premium noise-canceling wireless earbuds"],
      ["Organic Green Tea", "Beverages", 8.5, 14, 80, "Active", "100% organic Japanese green tea bags"],
      ["Stainless Steel Water Bottle", "Accessories", 12, 24.5, 45, "Active", "Vacuum insulated 750ml flask"],
    ],
  },
  categories: {
    filename: "categories_import_template",
    sheet: "Categories",
    headers: ["Category Name", "Description"],
    rows: [
      ["Electronics", "Smart devices, audio, and accessories"],
      ["Beverages", "Hot and cold drinks, teas, and coffees"],
      ["Office Supplies", "Stationery, desk organizers, and paper products"],
    ],
  },
};

const NOUNS: Record<ImportType, { one: string; many: string }> = {
  products: { one: "product", many: "products" },
  categories: { one: "category", many: "categories" },
};

const TH = "px-2 py-2 font-medium";

/* -------------------------------------------------------------------------- */
/*  Pure helpers (module scope: nothing here depends on component state)      */
/* -------------------------------------------------------------------------- */

let rowCounter = 0;
const makeId = () => `row-${++rowCounter}`;

const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${n.toLocaleString("en-GH")} ${n === 1 ? singular : plural}`;

const errorMessage = (err: unknown, fallback: string) =>
  err && typeof err === "object" && "message" in err && typeof err.message === "string"
    ? err.message
    : fallback;

const text = (value: unknown) => String(value ?? "").trim();
const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Indexes a row by normalised header, so lookups don't rescan every key. */
function normalizeRow(raw: RawRow): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizeKey(key);
    if (!map.has(normalized)) map.set(normalized, value);
  }
  return map;
}

function pick(row: Map<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = row.get(alias);
    if (value !== undefined && value !== null && text(value) !== "") return value;
  }
  return "";
}

const toDecimal = (value: unknown) =>
  Math.max(0, parseFloat(text(value).replace(/[^0-9.]/g, "")) || 0);
const toInteger = (value: unknown) =>
  Math.max(0, parseInt(text(value).replace(/[^0-9]/g, ""), 10) || 0);

const findCategory = (categories: Category[], name: string) =>
  categories.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());

async function readRows(file: File): Promise<RawRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    return new Promise<RawRow[]>((resolve, reject) => {
      Papa.parse<RawRow>(file, {
        header: true,
        skipEmptyLines: "greedy",
        complete: (results) => resolve(results.data),
        error: (error) => reject(error),
      });
    });
  }

  if (ext === "xlsx" || ext === "xls") {
    // Loaded on demand: the spreadsheet library is large and rarely needed.
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  }

  throw new Error("Choose a .csv, .xlsx or .xls file.");
}

function parseProductRows(rawRows: RawRow[], categories: Category[]): ProductRow[] {
  return rawRows
    .map((raw): ProductRow => {
      const row = normalizeRow(raw);
      const categoryName = text(pick(row, ALIASES.productCategory));
      const matched = findCategory(categories, categoryName);

      return {
        id: makeId(),
        name: text(pick(row, ALIASES.productName)),
        category_name: matched?.name ?? (categoryName || "General"),
        category_id: matched?.id,
        cost_price: toDecimal(pick(row, ALIASES.costPrice)),
        unit_price: toDecimal(pick(row, ALIASES.unitPrice)),
        stock_quantity: toInteger(pick(row, ALIASES.stock)),
        description: text(pick(row, ALIASES.description)),
        active: !INACTIVE_VALUES.has(text(pick(row, ALIASES.status)).toLowerCase()),
      };
    })
    .filter((r) => r.name || r.cost_price > 0 || r.unit_price > 0);
}

function parseCategoryRows(rawRows: RawRow[]): CategoryRow[] {
  return rawRows
    .map((raw): CategoryRow => {
      const row = normalizeRow(raw);
      return {
        id: makeId(),
        name: text(pick(row, ALIASES.categoryName)),
        description: text(pick(row, ALIASES.description)),
      };
    })
    .filter((r) => r.name);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function downloadTemplate(type: ImportType, format: "csv" | "xlsx") {
  const { filename, sheet, headers, rows } = TEMPLATES[type];

  try {
    if (format === "csv") {
      const csv = Papa.unparse({ fields: headers, data: rows });
      // The BOM makes Excel read the file as UTF-8.
      saveBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
      return;
    }

    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), sheet);
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (err) {
    toast.error("Couldn't create the template", {
      description: errorMessage(err, "Try again in a moment."),
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function TypeSwitch({ value, onChange }: { value: ImportType; onChange: (next: ImportType) => void }) {
  return (
    <div role="radiogroup" aria-label="What to import" className="inline-flex rounded-lg bg-muted p-1">
      {(["products", "categories"] as const).map((option) => (
        <label key={option} className="cursor-pointer">
          <input
            id={`import-type-${option}-tab`}
            type="radio"
            name="import-type"
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="peer sr-only"
          />
          <span className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors peer-checked:bg-primary dark:peer-checked:bg-background peer-checked:font-medium peer-checked:text-white dark:peer-checked:text-foreground peer-checked:shadow-xs peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
            {option === "products" ? "Products" : "Categories"}
          </span>
        </label>
      ))}
    </div>
  );
}

type ProductPatch = Partial<Omit<ProductRow, "id">>;

/**
 * Memoised so typing in one row doesn't re-render the whole table. That only
 * works because updates keep the other rows' object identity and the
 * callbacks below are stable.
 */
const ProductRowView = memo(function ProductRowView({
  row,
  index,
  onChange,
  onRemove,
}: {
  row: ProductRow;
  index: number;
  onChange: (id: string, patch: ProductPatch) => void;
  onRemove: (id: string) => void;
}) {
  const invalid = !row.name.trim();
  const label = `Row ${index + 1}`;

  return (
    <tr className={cn("border-b last:border-b-0", invalid && "bg-destructive/5")}>
      <td className="px-3 py-1.5 text-center text-muted-foreground tabular-nums">{index + 1}</td>
      <td className="px-2 py-1.5">
        <Input
          aria-label={`${label} name`}
          aria-invalid={invalid}
          value={row.name}
          onChange={(e) => onChange(row.id, { name: e.target.value })}
          placeholder="e.g. Wireless mouse"
          className="h-8"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          aria-label={`${label} category`}
          list="bulk-import-categories"
          value={row.category_name}
          onChange={(e) => onChange(row.id, { category_name: e.target.value })}
          placeholder="General"
          className="h-8"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          aria-label={`${label} cost price`}
          value={row.cost_price}
          onChange={(e) => onChange(row.id, { cost_price: Math.max(0, parseFloat(e.target.value) || 0) })}
          className="h-8 tabular-nums"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          aria-label={`${label} selling price`}
          value={row.unit_price}
          onChange={(e) => onChange(row.id, { unit_price: Math.max(0, parseFloat(e.target.value) || 0) })}
          className="h-8 tabular-nums"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          inputMode="numeric"
          step="1"
          min={0}
          aria-label={`${label} stock`}
          value={row.stock_quantity}
          onChange={(e) => onChange(row.id, { stock_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })}
          className="h-8 tabular-nums"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <Switch
          aria-label={`${label} active`}
          checked={row.active}
          onCheckedChange={(checked) => onChange(row.id, { active: checked })}
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          aria-label={`${label} description`}
          value={row.description}
          onChange={(e) => onChange(row.id, { description: e.target.value })}
          placeholder="Optional"
          className="h-8"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(row.id)}
        >
          <Trash2 aria-hidden className="size-4" />
          <span className="sr-only">Remove {label.toLowerCase()}</span>
        </Button>
      </td>
    </tr>
  );
});

type CategoryPatch = Partial<Omit<CategoryRow, "id">>;

const CategoryRowView = memo(function CategoryRowView({
  row,
  index,
  onChange,
  onRemove,
}: {
  row: CategoryRow;
  index: number;
  onChange: (id: string, patch: CategoryPatch) => void;
  onRemove: (id: string) => void;
}) {
  const invalid = !row.name.trim();
  const label = `Row ${index + 1}`;

  return (
    <tr className={cn("border-b last:border-b-0", invalid && "bg-destructive/5")}>
      <td className="px-3 py-1.5 text-center text-muted-foreground tabular-nums">{index + 1}</td>
      <td className="px-2 py-1.5">
        <Input
          aria-label={`${label} name`}
          aria-invalid={invalid}
          value={row.name}
          onChange={(e) => onChange(row.id, { name: e.target.value })}
          placeholder="e.g. Hardware"
          className="h-8"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          aria-label={`${label} description`}
          value={row.description}
          onChange={(e) => onChange(row.id, { description: e.target.value })}
          placeholder="Optional"
          className="h-8"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(row.id)}
        >
          <Trash2 aria-hidden className="size-4" />
          <span className="sr-only">Remove {label.toLowerCase()}</span>
        </Button>
      </td>
    </tr>
  );
});

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function BulkImportDialog({
  initialType = "products",
  availableCategories = NO_CATEGORIES,
  triggerButton,
  onSuccess,
}: BulkImportDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ImportType>(initialType);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Each type keeps its own rows, so switching tabs never throws work away.
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [fileNames, setFileNames] = useState<Record<ImportType, string | null>>({
    products: null,
    categories: null,
  });

  const noun = NOUNS[type];
  const rowNames: string[] =
    type === "products" ? products.map((r) => r.name) : categories.map((r) => r.name);
  const rowCount = rowNames.length;
  const validCount = rowNames.filter((n) => n.trim()).length;
  const invalidCount = rowCount - validCount;
  const hasRows = rowCount > 0;
  const fileName = fileNames[type];

  /* ---- row editing ---- */

  const updateProduct = useCallback(
    (id: string, patch: ProductPatch) => {
      setProducts((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const next = { ...row, ...patch };
          if (patch.category_name !== undefined) {
            next.category_id = findCategory(availableCategories, patch.category_name)?.id;
          }
          return next;
        })
      );
    },
    [availableCategories]
  );

  const removeProduct = useCallback(
    (id: string) => setProducts((prev) => prev.filter((r) => r.id !== id)),
    []
  );

  const updateCategory = useCallback(
    (id: string, patch: CategoryPatch) =>
      setCategories((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  );

  const removeCategory = useCallback(
    (id: string) => setCategories((prev) => prev.filter((r) => r.id !== id)),
    []
  );

  function addRow() {
    if (type === "products") {
      setProducts((prev) => [
        ...prev,
        {
          id: makeId(),
          name: "",
          category_name: "",
          cost_price: 0,
          unit_price: 0,
          stock_quantity: 0,
          description: "",
          active: true,
        },
      ]);
    } else {
      setCategories((prev) => [...prev, { id: makeId(), name: "", description: "" }]);
    }
  }

  function clearCurrent() {
    if (type === "products") setProducts([]);
    else setCategories([]);
    setFileNames((prev) => ({ ...prev, [type]: null }));
  }

  function resetAll() {
    setProducts([]);
    setCategories([]);
    setFileNames({ products: null, categories: null });
  }

  /* ---- file handling ---- */

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is too large", { description: "Choose one under 10 MB." });
      return;
    }

    setIsParsing(true);
    try {
      const rawRows = await readRows(file);
      if (rawRows.length === 0) {
        toast.warning("That file has no data rows.");
        return;
      }

      let parsedCount: number;
      if (type === "products") {
        const parsed = parseProductRows(rawRows, availableCategories);
        parsedCount = parsed.length;
        if (parsedCount > 0) setProducts(parsed);
      } else {
        const parsed = parseCategoryRows(rawRows);
        parsedCount = parsed.length;
        if (parsedCount > 0) setCategories(parsed);
      }

      if (parsedCount === 0) {
        toast.error(`No ${noun.one} data found`, {
          description: "Check that the first row has column headers.",
        });
        return;
      }

      setFileNames((prev) => ({ ...prev, [type]: file.name }));
      const skipped = rawRows.length - parsedCount;
      if (skipped > 0) toast.info(`${pluralize(skipped, "empty row")} skipped`);
    } catch (err) {
      toast.error("Couldn't read that file", {
        description: errorMessage(err, "Check the file and try again."),
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ---- import ---- */

  async function handleImport() {
    setIsSubmitting(true);
    try {
      if (type === "products") {
        const payload: BulkProductImportItem[] = products
          .filter((p) => p.name.trim())
          .map((p) => ({
            name: p.name.trim(),
            category_name: p.category_name.trim() || "General",
            category_id: p.category_id,
            cost_price: p.cost_price,
            unit_price: p.unit_price,
            stock_quantity: p.stock_quantity,
            description: p.description.trim() || null,
            active: p.active,
          }));

        const res = await bulkCreateProducts(payload);
        if (!res.success) throw new Error(res.message || "Couldn't import products.");

        const { createdCount, newCategoriesCount } = res.data;
        toast.success(`Imported ${pluralize(createdCount, "product")}`, {
          description:
            newCategoriesCount > 0
              ? `${pluralize(newCategoriesCount, "new category", "new categories")} created.`
              : undefined,
        });
      } else {
        const payload = categories
          .filter((c) => c.name.trim())
          .map((c) => ({ name: c.name.trim(), description: c.description.trim() || null }));

        const res = await bulkCreateCategories(payload);
        if (!res.success) throw new Error(res.message || "Couldn't import categories.");

        const { createdCount, existingCount } = res.data;
        toast.success(`Created ${pluralize(createdCount, "category", "categories")}`, {
          description: existingCount > 0 ? `${existingCount} already existed.` : undefined,
        });
      }

      resetAll();
      setOpen(false);
      onSuccess?.();
      router.refresh();
    } catch (err) {
      toast.error("Import failed", {
        description: errorMessage(err, "Something went wrong. Try again."),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return;
    setOpen(next);
    if (!next) resetAll();
  }

  const anyRows = products.length > 0 || categories.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button id="bulk-import-trigger-button" variant="outline" className="gap-2">
            <FileSpreadsheet aria-hidden className="size-4" />
            Import from CSV or Excel
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        // Don't let a stray click outside throw away rows the user has typed or edited.
        onInteractOutside={(e) => {
          if (anyRows) e.preventDefault();
        }}
      >
        <DialogHeader className="flex-col gap-3 border-b px-6 py-4 text-left sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <DialogTitle>Import from spreadsheet</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file, check the rows, then import.
            </DialogDescription>
          </div>
          <TypeSwitch value={type} onChange={setType} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {!hasRows ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />

              <button
                id="file-drop-zone"
                type="button"
                disabled={isParsing}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFile(file);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-6 py-14 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait",
                  isDragging ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                )}
              >
                <span className="pointer-events-none text-sm font-medium">
                  {isParsing ? "Reading file…" : "Drop a spreadsheet here, or click to choose one"}
                </span>
                <span className="pointer-events-none text-sm text-muted-foreground">
                  CSV, XLSX or XLS, up to 10 MB
                </span>
              </button>

              <p className="text-sm text-muted-foreground">
                Expected columns: {TEMPLATES[type].headers.join(", ")}.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Need a template?</span>
                  <Button
                    id="download-csv-template-button"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadTemplate(type, "csv")}
                  >
                    CSV
                  </Button>
                  <Button
                    id="download-excel-template-button"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadTemplate(type, "xlsx")}
                  >
                    Excel
                  </Button>
                </div>

                <Button id="open-blank-grid-button" type="button" variant="ghost" size="sm" onClick={addRow}>
                  Start with an empty table
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div aria-live="polite" className="space-y-0.5 text-sm text-muted-foreground">
                  <p>
                    <span className="text-foreground tabular-nums">
                      {validCount} of {pluralize(rowCount, "row")}
                    </span>{" "}
                    ready
                    {fileName && <> from {fileName}</>}
                  </p>
                  {invalidCount > 0 && (
                    <p className="text-amber-600 dark:text-amber-400">
                      {pluralize(invalidCount, "row")} without a name will be skipped.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button id="preview-add-row-button" type="button" variant="outline" size="sm" onClick={addRow}>
                    Add row
                  </Button>
                  <Button id="preview-reupload-button" type="button" variant="ghost" size="sm" onClick={clearCurrent}>
                    Start over
                  </Button>
                </div>
              </div>

              {/* One scroll container, so the sticky header actually sticks. */}
              <div className="max-h-[50vh] overflow-auto rounded-lg border">
                {type === "products" ? (
                  <table className="w-full min-w-[56rem] border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
                      <tr className="border-b">
                        <th scope="col" className={cn(TH, "w-12 text-center")}>#</th>
                        <th scope="col" className={cn(TH, "min-w-44")}>Name</th>
                        <th scope="col" className={cn(TH, "min-w-40")}>Category</th>
                        <th scope="col" className={cn(TH, "w-28")}>Cost price</th>
                        <th scope="col" className={cn(TH, "w-28")}>Selling price</th>
                        <th scope="col" className={cn(TH, "w-24")}>Stock</th>
                        <th scope="col" className={cn(TH, "w-20 text-center")}>Active</th>
                        <th scope="col" className={cn(TH, "min-w-44")}>Description</th>
                        <th scope="col" className={cn(TH, "w-12")}>
                          <span className="sr-only">Remove</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((row, index) => (
                        <ProductRowView
                          key={row.id}
                          row={row}
                          index={index}
                          onChange={updateProduct}
                          onRemove={removeProduct}
                        />
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[36rem] border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
                      <tr className="border-b">
                        <th scope="col" className={cn(TH, "w-12 text-center")}>#</th>
                        <th scope="col" className={cn(TH, "min-w-52")}>Name</th>
                        <th scope="col" className={cn(TH, "min-w-72")}>Description</th>
                        <th scope="col" className={cn(TH, "w-12")}>
                          <span className="sr-only">Remove</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((row, index) => (
                        <CategoryRowView
                          key={row.id}
                          row={row}
                          index={index}
                          onChange={updateCategory}
                          onRemove={removeCategory}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* One shared list for every row's category field */}
              <datalist id="bulk-import-categories">
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>

              {type === "products" && (
                <p className="text-sm text-muted-foreground">
                  Categories that don't exist yet are created automatically when you import.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>

          {hasRows && (
            <Button
              id="confirm-bulk-import-button"
              type="button"
              onClick={handleImport}
              disabled={isSubmitting || validCount === 0}
            >
              {isSubmitting
                ? "Importing…"
                : `Import ${pluralize(validCount, noun.one, noun.many)}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkImportDialog;


// /* eslint-disable @typescript-eslint/no-explicit-any */
// "use client";

// import React, { useState, useRef } from "react";
// import Papa from "papaparse";
// import * as XLSX from "xlsx";
// import { toast } from "sonner";
// import { useRouter } from "next/navigation";
// import {
//   Upload,
//   FileSpreadsheet,
//   Download,
//   Plus,
//   Trash2,
//   AlertCircle,
//   CheckCircle2,
//   Loader2,
//   FileText,
//   Layers,
//   ArrowRight,
//   RotateCcw,
//   Sparkles,
// } from "lucide-react";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog";
// import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/ui/table";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";
// import { Badge } from "@/components/ui/badge";
// import { ScrollArea } from "@/components/ui/scroll-area";
// import { Switch } from "@/components/ui/switch";
// import { bulkCreateProducts, BulkProductImportItem } from "@/actions/products";
// import { bulkCreateCategories } from "@/actions/product-category";
// import { Category } from "@/types/globals";

// export type ImportType = "products" | "categories";

// interface ParsedProductRow {
//   id: string; // client temporary id
//   name: string;
//   category_name: string;
//   category_id?: string;
//   cost_price: number;
//   unit_price: number;
//   stock_quantity: number;
//   description: string;
//   active: boolean;
// }

// interface ParsedCategoryRow {
//   id: string; // client temporary id
//   name: string;
//   description: string;
// }

// interface BulkImportDialogProps {
//   initialType?: ImportType;
//   availableCategories?: Category[];
//   triggerButton?: React.ReactNode;
//   onSuccess?: () => void;
// }

// export function BulkImportDialog({
//   initialType = "products",
//   availableCategories = [],
//   triggerButton,
//   onSuccess,
// }: BulkImportDialogProps) {
//   const router = useRouter();
//   const [open, setOpen] = useState(false);
//   const [importType, setImportType] = useState<ImportType>(initialType);
//   const [isDragging, setIsDragging] = useState(false);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const fileInputRef = useRef<HTMLInputElement>(null);

//   // Editable preview state
//   const [productRows, setProductRows] = useState<ParsedProductRow[]>([]);
//   const [categoryRows, setCategoryRows] = useState<ParsedCategoryRow[]>([]);
//   const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

//   const resetState = () => {
//     setProductRows([]);
//     setCategoryRows([]);
//     setUploadedFileName(null);
//     if (fileInputRef.current) {
//       fileInputRef.current.value = "";
//     }
//   };

//   // Helper to generate temporary row IDs
//   const makeId = () => Math.random().toString(36).substring(2, 9);

//   // ──────────────────────────────────────────────────────────────
//   // Template Download Handlers
//   // ──────────────────────────────────────────────────────────────

//   const downloadCSVTemplate = (type: ImportType) => {
//     if (type === "products") {
//       const csvContent =
//         "Product Name,Category,Cost Price,Selling Price,Stock Quantity,Status,Description\n" +
//         'Wireless Bluetooth Earbuds,Electronics,45.00,79.99,150,Active,"Premium noise-canceling wireless earbuds"\n' +
//         'Organic Green Tea,Beverages,8.50,14.00,80,Active,"100% organic Japanese green tea bags"\n' +
//         'Stainless Steel Water Bottle,Accessories,12.00,24.50,45,Active,"Vacuum insulated 750ml flask"\n';

//       const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
//       const url = URL.createObjectURL(blob);
//       const link = document.createElement("a");
//       link.setAttribute("href", url);
//       link.setAttribute("download", "products_import_template.csv");
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//     } else {
//       const csvContent =
//         "Category Name,Description\n" +
//         'Electronics,"Smart devices, audio, and accessories"\n' +
//         'Beverages,"Hot and cold drinks, teas, and coffees"\n' +
//         'Office Supplies,"Stationery, desk organizers, and paper products"\n';

//       const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
//       const url = URL.createObjectURL(blob);
//       const link = document.createElement("a");
//       link.setAttribute("href", url);
//       link.setAttribute("download", "categories_import_template.csv");
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//     }
//     toast.info("Template downloaded", {
//       description: "Fill in the template and re-upload here.",
//     });
//   };

//   const downloadExcelTemplate = (type: ImportType) => {
//     const wb = XLSX.utils.book_new();

//     if (type === "products") {
//       const data = [
//         {
//           "Product Name": "Wireless Bluetooth Earbuds",
//           Category: "Electronics",
//           "Cost Price": 45.0,
//           "Selling Price": 79.99,
//           "Stock Quantity": 150,
//           Status: "Active",
//           Description: "Premium noise-canceling wireless earbuds",
//         },
//         {
//           "Product Name": "Organic Green Tea",
//           Category: "Beverages",
//           "Cost Price": 8.5,
//           "Selling Price": 14.0,
//           "Stock Quantity": 80,
//           Status: "Active",
//           Description: "100% organic Japanese green tea bags",
//         },
//         {
//           "Product Name": "Stainless Steel Water Bottle",
//           Category: "Accessories",
//           "Cost Price": 12.0,
//           "Selling Price": 24.5,
//           "Stock Quantity": 45,
//           Status: "Active",
//           Description: "Vacuum insulated 750ml flask",
//         },
//       ];
//       const ws = XLSX.utils.json_to_sheet(data);
//       XLSX.utils.book_append_sheet(wb, ws, "Products");
//       XLSX.writeFile(wb, "products_import_template.xlsx");
//     } else {
//       const data = [
//         {
//           "Category Name": "Electronics",
//           Description: "Smart devices, audio, and accessories",
//         },
//         {
//           "Category Name": "Beverages",
//           Description: "Hot and cold drinks, teas, and coffees",
//         },
//         {
//           "Category Name": "Office Supplies",
//           Description: "Stationery, desk organizers, and paper products",
//         },
//       ];
//       const ws = XLSX.utils.json_to_sheet(data);
//       XLSX.utils.book_append_sheet(wb, ws, "Categories");
//       XLSX.writeFile(wb, "categories_import_template.xlsx");
//     }
//     toast.info("Excel template downloaded");
//   };

//   // ──────────────────────────────────────────────────────────────
//   // File Parsing Engine
//   // ──────────────────────────────────────────────────────────────

//   const handleFileUpload = (file: File) => {
//     setUploadedFileName(file.name);
//     const ext = file.name.split(".").pop()?.toLowerCase();

//     if (ext === "csv") {
//       Papa.parse(file, {
//         header: true,
//         skipEmptyLines: "greedy",
//         complete: (results) => {
//           processParsedData(results.data as Record<string, any>[], importType);
//         },
//         error: (error) => {
//           toast.error("Failed to parse CSV file", {
//             description: error.message,
//           });
//         },
//       });
//     } else if (ext === "xlsx" || ext === "xls") {
//       const reader = new FileReader();
//       reader.onload = (e) => {
//         try {
//           const data = new Uint8Array(e.target?.result as ArrayBuffer);
//           const workbook = XLSX.read(data, { type: "array" });
//           const firstSheetName = workbook.SheetNames[0];
//           const worksheet = workbook.Sheets[firstSheetName];
//           const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<
//             string,
//             any
//           >[];
//           processParsedData(jsonData, importType);
//         } catch (err: any) {
//           toast.error("Failed to parse Excel file", {
//             description: err?.message || "Invalid spreadsheet format",
//           });
//         }
//       };
//       reader.readAsArrayBuffer(file);
//     } else {
//       toast.error("Unsupported file type", {
//         description: "Please upload a .csv, .xlsx, or .xls file.",
//       });
//     }
//   };

//   const normalizeKey = (key: string) =>
//     key.toLowerCase().replace(/[^a-z0-9]/g, "");

//   const processParsedData = (
//     rawRows: Record<string, any>[],
//     type: ImportType,
//   ) => {
//     if (!rawRows || rawRows.length === 0) {
//       toast.warning("The uploaded file contains no data rows.");
//       return;
//     }

//     if (type === "products") {
//       const parsedProducts: ParsedProductRow[] = rawRows
//         .map((row) => {
//           const keys = Object.keys(row);
//           const getVal = (targetKeys: string[]) => {
//             const normalizedTargets = targetKeys.map(normalizeKey);
//             for (const k of keys) {
//               if (normalizedTargets.includes(normalizeKey(k))) {
//                 return row[k];
//               }
//             }
//             return "";
//           };

//           const name = String(
//             getVal(["product_name", "productname", "name", "title", "item"]),
//           ).trim();
//           const categoryName = String(
//             getVal(["category", "category_name", "categoryname", "cat"]),
//           ).trim();
//           const costPriceRaw = getVal([
//             "cost_price",
//             "costprice",
//             "cost",
//             "buying_price",
//           ]);
//           const unitPriceRaw = getVal([
//             "selling_price",
//             "unit_price",
//             "unitprice",
//             "price",
//             "rate",
//           ]);
//           const stockRaw = getVal([
//             "stock_quantity",
//             "stockquantity",
//             "quantity",
//             "qty",
//             "stock",
//           ]);
//           const statusRaw = String(
//             getVal(["status", "is_active", "active"]),
//           ).toLowerCase();
//           const description = String(
//             getVal(["description", "desc", "details", "notes"]),
//           ).trim();

//           const cost_price = Math.max(
//             0,
//             parseFloat(String(costPriceRaw).replace(/[^0-9.]/g, "")) || 0,
//           );
//           const unit_price = Math.max(
//             0,
//             parseFloat(String(unitPriceRaw).replace(/[^0-9.]/g, "")) || 0,
//           );
//           const stock_quantity = Math.max(
//             0,
//             parseInt(String(stockRaw).replace(/[^0-9]/g, ""), 10) || 0,
//           );
//           const active =
//             statusRaw === "disabled" ||
//             statusRaw === "inactive" ||
//             statusRaw === "0" ||
//             statusRaw === "false"
//               ? false
//               : true;

//           // Attempt to map category to existing category
//           const matchedCategory = availableCategories.find(
//             (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
//           );

//           return {
//             id: makeId(),
//             name,
//             category_name: matchedCategory ? matchedCategory.name : categoryName || "General",
//             category_id: matchedCategory?.id,
//             cost_price,
//             unit_price,
//             stock_quantity,
//             description,
//             active,
//           };
//         })
//         .filter((r) => r.name.length > 0 || r.cost_price > 0 || r.unit_price > 0);

//       if (parsedProducts.length === 0) {
//         toast.error("No valid product data found in file");
//         return;
//       }

//       setProductRows(parsedProducts);
//       toast.success(
//         `Parsed ${parsedProducts.length} product(s) for preview and editing.`,
//       );
//     } else {
//       const parsedCategories: ParsedCategoryRow[] = rawRows
//         .map((row) => {
//           const keys = Object.keys(row);
//           const getVal = (targetKeys: string[]) => {
//             const normalizedTargets = targetKeys.map(normalizeKey);
//             for (const k of keys) {
//               if (normalizedTargets.includes(normalizeKey(k))) {
//                 return row[k];
//               }
//             }
//             return "";
//           };

//           const name = String(
//             getVal(["category_name", "categoryname", "name", "title", "category"]),
//           ).trim();
//           const description = String(
//             getVal(["description", "desc", "details", "notes"]),
//           ).trim();

//           return {
//             id: makeId(),
//             name,
//             description,
//           };
//         })
//         .filter((r) => r.name.length > 0);

//       if (parsedCategories.length === 0) {
//         toast.error("No valid category data found in file");
//         return;
//       }

//       setCategoryRows(parsedCategories);
//       toast.success(
//         `Parsed ${parsedCategories.length} category(ies) for preview and editing.`,
//       );
//     }
//   };

//   // ──────────────────────────────────────────────────────────────
//   // Interactive Editing Handlers
//   // ──────────────────────────────────────────────────────────────

//   const updateProductRow = (
//     id: string,
//     field: keyof ParsedProductRow,
//     value: any,
//   ) => {
//     setProductRows((prev) =>
//       prev.map((row) => {
//         if (row.id !== id) return row;
//         const updated = { ...row, [field]: value };
//         if (field === "category_name") {
//           const matched = availableCategories.find(
//             (c) => c.name.toLowerCase() === String(value).toLowerCase(),
//           );
//           updated.category_id = matched?.id;
//         }
//         return updated;
//       }),
//     );
//   };

//   const addProductRow = () => {
//     setProductRows((prev) => [
//       ...prev,
//       {
//         id: makeId(),
//         name: "",
//         category_name: availableCategories[0]?.name || "General",
//         category_id: availableCategories[0]?.id,
//         cost_price: 0,
//         unit_price: 0,
//         stock_quantity: 0,
//         description: "",
//         active: true,
//       },
//     ]);
//   };

//   const deleteProductRow = (id: string) => {
//     setProductRows((prev) => prev.filter((r) => r.id !== id));
//   };

//   const updateCategoryRow = (
//     id: string,
//     field: keyof ParsedCategoryRow,
//     value: string,
//   ) => {
//     setCategoryRows((prev) =>
//       prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
//     );
//   };

//   const addCategoryRow = () => {
//     setCategoryRows((prev) => [
//       ...prev,
//       {
//         id: makeId(),
//         name: "",
//         description: "",
//       },
//     ]);
//   };

//   const deleteCategoryRow = (id: string) => {
//     setCategoryRows((prev) => prev.filter((r) => r.id !== id));
//   };

//   // ──────────────────────────────────────────────────────────────
//   // Commit to Database
//   // ──────────────────────────────────────────────────────────────

//   const handleSave = async () => {
//     setIsSubmitting(true);
//     try {
//       if (importType === "products") {
//         const validProducts = productRows.filter(
//           (p) => p.name.trim().length > 0,
//         );

//         if (validProducts.length === 0) {
//           toast.error("Please add at least one product with a name");
//           setIsSubmitting(false);
//           return;
//         }

//         const payload: BulkProductImportItem[] = validProducts.map((p) => ({
//           name: p.name.trim(),
//           category_name: p.category_name.trim() || "General",
//           category_id: p.category_id,
//           cost_price: Number(p.cost_price) || 0,
//           unit_price: Number(p.unit_price) || 0,
//           stock_quantity: Number(p.stock_quantity) || 0,
//           description: p.description.trim() || null,
//           active: p.active,
//         }));

//         const res = await bulkCreateProducts(payload);
//         if (!res.success) {
//           throw new Error(res.message || "Failed to import products");
//         }

//         const { createdCount, newCategoriesCount } = res.data;
//         toast.success(`Bulk Import Successful!`, {
//           description: `Imported ${createdCount} products${
//             newCategoriesCount > 0
//               ? ` and auto-created ${newCategoriesCount} new categories`
//               : ""
//           }.`,
//           className: "p-4 text-emerald-600 font-medium",
//         });

//         resetState();
//         setOpen(false);
//         onSuccess?.();
//         router.refresh();
//       } else {
//         const validCategories = categoryRows.filter(
//           (c) => c.name.trim().length > 0,
//         );

//         if (validCategories.length === 0) {
//           toast.error("Please add at least one category with a name");
//           setIsSubmitting(false);
//           return;
//         }

//         const payload = validCategories.map((c) => ({
//           name: c.name.trim(),
//           description: c.description.trim() || null,
//         }));

//         const res = await bulkCreateCategories(payload);
//         if (!res.success) {
//           throw new Error(res.message || "Failed to import categories");
//         }

//         const { createdCount, existingCount } = res.data;
//         toast.success(`Categories Import Successful!`, {
//           description: `Created ${createdCount} categories (${existingCount} already existed).`,
//           className: "p-4 text-emerald-600 font-medium",
//         });

//         resetState();
//         setOpen(false);
//         onSuccess?.();
//         router.refresh();
//       }
//     } catch (err: any) {
//       toast.error("Bulk Import Failed", {
//         description: err?.message || "An unexpected error occurred during import.",
//       });
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   const hasData =
//     importType === "products"
//       ? productRows.length > 0
//       : categoryRows.length > 0;

//   const validRowCount =
//     importType === "products"
//       ? productRows.filter((r) => r.name.trim().length > 0).length
//       : categoryRows.filter((r) => r.name.trim().length > 0).length;

//   return (
//     <Dialog
//       open={open}
//       onOpenChange={(v) => {
//         setOpen(v);
//         if (!v) resetState();
//       }}
//     >
//       <DialogTrigger asChild>
//         {triggerButton || (
//           <Button
//             id="bulk-import-trigger-button"
//             variant="outline"
//             className="gap-2 border-dashed border-primary/40 hover:border-primary bg-background hover:bg-muted/50"
//           >
//             <FileSpreadsheet className="h-4 w-4 text-primary" />
//             <span>Bulk Import (CSV / Excel)</span>
//           </Button>
//         )}
//       </DialogTrigger>

//       <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
//         {/* Header */}
//         <div className="p-6 border-b border-border bg-card">
//           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
//             <div>
//               <DialogTitle className="text-xl font-bold flex items-center gap-2">
//                 <FileSpreadsheet className="h-5 w-5 text-primary" />
//                 Bulk Import via Spreadsheet / CSV
//               </DialogTitle>
//               <DialogDescription className="text-sm text-muted-foreground mt-1">
//                 Upload your CSV or Excel file, review & edit rows live in the
//                 table below, and commit directly to the database.
//               </DialogDescription>
//             </div>

//             {/* Type selector */}
//             <Tabs
//               value={importType}
//               onValueChange={(val) => {
//                 setImportType(val as ImportType);
//                 resetState();
//               }}
//               className="w-auto self-start sm:self-auto"
//             >
//               <TabsList className="grid grid-cols-2 h-9">
//                 <TabsTrigger
//                   id="import-type-products-tab"
//                   value="products"
//                   className="text-sm gap-1.5 px-3"
//                 >
//                   <Layers className="h-3.5 w-3.5" />
//                   Products
//                 </TabsTrigger>
//                 <TabsTrigger
//                   id="import-type-categories-tab"
//                   value="categories"
//                   className="text-sm gap-1.5 px-3"
//                 >
//                   <FileText className="h-3.5 w-3.5" />
//                   Categories
//                 </TabsTrigger>
//               </TabsList>
//             </Tabs>
//           </div>
//         </div>

//         {/* Body */}
//         <div className="flex-1 overflow-y-auto p-6 space-y-6">
//           {/* Upload Area & Template Downloads */}
//           {!hasData && (
//             <div className="space-y-6">
//               {/* Drag and Drop Zone */}
//               <div
//                 id="file-drop-zone"
//                 onDragOver={(e) => {
//                   e.preventDefault();
//                   setIsDragging(true);
//                 }}
//                 onDragLeave={() => setIsDragging(false)}
//                 onDrop={(e) => {
//                   e.preventDefault();
//                   setIsDragging(false);
//                   if (e.dataTransfer.files && e.dataTransfer.files[0]) {
//                     handleFileUpload(e.dataTransfer.files[0]);
//                   }
//                 }}
//                 onClick={() => fileInputRef.current?.click()}
//                 className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
//                   isDragging
//                     ? "border-primary bg-primary/5 scale-[0.99]"
//                     : "border-border hover:border-primary/50 hover:bg-muted/40"
//                 }`}
//               >
//                 <input
//                   ref={fileInputRef}
//                   type="file"
//                   accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
//                   className="hidden"
//                   onChange={(e) => {
//                     if (e.target.files && e.target.files[0]) {
//                       handleFileUpload(e.target.files[0]);
//                     }
//                   }}
//                 />
//                 <div className="flex flex-col items-center justify-center gap-3">
//                   <div className="p-3 bg-primary/10 rounded-full text-primary">
//                     <Upload className="h-6 w-6" />
//                   </div>
//                   <div>
//                     <p className="font-semibold text-base">
//                       Click to upload or drag and drop spreadsheet
//                     </p>
//                     <p className="text-sm text-muted-foreground mt-1">
//                       Supports CSV, XLSX, and XLS format up to 10MB
//                     </p>
//                   </div>
//                   <div className="flex items-center gap-2 mt-2">
//                     <Badge variant="outline" className="text-[11px] font-normal">
//                       .CSV
//                     </Badge>
//                     <Badge variant="outline" className="text-[11px] font-normal">
//                       .XLSX
//                     </Badge>
//                     <Badge variant="outline" className="text-[11px] font-normal">
//                       .XLS
//                     </Badge>
//                   </div>
//                 </div>
//               </div>

//               {/* Template download & manual creation cards */}
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <div className="p-4 border rounded-lg bg-card flex flex-col justify-between gap-3">
//                   <div>
//                     <div className="flex items-center gap-2 font-medium text-sm">
//                       <Download className="h-4 w-4 text-primary" />
//                       Download Ready-Made Templates
//                     </div>
//                     <p className="text-sm text-muted-foreground mt-1">
//                       Download our pre-formatted sample spreadsheet with the
//                       correct headers and example rows.
//                     </p>
//                   </div>
//                   <div className="flex items-center gap-2 pt-2">
//                     <Button
//                       id="download-csv-template-button"
//                       variant="outline"
//                       size="sm"
//                       onClick={() => downloadCSVTemplate(importType)}
//                       className="text-sm gap-1.5 h-8 flex-1"
//                     >
//                       <FileText className="h-3.5 w-3.5" />
//                       CSV Template
//                     </Button>
//                     <Button
//                       id="download-excel-template-button"
//                       variant="outline"
//                       size="sm"
//                       onClick={() => downloadExcelTemplate(importType)}
//                       className="text-sm gap-1.5 h-8 flex-1"
//                     >
//                       <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
//                       Excel (.xlsx)
//                     </Button>
//                   </div>
//                 </div>

//                 <div className="p-4 border rounded-lg bg-card flex flex-col justify-between gap-3">
//                   <div>
//                     <div className="flex items-center gap-2 font-medium text-sm">
//                       <Sparkles className="h-4 w-4 text-amber-500" />
//                       Manual Entry / Quick Blank Table
//                     </div>
//                     <p className="text-sm text-muted-foreground mt-1">
//                       Don&apos;t have a file? Open an empty interactive grid to
//                       rapidly type or paste multiple items at once.
//                     </p>
//                   </div>
//                   <Button
//                     id="open-blank-grid-button"
//                     variant="secondary"
//                     size="sm"
//                     onClick={() => {
//                       if (importType === "products") {
//                         addProductRow();
//                       } else {
//                         addCategoryRow();
//                       }
//                     }}
//                     className="text-sm gap-1.5 h-8 w-full"
//                   >
//                     <Plus className="h-3.5 w-3.5" />
//                     Start with Empty Grid
//                   </Button>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Interactive Editable Table Preview */}
//           {hasData && (
//             <div className="space-y-4">
//               {/* Preview toolbar */}
//               <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border">
//                 <div className="flex items-center gap-2">
//                   <Badge
//                     variant="secondary"
//                     className="bg-primary/15 text-primary text-sm font-semibold"
//                   >
//                     {validRowCount} of{" "}
//                     {importType === "products"
//                       ? productRows.length
//                       : categoryRows.length}{" "}
//                     ready to import
//                   </Badge>
//                   {uploadedFileName && (
//                     <span className="text-sm text-muted-foreground hidden sm:inline">
//                       From: <span className="font-medium text-foreground">{uploadedFileName}</span>
//                     </span>
//                   )}
//                 </div>

//                 <div className="flex items-center gap-2">
//                   <Button
//                     id="preview-add-row-button"
//                     variant="outline"
//                     size="sm"
//                     onClick={
//                       importType === "products"
//                         ? addProductRow
//                         : addCategoryRow
//                     }
//                     className="h-8 text-sm gap-1.5"
//                   >
//                     <Plus className="h-3.5 w-3.5" />
//                     Add Row
//                   </Button>
//                   <Button
//                     id="preview-reupload-button"
//                     variant="ghost"
//                     size="sm"
//                     onClick={resetState}
//                     className="h-8 text-sm gap-1.5 text-muted-foreground hover:text-foreground"
//                   >
//                     <RotateCcw className="h-3.5 w-3.5" />
//                     Reset & Re-upload
//                   </Button>
//                 </div>
//               </div>

//               {/* Data Table */}
//               <div className="border rounded-lg overflow-hidden">
//                 <ScrollArea className="max-h-[50vh]">
//                   {importType === "products" ? (
//                     <Table>
//                       <TableHeader className="bg-muted/60 sticky top-0 z-10">
//                         <TableRow>
//                           <TableHead className="w-12 text-center text-sm">#</TableHead>
//                           <TableHead className="min-w-[180px] text-sm">
//                             Product Name <span className="text-destructive">*</span>
//                           </TableHead>
//                           <TableHead className="min-w-[160px] text-sm">Category</TableHead>
//                           <TableHead className="w-28 text-sm">Cost Price</TableHead>
//                           <TableHead className="w-28 text-sm">Selling Price</TableHead>
//                           <TableHead className="w-24 text-sm">Stock Qty</TableHead>
//                           <TableHead className="w-20 text-center text-sm">Active</TableHead>
//                           <TableHead className="min-w-[180px] text-sm">Description</TableHead>
//                           <TableHead className="w-12 text-center text-sm">Action</TableHead>
//                         </TableRow>
//                       </TableHeader>
//                       <TableBody>
//                         {productRows.map((row, idx) => {
//                           const isInvalid = !row.name.trim();
//                           return (
//                             <TableRow
//                               key={row.id}
//                               className={isInvalid ? "bg-destructive/5" : ""}
//                             >
//                               <TableCell className="text-center text-sm text-muted-foreground font-mono">
//                                 {idx + 1}
//                               </TableCell>
//                               <TableCell>
//                                 <Input
//                                   value={row.name}
//                                   onChange={(e) =>
//                                     updateProductRow(
//                                       row.id,
//                                       "name",
//                                       e.target.value,
//                                     )
//                                   }
//                                   placeholder="e.g. Wireless Mouse"
//                                   className={`h-8 text-sm ${
//                                     isInvalid
//                                       ? "border-destructive focus-visible:ring-destructive"
//                                       : ""
//                                   }`}
//                                 />
//                               </TableCell>
//                               <TableCell>
//                                 <Input
//                                   value={row.category_name}
//                                   onChange={(e) =>
//                                     updateProductRow(
//                                       row.id,
//                                       "category_name",
//                                       e.target.value,
//                                     )
//                                   }
//                                   placeholder="e.g. Electronics"
//                                   className="h-8 text-sm"
//                                   list={`category-list-${row.id}`}
//                                 />
//                                 <datalist id={`category-list-${row.id}`}>
//                                   {availableCategories.map((c) => (
//                                     <option key={c.id} value={c.name} />
//                                   ))}
//                                 </datalist>
//                               </TableCell>
//                               <TableCell>
//                                 <Input
//                                   type="number"
//                                   step="0.01"
//                                   min="0"
//                                   value={row.cost_price}
//                                   onChange={(e) =>
//                                     updateProductRow(
//                                       row.id,
//                                       "cost_price",
//                                       parseFloat(e.target.value) || 0,
//                                     )
//                                   }
//                                   className="h-8 text-sm font-mono"
//                                 />
//                               </TableCell>
//                               <TableCell>
//                                 <Input
//                                   type="number"
//                                   step="0.01"
//                                   min="0"
//                                   value={row.unit_price}
//                                   onChange={(e) =>
//                                     updateProductRow(
//                                       row.id,
//                                       "unit_price",
//                                       parseFloat(e.target.value) || 0,
//                                     )
//                                   }
//                                   className="h-8 text-sm font-mono"
//                                 />
//                               </TableCell>
//                               <TableCell>
//                                 <Input
//                                   type="number"
//                                   step="1"
//                                   min="0"
//                                   value={row.stock_quantity}
//                                   onChange={(e) =>
//                                     updateProductRow(
//                                       row.id,
//                                       "stock_quantity",
//                                       parseInt(e.target.value, 10) || 0,
//                                     )
//                                   }
//                                   className="h-8 text-sm font-mono"
//                                 />
//                               </TableCell>
//                               <TableCell className="text-center">
//                                 <Switch
//                                   checked={row.active}
//                                   onCheckedChange={(checked) =>
//                                     updateProductRow(row.id, "active", checked)
//                                   }
//                                 />
//                               </TableCell>
//                               <TableCell>
//                                 <Input
//                                   value={row.description}
//                                   onChange={(e) =>
//                                     updateProductRow(
//                                       row.id,
//                                       "description",
//                                       e.target.value,
//                                     )
//                                   }
//                                   placeholder="Optional description"
//                                   className="h-8 text-sm"
//                                 />
//                               </TableCell>
//                               <TableCell className="text-center">
//                                 <Button
//                                   variant="ghost"
//                                   size="icon"
//                                   onClick={() => deleteProductRow(row.id)}
//                                   className="h-7 w-7 text-muted-foreground hover:text-destructive"
//                                 >
//                                   <Trash2 className="h-3.5 w-3.5" />
//                                 </Button>
//                               </TableCell>
//                             </TableRow>
//                           );
//                         })}
//                       </TableBody>
//                     </Table>
//                   ) : (
//                     <Table>
//                       <TableHeader className="bg-muted/60 sticky top-0 z-10">
//                         <TableRow>
//                           <TableHead className="w-12 text-center text-sm">#</TableHead>
//                           <TableHead className="min-w-[220px] text-sm">
//                             Category Name <span className="text-destructive">*</span>
//                           </TableHead>
//                           <TableHead className="min-w-[320px] text-sm">Description</TableHead>
//                           <TableHead className="w-12 text-center text-sm">Action</TableHead>
//                         </TableRow>
//                       </TableHeader>
//                       <TableBody>
//                         {categoryRows.map((row, idx) => {
//                           const isInvalid = !row.name.trim();
//                           return (
//                             <TableRow
//                               key={row.id}
//                               className={isInvalid ? "bg-destructive/5" : ""}
//                             >
//                               <TableCell className="text-center text-sm text-muted-foreground font-mono">
//                                 {idx + 1}
//                               </TableCell>
//                               <TableCell>
//                                 <Input
//                                   value={row.name}
//                                   onChange={(e) =>
//                                     updateCategoryRow(
//                                       row.id,
//                                       "name",
//                                       e.target.value,
//                                     )
//                                   }
//                                   placeholder="e.g. Hardware"
//                                   className={`h-8 text-sm ${
//                                     isInvalid
//                                       ? "border-destructive focus-visible:ring-destructive"
//                                       : ""
//                                   }`}
//                                 />
//                               </TableCell>
//                               <TableCell>
//                                 <Input
//                                   value={row.description}
//                                   onChange={(e) =>
//                                     updateCategoryRow(
//                                       row.id,
//                                       "description",
//                                       e.target.value,
//                                     )
//                                   }
//                                   placeholder="Optional description"
//                                   className="h-8 text-sm"
//                                 />
//                               </TableCell>
//                               <TableCell className="text-center">
//                                 <Button
//                                   variant="ghost"
//                                   size="icon"
//                                   onClick={() => deleteCategoryRow(row.id)}
//                                   className="h-7 w-7 text-muted-foreground hover:text-destructive"
//                                 >
//                                   <Trash2 className="h-3.5 w-3.5" />
//                                 </Button>
//                               </TableCell>
//                             </TableRow>
//                           );
//                         })}
//                       </TableBody>
//                     </Table>
//                   )}
//                 </ScrollArea>
//               </div>

//               {/* Quick Helper Note */}
//               <div className="flex items-center gap-2 text-sm text-muted-foreground">
//                 <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
//                 <span>
//                   Tip: Any category that does not already exist will be automatically created upon saving.
//                 </span>
//               </div>
//             </div>
//           )}
//         </div>

//         {/* Footer */}
//         <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
//           <Button
//             variant="ghost"
//             size="sm"
//             onClick={() => {
//               setOpen(false);
//               resetState();
//             }}
//             disabled={isSubmitting}
//             className="text-sm"
//           >
//             Cancel
//           </Button>

//           {hasData && (
//             <Button
//               id="confirm-bulk-import-button"
//               onClick={handleSave}
//               disabled={isSubmitting || validRowCount === 0}
//               size="sm"
//               className="text-sm font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
//             >
//               {isSubmitting ? (
//                 <>
//                   <Loader2 className="h-3.5 w-3.5 animate-spin" />
//                   Saving to Database...
//                 </>
//               ) : (
//                 <>
//                   <CheckCircle2 className="h-3.5 w-3.5" />
//                   Import {validRowCount}{" "}
//                   {importType === "products" ? "Product(s)" : "Category(ies)"}
//                 </>
//               )}
//             </Button>
//           )}
//         </div>
//       </DialogContent>
//     </Dialog>
//   );
// }

// export default BulkImportDialog;
