import jsPDF, { GState } from "jspdf";
import {
  currencyFormatter,
  currencyFormatterWithoutSign,
} from "@/config/formatter";

interface SaleItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface SaleData {
  sale_id: string;
  customer_name?: string;
  sale_date: Date | string;
  total_amount: number;
  payment_mode?: string;
  status?: string;
  // optional store info
  storeName?: string;
  storeAddress?: string;
  storeEmail?: string;
  storePhone?: string;
  // optional images, both as base64 data URLs e.g. "data:image/png;base64,...."
  logoBase64?: string;
  qrCodeBase64?: string;
  attendantName: string | null | undefined;
  accentColor?: string;
}

// ---- Design tokens ----
const PAGE_WIDTH = 80; // mm, fixed by thermal printer width
const PAGE_HEIGHT = 140;
const MARGIN = 5;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LOGO_SIZE = 10; // mm
const QR_SIZE = 18; // mm

// ADDED: extra indent for item names
const ITEM_LEFT_INDENT = 0.2; // mm

const COLOR_INK = "#1a1a1a";
const COLOR_SUB = "#6b6b6b";
const COLOR_FAINT = "#9a9a9a";
const COLOR_LINE = "#dcdcdc";
const COLOR_ACCENT = "#2f6f4f"; // deep green — reads as "confirmed / paid"
const COLOR_ACCENT_SOFT = "#eef5f0";
const COLOR_WHITE = "#ffffff";

/**
 * Draws the full receipt onto the given jsPDF doc, starting at y = 0,
 * and returns the final y position (the natural content height).
 *
 * This is called twice by generateReceiptPDF: once on a tall scratch
 * document purely to measure how much vertical space the content needs
 * (item names can wrap to multiple lines, and the logo/QR blocks are
 * optional, so total height isn't knowable up front), and once on the
 * real, correctly-sized document to render the file the user actually
 * gets. jsPDF requires the page height at construction time, so there's
 * no way to "shrink to fit" after the fact — measuring first is the
 * reliable approach.
 */
function renderReceipt(
  doc: jsPDF,
  saleData: SaleData,
  items: SaleItem[],
): number {
  doc.setProperties({
    title: `${saleData.sale_id}.pdf`,
  });

  let y = 0;

  const setFont = (
    style: "normal" | "bold" | "italic" = "normal",
    size = 7,
    color: string = COLOR_INK,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };

  const textAt = (
    text: string,
    x: number,
    yy: number,
    align: "left" | "center" | "right" = "left",
  ) => {
    doc.text(text, x, yy, { align });
  };

  const hr = (yy: number, color: string = COLOR_LINE, dashed = false) => {
    doc.setDrawColor(color);
    doc.setLineWidth(0.15);
    if (dashed) doc.setLineDashPattern([1, 1], 0);
    doc.line(MARGIN, yy, PAGE_WIDTH - MARGIN, yy);
    if (dashed) doc.setLineDashPattern([], 0);
  };

  const wrapText = (
    text: string,
    maxWidth: number,
    size: number,
    style: "normal" | "bold" = "normal",
  ): string[] => {
    setFont(style, size);
    return doc.splitTextToSize(text, maxWidth);
  };

  // Adding an image can throw if the base64 string is malformed or has the
  // wrong data-URL prefix. A bad logo/QR shouldn't take down the whole
  // receipt, so each image draw is wrapped and silently skipped on failure.
  const tryAddImage = (
    base64: string,

    x: number,
    yVal: number,
    w: number,
    h: number,
  ) => {
    try {
      doc.addImage(base64, "PNG", x, yVal, w, h);
      return true;
    } catch {
      return false;
    }
  };

  // ================= HEADER BAND =================
  const hasLogo = !!saleData.logoBase64;
  const headerHeight = hasLogo ? 34 : 21;

  // doc.setFillColor(saleData.accentColor || COLOR_ACCENT);
  // doc.rect(0, 0, PAGE_WIDTH, 1.4, "F");

  // const lightState = new GState({ opacity: 0.15 }); // 30% transparency
  // doc.setGState(lightState);
  // doc.setFillColor(saleData.accentColor || COLOR_ACCENT);
  // doc.rect(0, 0, PAGE_WIDTH, headerHeight, "F");

  y = 6;

  if (hasLogo && saleData.logoBase64) {
    const logoColor = new GState({ opacity: 1.0 });
    doc.setGState(logoColor);

    const logoX = PAGE_WIDTH / 2 - LOGO_SIZE / 2;
    const drew = tryAddImage(
      saleData.logoBase64,
      logoX,
      y,
      LOGO_SIZE,
      LOGO_SIZE,
    );
    y += drew ? LOGO_SIZE + 4 : 4;

    //Add Water Mark
    // 2. Define the dimensions of your watermark icon/logo (in mm)
    const imageWidth = 40; // 40mm wide (fits perfectly inside an 80mm roll)
    const imageHeight = 40; // 40mm high

    // 3. Dynamically fetch the current page dimensions
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 4. Calculate the precise top-left starting position
    const startX = pageWidth / 2 - imageWidth / 2;
    const startY = pageHeight / 2 - imageHeight / 2;

    // 5. Apply low opacity for the thermal print background
    const gState = new GState({ opacity: 0.04 });
    doc.setGState(gState);

    // 6. Draw your Base64 image watermark using the calculated coordinates
    const base64Icon = saleData.logoBase64;
    doc.addImage(base64Icon, "PNG", startX, startY, imageWidth, imageHeight);

    // 7. Reset opacity back to 1.0 for crisp, dark receipt text
    const normalState = new GState({ opacity: 1.0 });
    doc.setGState(normalState);
  } else {
    y += 3;
  }

  const storeName = saleData.storeName || "YOUR STORE";
  setFont("bold", 10, COLOR_INK);
  textAt(storeName.toUpperCase(), PAGE_WIDTH / 2, y, "center");

  y += 4.4;
  setFont("normal", 7, COLOR_SUB);
  textAt(
    saleData.storeAddress || "123 Main St, City",
    PAGE_WIDTH / 2,
    y,
    "center",
  );

  y += 6;
  textAt(saleData.storePhone || "+123 456 7890", PAGE_WIDTH / 2, y, "center");

  y = headerHeight + 6;

  // ================= TITLE + STATUS BADGE =================
  setFont("bold", 8, COLOR_INK);
  textAt("Payment Receipt", MARGIN, y, "left");

  // const status = (saleData.status || "Completed").toUpperCase();
  setFont("bold", 6.5);
  const badgeTextWidth = doc.getTextWidth(status);
  const badgePadX = 2.2;
  const badgeW = badgeTextWidth + badgePadX * 2;
  const badgeH = 4.6;
  const badgeX = PAGE_WIDTH - MARGIN - badgeW;
  const badgeY = y - badgeH + 1.3;

  doc.setTextColor(COLOR_INK);
  textAt(status, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1.4, "center");

  y += 5;
  hr(y);
  y += 4.4;

  // ================= SALE META =================
  const metaRow = (label: string, value: string) => {
    setFont("normal", 7, COLOR_SUB);
    textAt(label, MARGIN, y, "left");
    setFont("normal", 7, COLOR_INK);
    textAt(value, PAGE_WIDTH - MARGIN, y, "right");
    y += 4;
  };

  metaRow("Invoice No.", saleData.sale_id);
  metaRow("Attendant", saleData?.attendantName || "Attendant");
  metaRow(
    "Date",
    new Date(saleData.sale_date).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true, // Forces AM/PM
    }),
  );
  metaRow("Customer", saleData.customer_name || "Walk-in");
  metaRow("Payment Method", saleData.payment_mode || "Cash");

  y += 0.5;
  hr(y);
  y += 5;

  // ================= ITEMS TABLE =================
  // UPDATED: item column now has extra indent
  const colItem = MARGIN + ITEM_LEFT_INDENT; // was MARGIN
  const colQty = MARGIN + 34;
  const colPrice = MARGIN + 54;
  const colTotal = PAGE_WIDTH - MARGIN;
  // Keep the same gap (6mm) between item name and qty column
  const itemNameMaxWidth = colQty - colItem + 6; // was colQty - MARGIN - 6

  setFont("bold", 6.3, COLOR_FAINT);
  textAt("ITEM", colItem, y, "left");
  textAt("QTY", colQty, y, "right");
  textAt("PRICE", colPrice, y, "right");
  textAt("TOTAL", colTotal, y, "right");
  y += 2.2;
  hr(y);
  y += 4;

  items.forEach((item, idx) => {
    const nameLines = wrapText(
      item.product_name?.toUpperCase(),
      itemNameMaxWidth,
      7,
      "bold",
    );
    const rowTop = y;

    setFont("normal", 7.0, COLOR_INK);
    nameLines.forEach((ln, i) => {
      textAt(ln, colItem, y + i * 3.3, "left");
    });

    setFont("normal", 7, COLOR_SUB);
    textAt(item.quantity.toString(), colQty, rowTop, "right");
    textAt(
      currencyFormatterWithoutSign(item.unit_price),
      colPrice,
      rowTop,
      "right",
    );

    setFont("normal", 7, COLOR_INK);
    textAt(
      currencyFormatterWithoutSign(item.subtotal),
      colTotal,
      rowTop,
      "right",
    );

    const rowHeight = Math.max(nameLines.length * 3.3, 3.8);
    y += rowHeight + 1;

    // light separator between items (not after the last one)
    if (idx < items.length - 1) {
      doc.setDrawColor("#ededed");
      doc.setLineWidth(0.05);
      doc.line(MARGIN, y - 2.8, PAGE_WIDTH - MARGIN, y - 2.8);
    }
  });

  y += 0.5;
  hr(y);
  y += 5;

  // ================= TOTALS =================
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  // Use saleData.total_amount as the final grand total, fallback to subtotal
  const grandTotal = saleData.total_amount ?? subtotal;

  // Display item count and subtotal
  setFont("normal", 7, COLOR_SUB);
  textAt(`${totalQty} item${totalQty === 1 ? "" : "s"}`, MARGIN, y, "left");
  textAt("Subtotal", PAGE_WIDTH - MARGIN - 26, y, "left");
  setFont("normal", 7, COLOR_INK);
  textAt(
    currencyFormatterWithoutSign(subtotal),
    PAGE_WIDTH - MARGIN,
    y,
    "right",
  );
  y += 2;
  hr(y, COLOR_LINE, true); // dashed line above
  y += 3;
  // ---- NEW: Balance line (after subtotal) ----
  setFont("normal", 7, COLOR_SUB);
  textAt("Balance", PAGE_WIDTH - MARGIN - 26, y, "left");
  setFont("normal", 7, COLOR_INK);
  textAt(currencyFormatterWithoutSign(0), PAGE_WIDTH - MARGIN, y, "right");
  y += 6;

  // ---- Grand Total with dashed lines above and below ----
  const totalPanelH = 7;
  hr(y, COLOR_LINE, true); // dashed line above
  y += 3;

  setFont("bold", 7.8, COLOR_INK);
  textAt("GRAND TOTAL", MARGIN + 3.5, y + totalPanelH / 2 + 1.2, "left");
  setFont("bold", 8, COLOR_INK);
  textAt(
    `GHS${currencyFormatterWithoutSign(grandTotal)}`,
    PAGE_WIDTH - MARGIN - 3.5,
    y + totalPanelH / 2 + 1.4,
    "right",
  );

  // hr(y, COLOR_LINE, true);       // dashed line below
  // y += 5;

  y += totalPanelH + 1;

  // ================= QR CODE =================
  if (saleData.qrCodeBase64) {
    hr(y, COLOR_LINE, true);
    y += 5;

    setFont("normal", 6.6, COLOR_FAINT);
    textAt("Scan to verify this receipt", PAGE_WIDTH / 2, y, "center");
    y += 3.5;

    const qrX = PAGE_WIDTH / 2 - QR_SIZE / 2;
    const drew = tryAddImage(saleData.qrCodeBase64, qrX, y, QR_SIZE, QR_SIZE);
    if (drew) y += QR_SIZE + 5;
  }

  // ================= FOOTER =================
  hr(y, COLOR_LINE, true);
  y += 5;

  setFont("bold", 7.6, COLOR_INK);
  textAt("Thank you for your purchase!", PAGE_WIDTH / 2, y, "center");
  y += 3.8;
  setFont("normal", 6.4, COLOR_FAINT);
  textAt(
    "Please keep this receipt for your records.",
    PAGE_WIDTH / 2,
    y,
    "center",
  );
  y += 5;

  // doc.setFillColor(saleData.accentColor || COLOR_ACCENT);
  // doc.rect(0, y, PAGE_WIDTH, 1.4, "F");
  // y += 1.4;

  return y;
}

export function generateReceiptPDF(saleData: SaleData, items: SaleItem[]) {
  // Pass 1 — measure: render on a tall scratch page just to find out how
  // tall the real content is (item-name wrapping, and the optional logo/QR
  // blocks, make this unknowable ahead of time).
  const scratch = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, 400] });
  const measuredHeight = renderReceipt(scratch, saleData, items);

  // Pass 2 — render: build the real document sized exactly to the content
  // (plus a small bottom margin) so the receipt has no dead trailing space,
  // which matters a lot on a thermal printer.
  const finalHeight = measuredHeight + 3;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [PAGE_WIDTH, finalHeight],
  });
  renderReceipt(doc, saleData, items);

  // Auto‑print and iframe handling (kept as in your original)
  doc.autoPrint();

  var blob = doc.output("blob");
  var blobUrl = URL.createObjectURL(blob);

  var iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.opacity = "0";

  iframe.src = blobUrl;
  document.body.appendChild(iframe);

  iframe.onload = function () {
    setTimeout(function () {
      iframe.focus();
      URL.revokeObjectURL(blobUrl);
    }, 100);
  };
}
