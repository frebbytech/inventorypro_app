// components/receipts/SheetCompactReceipt.tsx
import { SheetReceipt } from "./SheetReceipt";
import { ReceiptTemplateProps } from "./types";

// A6 reuses the sheet structure; CSS handles the size difference.
export function SheetCompactReceipt(props: ReceiptTemplateProps) {
  return <SheetReceipt {...props} />;
}