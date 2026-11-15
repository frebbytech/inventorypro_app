import type { DocumentPickerAsset } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import * as XLSX from "xlsx";
import { LOW_STOCK_THRESHOLD, type CreateProductInput } from "@/types/domain";

export interface ParsedImportRow {
  localId: string;
  rowNumber: number;
  input: CreateProductInput;
  isNewCategory: boolean;
}

export interface ParsedSpreadsheetResult {
  fileName: string;
  validRows: ParsedImportRow[];
  skippedRows: number;
  newCategoryNames: string[];
}

type RawRow = Record<string, unknown>;

const ALIASES = {
  productName: ["productname", "name", "title", "item", "product"],
  category: ["category", "categoryname", "cat", "group"],
  costPrice: ["costprice", "cost", "buyingprice", "unitcost"],
  unitPrice: ["sellingprice", "unitprice", "price", "rate", "retailprice"],
  stock: ["stockquantity", "quantity", "qty", "stock", "openingstock"],
  threshold: ["lowstockthreshold", "threshold", "alertthreshold", "minstock"],
  barcode: ["barcode", "sku", "code", "upc", "ean"],
  status: ["status", "isactive", "active"],
  description: ["description", "desc", "details", "notes"],
};

const INACTIVE_VALUES = new Set(["disabled", "inactive", "0", "false", "no"]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asTrimmedText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeRow(raw: RawRow): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizeKey(key);
    if (normalized && !map.has(normalized)) {
      map.set(normalized, value);
    }
  }
  return map;
}

function pickField(row: Map<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const val = row.get(alias);
    if (val !== undefined && val !== null && asTrimmedText(val) !== "") {
      return val;
    }
  }
  return "";
}

function toDecimal(value: unknown): number {
  const cleaned = asTrimmedText(value).replace(/[^0-9.-]/g, "");
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Number(num.toFixed(2));
}

function toInteger(value: unknown, fallback = 0): number {
  const cleaned = asTrimmedText(value).replace(/[^0-9-]/g, "");
  const num = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return num;
}

function mapRawRowsToProducts(
  rawRows: RawRow[],
  existingCategories: string[],
  fileName: string,
): ParsedSpreadsheetResult {
  const existingMap = new Map<string, string>();
  for (const cat of existingCategories) {
    if (cat && cat !== "All") {
      existingMap.set(cat.trim().toLowerCase(), cat.trim());
    }
  }

  const validRows: ParsedImportRow[] = [];
  const newCategorySet = new Map<string, string>();
  let skippedRows = 0;

  rawRows.forEach((raw, idx) => {
    const normalized = normalizeRow(raw);
    const name = asTrimmedText(pickField(normalized, ALIASES.productName));

    if (!name) {
      skippedRows += 1;
      return;
    }

    const rawCategory = asTrimmedText(pickField(normalized, ALIASES.category));
    const resolvedCategory =
      existingMap.get(rawCategory.toLowerCase()) ?? (rawCategory || "General");
    const isNewCategory = !existingMap.has(resolvedCategory.toLowerCase());

    if (isNewCategory) {
      const lower = resolvedCategory.toLowerCase();
      if (!newCategorySet.has(lower)) {
        newCategorySet.set(lower, resolvedCategory);
      }
    }

    const statusRaw = asTrimmedText(pickField(normalized, ALIASES.status)).toLowerCase();
    const active = statusRaw ? !INACTIVE_VALUES.has(statusRaw) : true;
    const thresholdRaw = pickField(normalized, ALIASES.threshold);
    const threshold =
      asTrimmedText(thresholdRaw) !== ""
        ? Math.max(1, toInteger(thresholdRaw, LOW_STOCK_THRESHOLD))
        : LOW_STOCK_THRESHOLD;

    validRows.push({
      localId: `imp-${idx + 1}-${name.slice(0, 12)}`,
      rowNumber: idx + 2,
      isNewCategory,
      input: {
        name,
        categoryName: resolvedCategory,
        costPrice: toDecimal(pickField(normalized, ALIASES.costPrice)),
        unitPrice: toDecimal(pickField(normalized, ALIASES.unitPrice)),
        stockQuantity: toInteger(pickField(normalized, ALIASES.stock), 0),
        lowStockThreshold: threshold,
        barcode: asTrimmedText(pickField(normalized, ALIASES.barcode)),
        description: asTrimmedText(pickField(normalized, ALIASES.description)),
        active,
      },
    });
  });

  if (validRows.length === 0) {
    throw new Error(
      'No valid product rows found. Ensure your file has a "Product Name" (or "Name") column.',
    );
  }

  return {
    fileName,
    validRows,
    skippedRows,
    newCategoryNames: Array.from(newCategorySet.values()),
  };
}

export function parseCsvTextToProducts(
  csvText: string,
  existingCategories: string[],
  fileName = "pasted-products.csv",
): ParsedSpreadsheetResult {
  const trimmed = csvText.trim();
  if (!trimmed) {
    throw new Error("Paste CSV data before parsing.");
  }

  const workbook = XLSX.read(trimmed, { type: "string" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Could not find any CSV rows to parse.");
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  return mapRawRowsToProducts(rawRows, existingCategories, fileName);
}

export async function parsePickedSpreadsheetAsset(
  asset: DocumentPickerAsset,
  existingCategories: string[],
): Promise<ParsedSpreadsheetResult> {
  const fileName = asset.name || "products-upload";
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
    throw new Error("Please select a .csv, .xlsx, or .xls spreadsheet file.");
  }

  let workbook: XLSX.WorkBook;

  if (Platform.OS === "web") {
    if (ext === "csv") {
      const text = asset.file
        ? await asset.file.text()
        : await (await fetch(asset.uri)).text();
      workbook = XLSX.read(text, { type: "string" });
    } else {
      const buffer = asset.file
        ? await asset.file.arrayBuffer()
        : await (await fetch(asset.uri)).arrayBuffer();
      workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    }
  } else {
    const file = new File(asset.uri);
    if (ext === "csv") {
      const text = await file.text();
      workbook = XLSX.read(text, { type: "string" });
    } else {
      const bytes = await file.bytes();
      workbook = XLSX.read(bytes, { type: "array" });
    }
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The selected spreadsheet has no sheets.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
  return mapRawRowsToProducts(rawRows, existingCategories, fileName);
}

export function buildProductTemplateCsv(): string {
  const headers = [
    "Product Name",
    "Category",
    "Cost Price",
    "Selling Price",
    "Stock Quantity",
    "Barcode",
    "Low Stock Threshold",
    "Status",
    "Description",
  ];

  const sampleRows = [
    [
      "Peak Full Cream Milk Powder 400g",
      "Dairy & Beverages",
      "38.00",
      "48.00",
      "24",
      "5449000011223",
      "5",
      "Active",
      "Instant full cream milk powder refill pouch",
    ],
    [
      "Cowbell Strawberry Milk 40g x 10",
      "Dairy & Beverages",
      "18.50",
      "25.00",
      "30",
      "6034000123456",
      "6",
      "Active",
      "10-sachet retail strip pack",
    ],
    [
      "Uncle Sam Jasmine Rice 2kg",
      "Groceries & Grains",
      "46.00",
      "58.00",
      "14",
      "6154000998877",
      "5",
      "Active",
      "Fragrant long grain jasmine rice",
    ],
  ];

  const escapeCsvCell = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

  return [headers, ...sampleRows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}

export async function shareOrDownloadProductTemplate(): Promise<void> {
  const csv = buildProductTemplateCsv();

  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "products_import_template.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    }
    return;
  }

  const outFile = new File(Paths.cache, "products_import_template.csv");
  outFile.create({ overwrite: true });
  outFile.write(csv);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is unavailable on this device.");
  }

  await Sharing.shareAsync(outFile.uri, {
    mimeType: "text/csv",
    dialogTitle: "Inventory Pro Product Import Template",
    UTI: "public.comma-separated-values-text",
  });
}
