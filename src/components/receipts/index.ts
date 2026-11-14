// components/receipts/index.ts
import { ComponentType } from "react";
import { ReceiptLayout } from "../../types/receipt";
import { SheetReceipt } from "./SheetReceipt";
import { ThermalReceipt } from "./ThermalReceipt";

interface TemplateProps {
  order: any;
  config: any;
}

const TEMPLATE_REGISTRY: Record<ReceiptLayout, ComponentType<TemplateProps>> = {
  sheet: SheetReceipt,
  sheet_compact: SheetReceipt, // same component, scale handles the size difference
  thermal: ThermalReceipt,
};

export function getReceiptTemplate(layout: ReceiptLayout) {
  return TEMPLATE_REGISTRY[layout];
}