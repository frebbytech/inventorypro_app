// components/receipts/types.ts
import { ReceiptOrder, PaperConfig } from "../../types/receipt";

export interface ReceiptTemplateProps {
  order: ReceiptOrder;
  config: PaperConfig;
}
