import { Platform, Share } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type {
  PaperSize,
  SaleReceiptDetail,
  SalesReportData,
} from "@/types/domain";
import {
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
} from "./formatters";

export interface ReceiptPaperLayoutConfig {
  id: PaperSize;
  shortLabel: string;
  label: string;
  pageCss: string;
  ticketCssWidth: string;
  textColumns: number;
  isThermal: boolean;
}

export const RECEIPT_PAPER_LAYOUTS: Record<PaperSize, ReceiptPaperLayoutConfig> = {
  thermal_58mm: {
    id: "thermal_58mm",
    shortLabel: "58mm",
    label: "Thermal 58mm",
    pageCss: "@page { size: 58mm auto; margin: 2mm; }",
    ticketCssWidth: "54mm",
    textColumns: 32,
    isThermal: true,
  },
  thermal_80mm: {
    id: "thermal_80mm",
    shortLabel: "80mm",
    label: "Thermal 80mm",
    pageCss: "@page { size: 80mm auto; margin: 3mm; }",
    ticketCssWidth: "74mm",
    textColumns: 42,
    isThermal: true,
  },
  a4: {
    id: "a4",
    shortLabel: "A4 Sheet",
    label: "A4 Sheet",
    pageCss: "@page { size: A4; margin: 14mm; }",
    ticketCssWidth: "660px",
    textColumns: 48,
    isThermal: false,
  },
};

export function getReceiptPaperLayout(paperSize?: PaperSize | null): ReceiptPaperLayoutConfig {
  if (paperSize === "thermal_58mm") return RECEIPT_PAPER_LAYOUTS.thermal_58mm;
  if (paperSize === "a4") return RECEIPT_PAPER_LAYOUTS.a4;
  return RECEIPT_PAPER_LAYOUTS.thermal_80mm;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function padLine(left: string, right: string, width: number): string {
  const cleanLeft = left.trim();
  const cleanRight = right.trim();
  const minGap = 1;
  const maxLeft = Math.max(4, width - cleanRight.length - minGap);
  const clippedLeft =
    cleanLeft.length > maxLeft ? `${cleanLeft.slice(0, maxLeft - 1)}…` : cleanLeft;
  const spaces = Math.max(minGap, width - clippedLeft.length - cleanRight.length);
  return `${clippedLeft}${" ".repeat(spaces)}${cleanRight}`;
}

export function buildReceiptPlainText(
  receipt: SaleReceiptDetail,
  paperSize: PaperSize = "thermal_80mm",
): string {
  const layout = getReceiptPaperLayout(paperSize);
  const cols = layout.textColumns;
  const divider = "-".repeat(cols);

  const lines: string[] = [
    receipt.storeName.toUpperCase(),
    receipt.storeAddress,
    [receipt.storePhone, receipt.storeEmail].filter(Boolean).join(" · "),
    divider,
    receipt.status === "refunded" ? "*** REFUNDED RECEIPT ***" : "OFFICIAL RECEIPT",
    padLine("Receipt #:", receipt.receiptNo, cols),
    padLine("Date:", formatDateTime(receipt.saleDate), cols),
    padLine(
      "Customer:",
      `${receipt.customerName}${receipt.customerPhone ? ` (${receipt.customerPhone})` : ""}`,
      cols,
    ),
    padLine("Payment:", capitalizeLabel(receipt.paymentMode), cols),
    padLine("Served By:", receipt.attendantName, cols),
    divider,
  ];

  for (const item of receipt.items) {
    lines.push(item.productName);
    lines.push(
      padLine(
        `  ${item.quantity} x ${item.unitPrice.toFixed(2)}`,
        formatCurrency(item.subtotal, receipt.currency),
        cols,
      ),
    );
  }

  lines.push(divider);
  lines.push(padLine("Subtotal:", formatCurrency(receipt.subtotal, receipt.currency), cols));
  if (receipt.discountAmount > 0) {
    lines.push(
      padLine("Discount:", `-${formatCurrency(receipt.discountAmount, receipt.currency)}`, cols),
    );
  }
  if (receipt.taxAmount > 0) {
    lines.push(
      padLine(
        `Tax (${(receipt.taxRate * 100).toFixed(1)}%):`,
        formatCurrency(receipt.taxAmount, receipt.currency),
        cols,
      ),
    );
  }
  lines.push(padLine("TOTAL:", formatCurrency(receipt.totalAmount, receipt.currency), cols));
  lines.push(
    padLine("Amount Paid:", formatCurrency(receipt.amountPaid, receipt.currency), cols),
  );
  if (receipt.notes) {
    lines.push(`Notes: ${receipt.notes}`);
  }
  lines.push(divider);
  lines.push("Thank you for your business!");

  return lines.join("\n");
}

export function buildReceiptHtml(
  receipt: SaleReceiptDetail,
  paperSize: PaperSize = "thermal_80mm",
): string {
  const layout = getReceiptPaperLayout(paperSize);
  const isRefunded = receipt.status === "refunded";
  const is58mm = paperSize === "thermal_58mm";
  const rowsHtml = receipt.items
    .map(
      (item) => `
      <tr>
        <td class="item-name">${escapeHtml(item.productName)}</td>
        <td class="num center">${item.quantity}</td>
        <td class="num right">${item.unitPrice.toFixed(2)}</td>
        <td class="num right strong">${item.subtotal.toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(receipt.receiptNo)}</title>
    <style>
      ${layout.pageCss}
      * { box-sizing: border-box; }
      body {
        font-family: ${
          layout.isThermal
            ? '"SFMono-Regular", Menlo, Consolas, "Courier New", monospace'
            : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        };
        color: #000000;
        margin: 0;
        padding: ${layout.isThermal ? "4px" : "20px"};
        background: #ffffff;
      }
      .ticket {
        width: 100%;
        max-width: ${layout.ticketCssWidth};
        margin: 0 auto;
        border: ${layout.isThermal ? "none" : "1px solid #cbd5e1"};
        border-radius: ${layout.isThermal ? "0" : "10px"};
        padding: ${is58mm ? "4px 2px" : layout.isThermal ? "8px 6px" : "22px 24px"};
      }
      .header { text-align: center; border-bottom: 1px dashed #64748b; padding-bottom: ${is58mm ? "8px" : "10px"}; }
      .store { font-size: ${is58mm ? "13px" : layout.isThermal ? "15px" : "19px"}; font-weight: 700; margin: 0 0 3px; }
      .contact { font-size: ${is58mm ? "9px" : "11px"}; color: ${layout.isThermal ? "#1e293b" : "#475569"}; margin: 2px 0; }
      .title {
        text-align: center;
        font-size: ${is58mm ? "10px" : "12px"};
        font-weight: 700;
        letter-spacing: 1.4px;
        margin: ${is58mm ? "8px 0 6px" : "12px 0 10px"};
      }
      .refund-banner {
        background: ${layout.isThermal ? "#ffffff" : "#fef3c7"};
        color: ${layout.isThermal ? "#000000" : "#b45309"};
        border: 1px solid ${layout.isThermal ? "#000000" : "#f59e0b"};
        border-radius: 4px;
        text-align: center;
        font-size: ${is58mm ? "9px" : "11px"};
        font-weight: 700;
        padding: 4px 6px;
        margin-bottom: 8px;
      }
      .meta { font-size: ${is58mm ? "9.5px" : "11.5px"}; margin-bottom: 10px; }
      .meta-row { display: flex; justify-content: space-between; gap: 6px; margin: 2px 0; }
      .meta-label { color: ${layout.isThermal ? "#1e293b" : "#64748b"}; }
      table { width: 100%; border-collapse: collapse; border-top: 1px dashed #64748b; border-bottom: 1px dashed #64748b; }
      th {
        font-size: ${is58mm ? "8.5px" : "10px"};
        text-transform: uppercase;
        color: ${layout.isThermal ? "#000000" : "#64748b"};
        padding: ${is58mm ? "5px 1px" : "7px 2px"};
        border-bottom: 1px solid #cbd5e1;
        text-align: left;
      }
      td {
        font-size: ${is58mm ? "9.5px" : "11.5px"};
        padding: ${is58mm ? "4px 1px" : "6px 2px"};
        border-bottom: 1px solid #e2e8f0;
        vertical-align: top;
      }
      .item-name { word-break: break-word; padding-right: 4px; }
      tr:last-child td { border-bottom: none; }
      .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      .right { text-align: right; }
      .strong { font-weight: 700; }
      .totals { margin-top: 10px; font-size: ${is58mm ? "9.5px" : "12px"}; }
      .total-row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
      .total-final {
        border-top: 1px solid #0f172a;
        margin-top: 6px;
        padding-top: 6px;
        font-size: ${is58mm ? "12px" : "14.5px"};
        font-weight: 700;
      }
      .notes {
        margin-top: 8px;
        padding: 6px;
        background: ${layout.isThermal ? "#ffffff" : "#f8fafc"};
        border: ${layout.isThermal ? "1px dashed #94a3b8" : "none"};
        border-radius: 4px;
        font-size: ${is58mm ? "9px" : "11px"};
        color: #1e293b;
      }
      .footer {
        text-align: center;
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px dashed #64748b;
        font-size: ${is58mm ? "9px" : "11px"};
        color: ${layout.isThermal ? "#1e293b" : "#64748b"};
      }
    </style>
  </head>
  <body>
    <div class="ticket">
      <div class="header">
        <div class="store">${escapeHtml(receipt.storeName)}</div>
        <div class="contact">${escapeHtml(receipt.storeAddress)}</div>
        ${receipt.storePhone ? `<div class="contact">${escapeHtml(receipt.storePhone)}</div>` : ""}
        ${receipt.storeEmail ? `<div class="contact">${escapeHtml(receipt.storeEmail)}</div>` : ""}
      </div>

      <div class="title">RECEIPT (${escapeHtml(layout.shortLabel.toUpperCase())})</div>
      ${isRefunded ? `<div class="refund-banner">STATUS: REFUNDED</div>` : ""}

      <div class="meta">
        <div class="meta-row"><span class="meta-label">Receipt #</span><span class="strong">${escapeHtml(receipt.receiptNo)}</span></div>
        <div class="meta-row"><span class="meta-label">Date</span><span>${escapeHtml(formatDateTime(receipt.saleDate))}</span></div>
        <div class="meta-row"><span class="meta-label">Customer</span><span>${escapeHtml(receipt.customerName)}</span></div>
        <div class="meta-row"><span class="meta-label">Payment</span><span>${escapeHtml(capitalizeLabel(receipt.paymentMode))}</span></div>
        <div class="meta-row"><span class="meta-label">Served By</span><span>${escapeHtml(receipt.attendantName)}</span></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="center">Qty</th>
            <th class="right">Price</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row"><span class="meta-label">Subtotal</span><span class="num">${escapeHtml(formatCurrency(receipt.subtotal, receipt.currency))}</span></div>
        ${receipt.discountAmount > 0 ? `<div class="total-row"><span class="meta-label">Discount</span><span class="num">-${escapeHtml(formatCurrency(receipt.discountAmount, receipt.currency))}</span></div>` : ""}
        ${receipt.taxAmount > 0 ? `<div class="total-row"><span class="meta-label">Tax (${(receipt.taxRate * 100).toFixed(1)}%)</span><span class="num">${escapeHtml(formatCurrency(receipt.taxAmount, receipt.currency))}</span></div>` : ""}
        <div class="total-row total-final"><span>Total</span><span class="num">${escapeHtml(formatCurrency(receipt.totalAmount, receipt.currency))}</span></div>
        <div class="total-row"><span class="meta-label">Amount Paid</span><span class="num">${escapeHtml(formatCurrency(receipt.amountPaid, receipt.currency))}</span></div>
      </div>

      ${receipt.notes ? `<div class="notes">${escapeHtml(receipt.notes)}</div>` : ""}

      <div class="footer">
        <div>Thank You!</div>
        <div>By Frebbytech Solutions (+233 543 772 591)</div>
      </div>
    </div>
  </body>
</html>`;
}

export async function shareReceiptText(
  receipt: SaleReceiptDetail,
  paperSize: PaperSize = "thermal_80mm",
): Promise<void> {
  const message = buildReceiptPlainText(receipt, paperSize);
  await Share.share({
    title: `Receipt ${receipt.receiptNo}`,
    message,
  });
}

export async function printReceipt(
  receipt: SaleReceiptDetail,
  paperSize: PaperSize = "thermal_80mm",
): Promise<void> {
  const html = buildReceiptHtml(receipt, paperSize);
  await Print.printAsync({ html });
}

export async function exportReceiptPdf(
  receipt: SaleReceiptDetail,
  paperSize: PaperSize = "thermal_80mm",
): Promise<void> {
  const html = buildReceiptHtml(receipt, paperSize);
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Share Receipt ${receipt.receiptNo}`,
      UTI: "com.adobe.pdf",
    });
  } else {
    await Print.printAsync({ html });
  }
}

export function buildSalesReportPlainText(
  report: SalesReportData,
  storeName: string,
): string {
  const periodLabel =
    report.dateRange === "today"
      ? "Today"
      : report.dateRange === "7d"
        ? "Last 7 Days"
        : report.dateRange === "30d"
          ? "Last 30 Days"
          : "All Time";

  const lines = [
    `${storeName.toUpperCase()} — SALES REPORT (${periodLabel})`,
    "--------------------------------",
    `Completed Orders: ${report.completedCount} (${report.totalUnitsSold} units)`,
    `Completed Revenue: ${formatCurrency(report.grossRevenue, report.currency)}`,
    `Average Order Value: ${formatCurrency(report.averageOrderValue, report.currency)}`,
    `Gross Profit: ${formatCurrency(report.grossProfit, report.currency)} (${report.profitMarginPercent.toFixed(1)}% margin)`,
    `Discounts: ${formatCurrency(report.totalDiscount, report.currency)}`,
    `Tax Collected: ${formatCurrency(report.totalTax, report.currency)}`,
    `Refunds: ${report.refundedCount} (${formatCurrency(report.refundedAmount, report.currency)})`,
    "--------------------------------",
    "PAYMENT BREAKDOWN:",
    ...report.paymentBreakdown.map(
      (b) =>
        `  ${capitalizeLabel(b.paymentMode)}: ${formatCurrency(b.amount, report.currency)} (${b.count} tx · ${b.sharePercent}%)`,
    ),
  ];

  if (report.topProducts.length > 0) {
    lines.push("--------------------------------");
    lines.push("TOP PRODUCTS:");
    report.topProducts.forEach((p, idx) => {
      lines.push(
        `  ${idx + 1}. ${p.productName} — ${p.unitsSold} sold (${formatCurrency(p.revenue, report.currency)})`,
      );
    });
  }

  return lines.join("\n");
}

export async function shareSalesReportText(
  report: SalesReportData,
  storeName: string,
): Promise<void> {
  await Share.share({
    title: `${storeName} Sales Report`,
    message: buildSalesReportPlainText(report, storeName),
  });
}
