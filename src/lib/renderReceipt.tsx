// lib/renderReceipt.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { getPaperConfig } from "./paperConfig";
import { getReceiptTemplate } from "../components/receipts";
import { getSheetReceiptStyles, getThermalReceiptStyles } from "./receiptStyles";
import { ReceiptOrder, PaperSizeValue } from "../types/receipt";

export function renderReceiptHtml(
  order: ReceiptOrder,
  paperSize: PaperSizeValue
): string {
  const config = getPaperConfig(paperSize);
  const Template = getReceiptTemplate(config.layout);
  const bodyHtml = renderToStaticMarkup(
    <Template order={order} config={config} />
  );

  const styles =
    config.layout === "thermal"
      ? getThermalReceiptStyles(config)
      : getSheetReceiptStyles(config);

  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="UTF-8" /><style>${styles}</style></head>
      <body>${bodyHtml}</body>
    </html>
  `;
}