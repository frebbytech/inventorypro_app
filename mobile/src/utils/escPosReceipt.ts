import type { PaperSize, SaleReceiptDetail } from "../types/domain";
import { capitalizeLabel, formatCurrency, formatDateTime } from "./formatters";

/**
 * Pure TypeScript ESC/POS binary receipt command encoder for 58mm & 80mm thermal printers.
 * Generates standard Epson-compatible ESC/POS byte sequences without native dependencies.
 */

export const ESC_POS = {
  INIT: [0x1b, 0x40] as const, // ESC @
  ALIGN_LEFT: [0x1b, 0x61, 0x00] as const, // ESC a 0
  ALIGN_CENTER: [0x1b, 0x61, 0x01] as const, // ESC a 1
  ALIGN_RIGHT: [0x1b, 0x61, 0x02] as const, // ESC a 2
  BOLD_ON: [0x1b, 0x45, 0x01] as const, // ESC E 1
  BOLD_OFF: [0x1b, 0x45, 0x00] as const, // ESC E 0
  SIZE_NORMAL: [0x1d, 0x21, 0x00] as const, // GS ! 0
  SIZE_DOUBLE_HEIGHT: [0x1d, 0x21, 0x01] as const, // GS ! 1
  SIZE_DOUBLE: [0x1d, 0x21, 0x11] as const, // GS ! 17 (2x width + 2x height)
  FEED_LINES: (lines: number) => [0x1b, 0x64, Math.max(0, Math.min(255, lines))],
  CUT_PARTIAL: [0x1d, 0x56, 0x42, 0x00] as const, // GS V 66 0
  CASH_DRAWER_KICK: [0x1b, 0x70, 0x00, 0x19, 0xfa] as const, // ESC p 0 25 250
} as const;

export interface EscPosReceiptOptions {
  paperSize?: PaperSize;
  autoCut?: boolean;
  openCashDrawer?: boolean;
}

export function getEscPosColumnWidth(paperSize: PaperSize = "thermal_80mm"): number {
  return paperSize === "thermal_58mm" ? 32 : 48;
}

function encodeAsciiText(text: string): number[] {
  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00b7/g, "|")
    .replace(/\u20b5/g, "GHS ");

  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    if (code === 0x0a) {
      bytes.push(0x0a);
    } else if (code >= 0x20 && code <= 0x7e) {
      bytes.push(code);
    } else {
      bytes.push(0x20);
    }
  }
  return bytes;
}

function wrapText(text: string, width: number): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function formatTwoColumnLine(left: string, right: string, width: number): string {
  const cleanRight = right.trim();
  const cleanLeft = left.trim();
  const maxLeft = Math.max(4, width - cleanRight.length - 1);
  const truncatedLeft =
    cleanLeft.length > maxLeft
      ? `${cleanLeft.slice(0, Math.max(1, maxLeft - 3))}...`
      : cleanLeft;
  const gap = Math.max(1, width - truncatedLeft.length - cleanRight.length);
  return `${truncatedLeft}${" ".repeat(gap)}${cleanRight}`;
}

class EscPosBuilder {
  private readonly buffer: number[] = [];

  raw(bytes: readonly number[]): this {
    for (const b of bytes) {
      this.buffer.push(b & 0xff);
    }
    return this;
  }

  line(text = ""): this {
    this.raw(encodeAsciiText(text));
    this.buffer.push(0x0a);
    return this;
  }

  rule(width: number, char = "-"): this {
    return this.line(char.repeat(width));
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

export function encodeReceiptToEscPosBytes(
  receipt: SaleReceiptDetail,
  options: EscPosReceiptOptions = {},
): Uint8Array {
  const cols = getEscPosColumnWidth(options.paperSize ?? "thermal_80mm");
  const autoCut = options.autoCut ?? true;
  const openCashDrawer = Boolean(options.openCashDrawer);

  const builder = new EscPosBuilder();
  builder.raw(ESC_POS.INIT);

  if (openCashDrawer) {
    builder.raw(ESC_POS.CASH_DRAWER_KICK);
  }

  // Store Header
  builder.raw(ESC_POS.ALIGN_CENTER);
  builder.raw(ESC_POS.BOLD_ON);
  builder.raw(ESC_POS.SIZE_DOUBLE_HEIGHT);
  for (const headerLine of wrapText(receipt.storeName.toUpperCase(), cols)) {
    builder.line(headerLine);
  }
  builder.raw(ESC_POS.SIZE_NORMAL);
  builder.raw(ESC_POS.BOLD_OFF);

  for (const addrLine of wrapText(receipt.storeAddress, cols)) {
    builder.line(addrLine);
  }
  const contactLine = [receipt.storePhone, receipt.storeEmail]
    .filter(Boolean)
    .join(" | ");
  if (contactLine) {
    for (const cLine of wrapText(contactLine, cols)) {
      builder.line(cLine);
    }
  }

  builder.raw(ESC_POS.ALIGN_LEFT);
  builder.rule(cols);

  // Title / Refund notice
  builder.raw(ESC_POS.ALIGN_CENTER);
  builder.raw(ESC_POS.BOLD_ON);
  builder.line(
    receipt.status === "refunded"
      ? "*** REFUNDED RECEIPT ***"
      : "OFFICIAL SALES RECEIPT",
  );
  builder.raw(ESC_POS.BOLD_OFF);
  builder.raw(ESC_POS.ALIGN_LEFT);

  // Receipt Meta
  builder.line(formatTwoColumnLine("Receipt #:", receipt.receiptNo, cols));
  builder.line(formatTwoColumnLine("Date:", formatDateTime(receipt.saleDate), cols));
  builder.line(
    formatTwoColumnLine(
      "Customer:",
      `${receipt.customerName}${receipt.customerPhone ? ` (${receipt.customerPhone})` : ""}`,
      cols,
    ),
  );
  builder.line(
    formatTwoColumnLine("Payment:", capitalizeLabel(receipt.paymentMode), cols),
  );
  builder.line(formatTwoColumnLine("Cashier:", receipt.attendantName, cols));
  builder.rule(cols);

  // Line Items
  for (const item of receipt.items) {
    for (const nameLine of wrapText(item.productName, cols)) {
      builder.line(nameLine);
    }
    builder.line(
      formatTwoColumnLine(
        `  ${item.quantity} x ${item.unitPrice.toFixed(2)}`,
        formatCurrency(item.subtotal, receipt.currency),
        cols,
      ),
    );
  }

  builder.rule(cols);

  // Totals
  builder.line(
    formatTwoColumnLine(
      "Subtotal",
      formatCurrency(receipt.subtotal, receipt.currency),
      cols,
    ),
  );
  if (receipt.discountAmount > 0) {
    builder.line(
      formatTwoColumnLine(
        "Discount",
        `-${formatCurrency(receipt.discountAmount, receipt.currency)}`,
        cols,
      ),
    );
  }
  if (receipt.taxAmount > 0) {
    builder.line(
      formatTwoColumnLine(
        `Tax (${(receipt.taxRate * 100).toFixed(1)}%)`,
        formatCurrency(receipt.taxAmount, receipt.currency),
        cols,
      ),
    );
  }

  builder.raw(ESC_POS.BOLD_ON);
  builder.raw(ESC_POS.SIZE_DOUBLE_HEIGHT);
  builder.line(
    formatTwoColumnLine(
      "TOTAL",
      formatCurrency(receipt.totalAmount, receipt.currency),
      cols,
    ),
  );
  builder.raw(ESC_POS.SIZE_NORMAL);
  builder.raw(ESC_POS.BOLD_OFF);

  builder.line(
    formatTwoColumnLine(
      "Amount Paid",
      formatCurrency(receipt.amountPaid, receipt.currency),
      cols,
    ),
  );

  if (receipt.notes) {
    builder.rule(cols);
    for (const noteLine of wrapText(`Notes: ${receipt.notes}`, cols)) {
      builder.line(noteLine);
    }
  }

  builder.rule(cols);
  builder.raw(ESC_POS.ALIGN_CENTER);
  builder.line("Thank you for your business!");
  builder.line("Powered by Inventory Pro POS");
  builder.raw(ESC_POS.ALIGN_LEFT);

  builder.raw(ESC_POS.FEED_LINES(4));
  if (autoCut) {
    builder.raw(ESC_POS.CUT_PARTIAL);
  }

  return builder.build();
}

export function encodeTestTicketToEscPosBytes(
  storeName: string,
  options: EscPosReceiptOptions = {},
): Uint8Array {
  const paperSize = options.paperSize ?? "thermal_80mm";
  const cols = getEscPosColumnWidth(paperSize);
  const autoCut = options.autoCut ?? true;
  const openCashDrawer = Boolean(options.openCashDrawer);

  const builder = new EscPosBuilder();
  builder.raw(ESC_POS.INIT);
  if (openCashDrawer) {
    builder.raw(ESC_POS.CASH_DRAWER_KICK);
  }

  builder.raw(ESC_POS.ALIGN_CENTER);
  builder.raw(ESC_POS.BOLD_ON);
  builder.raw(ESC_POS.SIZE_DOUBLE_HEIGHT);
  builder.line("THERMAL PRINTER TEST");
  builder.raw(ESC_POS.SIZE_NORMAL);
  builder.raw(ESC_POS.BOLD_OFF);
  builder.line(storeName || "Inventory Pro");
  builder.raw(ESC_POS.ALIGN_LEFT);
  builder.rule(cols);
  builder.line(
    formatTwoColumnLine(
      "Paper Profile:",
      paperSize === "thermal_58mm" ? "58mm (32 cols)" : "80mm (48 cols)",
      cols,
    ),
  );
  builder.line(formatTwoColumnLine("Printed At:", formatDateTime(new Date().toISOString()), cols));
  builder.line(formatTwoColumnLine("Auto-Cut:", autoCut ? "Enabled" : "Off", cols));
  builder.line(formatTwoColumnLine("Cash Drawer:", openCashDrawer ? "Pulse Sent" : "Off", cols));
  builder.rule(cols);

  // Calibrated column ruler
  const ruler = Array.from({ length: cols }, (_, idx) => String((idx + 1) % 10)).join("");
  builder.line(ruler);
  builder.rule(cols);

  builder.raw(ESC_POS.ALIGN_CENTER);
  builder.raw(ESC_POS.BOLD_ON);
  builder.line("ESC/POS CONNECTION VERIFIED");
  builder.raw(ESC_POS.BOLD_OFF);
  builder.raw(ESC_POS.ALIGN_LEFT);

  builder.raw(ESC_POS.FEED_LINES(4));
  if (autoCut) {
    builder.raw(ESC_POS.CUT_PARTIAL);
  }

  return builder.build();
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    const triple = (b0 << 16) | (b1 << 8) | b2;
    output += alphabet[(triple >> 18) & 0x3f];
    output += alphabet[(triple >> 12) & 0x3f];
    output += hasB1 ? alphabet[(triple >> 6) & 0x3f] : "=";
    output += hasB2 ? alphabet[triple & 0x3f] : "=";
  }
  return output;
}
