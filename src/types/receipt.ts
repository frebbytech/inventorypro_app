// types/receipt.ts
// types/receipt.ts
export interface ReceiptItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface ReceiptOrder {
  sale_id: string;
  customer_name?: string;
  sale_date: string | Date;
  total_amount: number;
  payment_mode: string;
  status: string;
  storeName: string;
  storeAddress: string;
  storeEmail: string;
  storePhone: string;
  logoBase64?: string;
  qrCodeBase64?: string;
  attendantName: string;
  accentColor: string;
  taxRate?: number; // e.g. 0.075 for 7.5% — defaults to 0 if omitted
  currency?: string; // defaults to "GHS"
  items: ReceiptItem[];
}

export type PaperSizeValue =
  | "a4"
  | "a5"
  | "a6"
  | "thermal_80mm"
  | "thermal_58mm";

export type ReceiptLayout = "thermal" | "sheet" | "sheet_compact";

export interface PaperConfig {
  label: string;
  widthMm: number;
  heightMm: number;
  layout: ReceiptLayout;
  micronsWidth: number;
  micronsHeight: number;
}
