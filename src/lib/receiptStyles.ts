// lib/receiptStyles.ts
import { PaperConfig } from "../types/receipt";

export function getSheetReceiptStyles(config: PaperConfig): string {
  return `
    @page { size: ${config.widthMm}mm ${config.heightMm}mm; margin: 0; }

    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }

    .receipt-sheet {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      // color: #1a1a2e;
      width: ${config.widthMm}mm;
      padding: ${config.widthMm * 0.08}mm ${config.widthMm * 0.09}mm;
      line-height: 1.4;
    }

    .rs-header { text-align: center; position: relative; }

    .rs-logo {
      height: 2.2em;
      margin-bottom: 0.5em;
    }

    .rs-store-name {
      font-family: Georgia, 'Times New Roman', serif;
      font-weight: 400;
      font-size: 2.4em;
      color: var(--accent);
      margin: 0 0 0.5em;
      letter-spacing: 0.01em;
    }

    .rs-contact-row {
      display: flex;
      justify-content: center;
      gap: 1.5em;
      flex-wrap: wrap;
      font-size: 0.7em;
      color: #555;
      margin-bottom: 0.9em;
    }

    .rs-contact-item { white-space: nowrap; }

    .rs-divider {
      border-top: 1px solid #d5d9e0;
      margin-bottom: 1.4em;
    }

    .rs-top-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.6em;
    }

    .rs-label {
      font-weight: 700;
      color: var(--accent);
      font-size: 0.85em;
      margin-bottom: 0.3em;
    }

    .rs-value { font-size: 0.9em; }

    .rs-receipt-title {
      font-size: 1.9em;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--accent);
    }

    .rs-details { margin-bottom: 1.4em; }

    .rs-details-heading { margin-bottom: 0.6em; }

    .rs-details-grid {
      display: flex;
      justify-content: space-between;
      gap: 2em;
    }

    .rs-details-col { flex: 1; }

    .rs-details-col-right { max-width: 40%; }

    .rs-detail-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85em;
      padding: 0.15em 0;
    }

    .rs-detail-key { color: #555; }

    .rs-capitalize { text-transform: capitalize; }

    /* Table – Description first */
    .rs-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
      font-size: 0.82em;
    }

    .rs-table thead tr {
      background: var(--accent);
      color: #fff;
    }

    .rs-table th {
      text-align: left;
      padding: 0.6em 0.7em;
      font-weight: 600;
    }

    .rs-table td {
      padding: 0.55em 0.7em;
      border-bottom: 1px solid #e5e8ee;
    }

    .rs-qty-header {
      text-align: center;
    }

    .rs-qty-cell {
      text-align: center;
    }

    .rs-align-right {
      text-align: right;
    }

    .rs-totals {
      border-top: 2px solid var(--accent);
      padding-top: 0.4em;
      margin-top: 0;
    }

    .rs-totals-row {
      display: flex;
      justify-content: flex-end;
      gap: 3em;
      font-size: 0.85em;
      padding: 0.35em 0.7em;
    }

    .rs-totals-final {
      background: #eef2f8;
      font-weight: 700;
      color: var(--accent);
      font-size: 1em;
      border-top: 1px solid #d5d9e0;
    }

    .rs-tax-footnote {
      text-align: right;
      font-size: 0.65em;
      color: #888;
      margin-top: 0.4em;
    }

    .rs-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 2em;
    }

    .rs-notes { max-width: 70%; }

    .rs-notes p {
      font-size: 0.85em;
      margin: 0.3em 0 0;
    }

    /* QR code – bigger */
    .rs-qr {
      width: 4.5em;
      height: 4.5em;
    }
  `;
}

// lib/receiptStyles.ts (add alongside getSheetReceiptStyles)

export function getThermalReceiptStyles(config: PaperConfig): string {
  // console.log(`Generating thermal receipt styles for width: ${config.widthMm}mm`);

  const printableWidthMm = Math.floor(config.widthMm * 0.78);
  // console.log(config)
  // console.log(printableWidthMm)

  return `
    @page { 
      size: ${config.widthMm}mm auto; 
      margin: 0; 
 
    }

    * { 
      box-sizing: border-box; 
      -webkit-print-color-adjust: exact; 
      print-color-adjust: exact;
    }

    body { 
      margin: 0; 
      padding: 0; 
      background: #fff; 
      color: #000;
      -webkit-font-smoothing: none;
      font-family: Consolas, sans-serif;
      font-weight: 600;
    }

    .receipt-thermal {
      font-family: Consolas, sans-serif;
      width: ${printableWidthMm}mm;
      max-width: 100%;
      padding: 0mm 1mm;
      line-height: 1.3;
      background: #fff;
     margin: 0 auto;
          margin-bottom:20mm !important;
    }

    /* Space-Saving Floated Header Block */
    .rt-header-container {
      width: 100%;
      display: block;
      clear: both;
      overflow: hidden;
      margin-bottom: 2px;
    }

    .rt-logo-side {
      float: left;
      width: 25%;
      text-align: left;
    }

    .rt-logo {
      max-width: 100%;
      max-height: 45px;
      display: block;
      filter: grayscale(100%) contrast(200%);
    }

    .rt-info-side {
      float: right;
      width: 72%;
      text-align: left;
      padding-left: 4px;
    }

    .rt-info-full {
      width: 100%;
      text-align: center;
    }

    .rt-store-name {
      font-weight: bold;
      font-size: 1.15em;
      color: #000;
      margin: 0 0 2px 0;
      line-height: 1.1;
    }

    .rt-contact {
      font-size: 0.8em;
      color: #000;
      line-height: 1.2;
    }

    .rt-divider {
      border: 0;
      border-top: 1px dashed #000;
      margin: 4px 0;
      width: 100%;
      clear: both;
    }

    .rt-receipt-title {
      text-align: center;
      font-weight: bold;
      color: #000;
      font-size: 1em;
      margin: 2px 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .rt-meta-grid {
      font-size: 0.8em;
      margin-bottom: 2px;
    }

    .rt-meta-row {
      display: block;
      clear: both;
      width: 100%;
      padding: 1px 0;
    }

    .rt-label {
      font-weight: bold;
      float: left;
    }
    
    .rt-meta-row span:last-child {
      float: right;
      text-align: right;
    }

    .rt-capitalize {
      text-transform: capitalize;
    }

    /* Optimized Table Styles to Stop Overlapping */
    .rt-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8em;
      margin: 2px 0;
      table-layout: fixed;
    }

    .rt-table thead th {
      font-weight: bold;
      color: #000;
      border-bottom: 1px solid #000;
      padding: 2px 0;
    }

    .rt-item-row td {
      padding: 3px 0;
      vertical-align: top;
       border-bottom: 0.5px solid rgba(0, 0, 0, 0.5); 
      word-wrap: break-word;
    }

    .rt-item-name {
      font-weight: bold;
    }

    .rt-qty { text-align: center; }
    .rt-price { text-align: right; }
    .rt-total { text-align: right; font-weight: bold; }

    .rt-totals {
      margin: 4px 0 2px 0;
    }

    .rt-totals-row {
      display: block;
      clear: both;
      width: 100%;
      font-size: 0.85em;
      padding: 1px 0;
    }
    
    .rt-totals-row span:first-child { float: left; }
    .rt-totals-row span:last-child { float: right; text-align: right; }

    .rt-totals-final {
      font-weight: bold;
      font-size: 1.05em;
      border-top: 1px solid #000;
      padding-top: 3px;
      margin-top: 1px;
    }

    .rt-footer-notes {
      clear: both;
      text-align: center;
      margin-top: 4px;
      // margin-bottom: 20px;
    }

    .rt-notes {
      font-size: 0.8em;
      margin: 4px 0 2px 0;
    }

    .rt-dev-tag {
      font-size: 7px;
      font-weight: bold;
      font-style: italic;
      margin: 2px 0 20px 0;
    }

    .rt-qr-wrap {
      text-align: center;
      margin: 4px 0;
    }

    .rt-qr {
      width: 75px;
      height: 75px;
      display: inline-block;
      border: 1px solid #000;
      padding: 1px;
      background: #fff;
    }
    
    
    .bt{
    margin-bottom:100px;
      border: 0;
      border-top: 1px dashed #000;
      width: 100%;
    }

    @media print {
      body { background: #fff; color: #000; }
      .receipt-thermal {
        box-shadow: none;
        border-radius: 0;
        margin: 0;
        padding: 0;
      }
    }
  `;
}

// export function getThermalReceiptStyles(config: PaperConfig): string {
//   return `
//     @page {
//       size: ${config.widthMm}mm auto;
//       margin: 0;
//     }

//     * {
//       box-sizing: border-box;
//       -webkit-print-color-adjust: exact;
//       print-color-adjust: exact;
//     }

//     /* Force high-contrast monochrome printing, remove web-view backgrounds */
//     body {
//       margin: 0;
//       padding: 0;
//       background: #fff;
//       color: #000;
//       font-smooth: never;
//       font-weight: 600;
//       -webkit-font-smoothing: none;
//     }

//     .receipt-thermal {
//       /* Use crisp monospace or standard high-contrast system fonts */
//       font-family: 'Courier New', Courier, Monaco, Consolas, sans-serif;
//       width: 100%;
//       max-width: ${config.widthMm}mm;
//       padding: 0mm 1mm; /* Leave small natural margins for thermal roll edges */
//       line-height: 1.4;
//       background: #fff;
//       margin: 0;
//     }

//     .rt-header {
//       text-align: center;
//       margin-bottom: 4px;
//     }

//     .rt-logo {
//       max-height: 40px;
//       margin-bottom: 4px;
//       display: block;
//       margin-left: auto;
//       margin-right: auto;
//       filter: grayscale(100%) contrast(200%); /* Force monochrome for images */
//     }

//     .rt-store-name {
//       font-weight: bold;
//       font-size: 1.4em;
//       color: #000;
//       margin: 0 0 2px 0;
//     }

//     .rt-contact {
//       font-size: 0.85em; /* Fallback text size shouldn't go below 0.8em for readability */
//       color: #000;
//       line-height: 1.3;
//     }

//     /* Pure black high-contrast dashed border */
//     .rt-divider {
//       border: 0;
//       border-top: 1px dashed #000;
//       margin: 6px 0;
//       width: 100%;
//     }

//     .rt-receipt-title {
//       text-align: center;
//       font-weight: bold;
//       color: #000;
//       font-size: 1.1em;
//       margin: 4px 0;
//       text-transform: uppercase;
//     }

//     /* Keep simple data alignments using solid high-performance block elements */
//     .rt-meta-grid {
//       font-size: 0.85em;
//       margin-bottom: 4px;
//     }

//     .rt-meta-row {
//       display: block;
//       clear: both;
//       width: 100%;
//       padding: 1px 0;
//     }

//     .rt-label {
//       font-weight: bold;
//       float: left;
//       color: #000;
//     }

//     .rt-meta-row span:last-child {
//       float: right;
//       text-align: right;
//     }

//     .rt-capitalize {
//       text-transform: capitalize;
//     }

//     /* Tables must be simple block percentages for tight thermal layouts */
//     .rt-table {
//       width: 100%;
//       border-collapse: collapse;
//       font-size: 0.85em;
//       margin: 4px 0;
//     }

//     .rt-table thead th {
//       text-align: left;
//       font-weight: bold;
//       color: #000;
//       border-bottom: 1px solid #000;
//       padding: 3px 2px;
//     }

//     .rt-table thead th:last-child { text-align: right; }
//     .rt-table thead th:nth-child(2) { text-align: center; }
//     .rt-table thead th:nth-child(3) { text-align: right; }

//     .rt-item-row td {
//       padding: 4px 2px;
//       vertical-align: top;
//       /* Avoid soft light gray borders */
//       border-bottom: 1px dotted #000;
//     }

//     .rt-item-name {
//       font-weight: bold;
//       color: #000;
//     }

//     .rt-qty { text-align: center; color: #000; }
//     .rt-price { text-align: right; color: #000; }
//     .rt-total { text-align: right; font-weight: bold; color: #000; }

//     .rt-totals {
//       margin: 6px 0 2px 0;
//     }

//     .rt-totals-row {
//       display: block;
//       clear: both;
//       width: 100%;
//       font-size: 0.9em;
//       padding: 2px 0;
//     }

//     .rt-totals-row span:first-child {
//       float: left;
//     }

//     .rt-totals-row span:last-child {
//       float: right;
//       text-align: right;
//     }

//     .rt-totals-final {
//       font-weight: bold;
//       font-size: 1.15em;
//       color: #000;
//       border-top: 1px solid #000;
//       padding-top: 4px;
//       margin-top: 2px;
//     }

//     .rt-notes {
//       font-size: 0.8em;
//       text-align: center;
//       color: #000;
//       margin: 8px 0 0 0;
//       line-height: 1.3;
//     }

//     .rt-qr-wrap {
//       text-align: center;
//       margin: 8px 0 4px 0;
//     }

//     .rt-qr {
//       width: 90px;
//       height: 90px;
//       display: inline-block;
//       border: 1px solid #000;
//       padding: 2px;
//       background: #fff;
//     }

//     @media print {
//       body { background: #fff; color: #000; }
//       .receipt-thermal {
//         box-shadow: none;
//         border-radius: 0;
//         margin: 0;
//         padding: 0;
//       }
//     }
//   `;
// }

// export function getThermalReceiptStyles(config: PaperConfig): string {
//   return `
//     @page { size: ${config.widthMm}mm auto; margin: 0; }

//     * { box-sizing: border-box; }
//     body { margin: 0; padding: 0; background: #f8f9fa; }

//     .receipt-thermal {
//       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
//       // color: #1a1a2e;
//       width: ${config.widthMm}mm;
//       padding: 4mm 3mm;
//       line-height: 1.6;
//       background: #fff;
//       border-radius: 4px;
//       box-shadow: 0 2px 8px rgba(0,0,0,0.05);
//       margin: 0 auto;
//     }

//     .rt-header {
//       text-align: center;
//       margin-bottom: 0.5em;
//     }

//     .rt-logo {
//       height: 2.6em;
//       margin-bottom: 0.3em;
//       display: block;
//       margin-left: auto;
//       margin-right: auto;
//     }

//     .rt-store-name {
//       font-family: Georgia, 'Times New Roman', serif;
//       font-weight: 700;
//       font-size: 1.6em;
//       color: var(--accent);
//       margin: 0 0 0.2em;
//       letter-spacing: -0.5px;
//     }

//     .rt-contact {
//       font-size: 0.7em;
//       color: #666;
//       line-height: 1.5;
//     }

//     .rt-divider {
//       border: 0;
//       border-top: 1.5px dashed #d0d5dd;
//       margin: 0.7em 0;
//     }

//     .rt-receipt-title {
//       text-align: center;
//       font-weight: 800;
//       letter-spacing: 0.12em;
//       color: var(--accent);
//       font-size: 1.1em;
//       margin: 0.4em 0 0.6em;
//       text-transform: uppercase;
//     }

//     .rt-meta-grid {
//       display: flex;
//       flex-direction: column;
//       gap: 0.05em;
//       font-size: 0.78em;
//       margin-bottom: 0.3em;
//     }

//     .rt-meta-row {
//       display: flex;
//       justify-content: space-between;
//       padding: 0;
//     }

//     .rt-label {
//       font-weight: 600;
//       color: var(--accent);
//     }

//     .rt-capitalize {
//       text-transform: capitalize;
//     }

//     .rt-table {
//       width: 100%;
//       border-collapse: collapse;
//       font-size: 0.78em;
//       margin: 0.2em 0;
//     }

//     .rt-table thead th {
//       text-align: left;
//       font-weight: 700;
//       color: var(--accent);
//       border-bottom: 2px solid var(--accent);
//       padding: 0.3em 0.2em 0.4em 0.2em;
//       letter-spacing: 0.02em;
//     }

//     .rt-table thead th:last-child {
//       text-align: right;
//     }
//     .rt-table thead th:nth-child(2) {
//       text-align: center;
//     }
//     .rt-table thead th:nth-child(3) {
//       text-align: right;
//     }

//     .rt-item-row td {
//       padding: 0.45em 0.2em;
//       border-bottom: 1px solid #f0f2f5;
//     }

//     .rt-item-name {
//       font-weight: 500;
//       color: #222;
//     }

//     .rt-qty {
//       text-align: center;
//       color: #555;
//     }

//     .rt-price {
//       text-align: right;
//       color: #555;
//     }

//     .rt-total {
//       text-align: right;
//       font-weight: 600;
//       color: #1a1a2e;
//     }

//     .rt-totals {
//       margin: 0.3em 0 0.1em;
//     }

//     .rt-totals-row {
//       display: flex;
//       justify-content: space-between;
//       font-size: 0.85em;
//       padding: 0.15em 0;
//     }

//     .rt-totals-final {
//       font-weight: 700;
//       font-size: 1.05em;
//       color: var(--accent);
//       border-top: 2px solid var(--accent);
//       padding-top: 0.4em;
//       margin-top: 0.2em;
//     }

//     .rt-notes {
//       font-size: 0.75em;
//       text-align: center;
//       color: #666;
//       margin: 0.5em 0 0;
//       line-height: 1.6;
//     }

//     .rt-qr-wrap {
//       text-align: center;
//       margin: 0.6em 0 0.2em;
//     }

//     .rt-qr {
//       width: 5.5em;
//       height: 5.5em;
//       display: inline-block;
//       border: 1px solid #eee;
//       border-radius: 4px;
//       padding: 2px;
//       background: #fff;
//     }

//     /* Responsive fine‑tuning */
//     @media print {
//       body { background: #fff; }
//       .receipt-thermal {
//         box-shadow: none;
//         border-radius: 0;
//         padding: 2mm 2mm;
//         margin: 0;
//       }
//     }
//   `;
// }
