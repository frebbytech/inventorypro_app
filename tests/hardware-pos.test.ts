import { describe, expect, it } from "vitest";
import {
  ESC_POS,
  encodeReceiptToEscPosBytes,
  encodeTestTicketToEscPosBytes,
  getEscPosColumnWidth,
  uint8ArrayToBase64,
} from "../mobile/src/utils/escPosReceipt";
import {
  HidScannerBuffer,
  isValidScannedBarcode,
  normalizeScannedBarcode,
} from "../mobile/src/utils/hidScanner";
import type { SaleReceiptDetail } from "../mobile/src/types/domain";

function decodeAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => (b >= 0x20 && b <= 0x7e) || b === 0x0a ? String.fromCharCode(b) : "")
    .join("");
}

function includesSubsequence(haystack: Uint8Array, needle: readonly number[]): boolean {
  if (needle.length === 0) return true;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

const sampleReceipt: SaleReceiptDetail = {
  id: "sale-1",
  receiptNo: "RCP-1042",
  customerName: "Walk-in Customer",
  customerPhone: "0244000111",
  saleDate: "2026-11-22T14:30:00.000Z",
  subtotal: 120,
  taxRate: 0.15,
  taxAmount: 18,
  discountAmount: 8,
  totalAmount: 130,
  amountPaid: 130,
  paymentMode: "cash",
  status: "completed",
  attendantName: "Ama Mensah",
  notes: "Deliver counter #2",
  storeName: "Accra Central Mart",
  storeAddress: "14 Oxford St, Osu",
  storePhone: "+233201234567",
  storeEmail: "pos@accramart.gh",
  currency: "GHS",
  items: [
    {
      id: "item-1",
      productId: "prd-1",
      productName: "Premium Arabica Coffee Beans 500g",
      quantity: 2,
      unitPrice: 60,
      subtotal: 120,
    },
  ],
};

describe("ESC/POS Thermal Receipt Encoder", () => {
  it("selects correct column widths for 58mm vs 80mm rolls", () => {
    expect(getEscPosColumnWidth("thermal_58mm")).toBe(32);
    expect(getEscPosColumnWidth("thermal_80mm")).toBe(48);
  });

  it("encodes initialization, store metadata, totals, auto-cut, and optional cash drawer pulse", () => {
    const bytes = encodeReceiptToEscPosBytes(sampleReceipt, {
      paperSize: "thermal_80mm",
      autoCut: true,
      openCashDrawer: true,
    });

    expect(bytes.slice(0, 2)).toEqual(new Uint8Array(ESC_POS.INIT));
    expect(includesSubsequence(bytes, ESC_POS.CASH_DRAWER_KICK)).toBe(true);
    expect(includesSubsequence(bytes, ESC_POS.CUT_PARTIAL)).toBe(true);

    const text = decodeAscii(bytes);
    expect(text).toContain("ACCRA CENTRAL MART");
    expect(text).toContain("OFFICIAL SALES RECEIPT");
    expect(text).toContain("RCP-1042");
    expect(text).toContain("Premium Arabica Coffee Beans 500g");
    expect(text).toContain("Discount");
    expect(text).toContain("Tax (15.0%)");
    expect(text).toContain("TOTAL");
  });

  it("omits cash drawer pulse and cut command when disabled and marks refunded receipts", () => {
    const bytes = encodeReceiptToEscPosBytes(
      { ...sampleReceipt, status: "refunded" },
      {
        paperSize: "thermal_58mm",
        autoCut: false,
        openCashDrawer: false,
      },
    );

    expect(includesSubsequence(bytes, ESC_POS.CASH_DRAWER_KICK)).toBe(false);
    expect(includesSubsequence(bytes, ESC_POS.CUT_PARTIAL)).toBe(false);
    const text = decodeAscii(bytes);
    expect(text).toContain("*** REFUNDED RECEIPT ***");
    expect(text).toContain("-".repeat(32));
  });

  it("generates calibrated test ticket and valid base64 output", () => {
    const ticket = encodeTestTicketToEscPosBytes("Osu Flagship", {
      paperSize: "thermal_58mm",
      autoCut: true,
      openCashDrawer: false,
    });
    const text = decodeAscii(ticket);
    expect(text).toContain("THERMAL PRINTER TEST");
    expect(text).toContain("58mm (32 cols)");
    expect(text).toContain("ESC/POS CONNECTION VERIFIED");

    const encoded = uint8ArrayToBase64(new Uint8Array([0x1b, 0x40, 0x4f, 0x4b]));
    expect(encoded).toBe("G0BPSw==");
  });
});

describe("Bluetooth / USB HID Barcode Scanner Buffer", () => {
  it("strips control characters and validates barcode lengths", () => {
    expect(normalizeScannedBarcode("\x028901234567890\r\n")).toBe("8901234567890");
    expect(isValidScannedBarcode("8901234567890")).toBe(true);
    expect(isValidScannedBarcode("12")).toBe(false);
    expect(isValidScannedBarcode("X".repeat(129))).toBe(false);
  });

  it("commits immediately on CR/LF terminated scanner bursts", () => {
    const buffer = new HidScannerBuffer({ maxInterKeyMs: 250, minLength: 3 });

    const step1 = buffer.ingestTextChange("SKU-", 1000);
    expect(step1.committedBarcode).toBeNull();
    expect(step1.pendingBuffer).toBe("SKU-");

    const step2 = buffer.ingestTextChange("SKU-99881\r\n", 1020);
    expect(step2.committedBarcode).toBe("SKU-99881");
    expect(step2.pendingBuffer).toBe("");
    expect(buffer.getPending()).toBe("");
  });

  it("discards stale prefix after a slow pause and commits idle burst manually", () => {
    const buffer = new HidScannerBuffer({ maxInterKeyMs: 250, minLength: 3 });

    buffer.ingestTextChange("OLD", 1000);
    // Simulate >250ms pause before a new single-char burst starts
    const afterPause = buffer.ingestTextChange("OLD9", 1500);
    expect(afterPause.committedBarcode).toBeNull();
    expect(afterPause.pendingBuffer).toBe("9");

    buffer.ingestTextChange("912345", 1520);
    const committed = buffer.commit();
    expect(committed.committedBarcode).toBe("912345");
    expect(buffer.getPending()).toBe("");
  });
});
