import { Platform, Share } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { SaleReceiptDetail, SalesReportData } from "@/types/domain";
import {
  capitalizeLabel,
  formatCurrency,
  formatDateTime,
} from "./formatters";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReceiptPlainText(receipt: SaleReceiptDetail): string {
  const lines: string[] = [
    receipt.storeName.toUpperCase(),
    receipt.storeAddress,
    [receipt.storePhone, receipt.storeEmail].filter(Boolean).join(" · "),
    "--------------------------------",
    receipt.status === "refunded" ? "*** REFUNDED RECEIPT ***" : "OFFICIAL RECEIPT",
    `Receipt #: ${receipt.receiptNo}`,
    `Date: ${formatDateTime(receipt.saleDate)}`,
    `Customer: ${receipt.customerName}${receipt.customerPhone ? ` (${receipt.customerPhone})` : ""}`,
    `Payment: ${capitalizeLabel(receipt.paymentMode)}`,
    `Served By: ${receipt.attendantName}`,
    "--------------------------------",
  ];

  for (const item of receipt.items) {
    lines.push(
      `${item.productName}\n  ${item.quantity} x ${item.unitPrice.toFixed(2)} = ${formatCurrency(item.subtotal, receipt.currency)}`,
    );
  }

  lines.push("--------------------------------");
  lines.push(`Subtotal: ${formatCurrency(receipt.subtotal, receipt.currency)}`);
  if (receipt.discountAmount > 0) {
    lines.push(
      `Discount: -${formatCurrency(receipt.discountAmount, receipt.currency)}`,
    );
  }
  if (receipt.taxAmount > 0) {
    lines.push(
      `Tax (${(receipt.taxRate * 100).toFixed(1)}%): ${formatCurrency(receipt.taxAmount, receipt.currency)}`,
    );
  }
  lines.push(`TOTAL: ${formatCurrency(receipt.totalAmount, receipt.currency)}`);
  lines.push(
    `Amount Paid: ${formatCurrency(receipt.amountPaid, receipt.currency)}`,
  );
  if (receipt.notes) {
    lines.push(`Notes: ${receipt.notes}`);
  }
  lines.push("--------------------------------");
  lines.push("Thank you for your business!");

  return lines.join("\n");
}

export function buildReceiptHtml(receipt: SaleReceiptDetail): string {
  const isRefunded = receipt.status === "refunded";
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
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #0f172a;
        margin: 0;
        padding: 20px;
        background: #ffffff;
      }
      .ticket {
        max-width: 340px;
        margin: 0 auto;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 18px 16px;
      }
      .header { text-align: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 12px; }
      .store { font-size: 17px; font-weight: 700; margin: 0 0 4px; }
      .contact { font-size: 11px; color: #475569; margin: 2px 0; }
      .title {
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 1.5px;
        margin: 12px 0 10px;
      }
      .refund-banner {
        background: #fef3c7;
        color: #b45309;
        border: 1px solid #f59e0b;
        border-radius: 6px;
        text-align: center;
        font-size: 11px;
        font-weight: 700;
        padding: 5px 8px;
        margin-bottom: 10px;
      }
      .meta { font-size: 12px; margin-bottom: 12px; }
      .meta-row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
      .meta-label { color: #64748b; }
      table { width: 100%; border-collapse: collapse; border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; }
      th {
        font-size: 10px;
        text-transform: uppercase;
        color: #64748b;
        padding: 8px 2px;
        border-bottom: 1px solid #e2e8f0;
        text-align: left;
      }
      td { font-size: 12px; padding: 7px 2px; border-bottom: 1px solid #f1f5f9; }
      tr:last-child td { border-bottom: none; }
      .num { font-variant-numeric: tabular-nums; }
      .center { text-align: center; }
      .right { text-align: right; }
      .strong { font-weight: 600; }
      .totals { margin-top: 12px; font-size: 12px; }
      .total-row { display: flex; justify-content: space-between; margin: 4px 0; }
      .total-final {
        border-top: 1px solid #cbd5e1;
        margin-top: 8px;
        padding-top: 8px;
        font-size: 15px;
        font-weight: 700;
      }
      .notes {
        margin-top: 10px;
        padding: 8px;
        background: #f8fafc;
        border-radius: 6px;
        font-size: 11px;
        color: #475569;
      }
      .footer {
        text-align: center;
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px dashed #cbd5e1;
        font-size: 11px;
        color: #64748b;
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

      <div class="title">RECEIPT</div>
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

export async function shareReceiptText(receipt: SaleReceiptDetail): Promise<void> {
  const message = buildReceiptPlainText(receipt);
  await Share.share({
    title: `Receipt ${receipt.receiptNo}`,
    message,
  });
}

export async function printReceipt(receipt: SaleReceiptDetail): Promise<void> {
  const html = buildReceiptHtml(receipt);
  await Print.printAsync({ html });
}

export async function exportReceiptPdf(receipt: SaleReceiptDetail): Promise<void> {
  const html = buildReceiptHtml(receipt);
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
