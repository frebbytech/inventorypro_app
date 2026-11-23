import type { SyncOutboxItem } from "@/types/domain";
import { capitalizeLabel, formatCurrency } from "./formatters";
import { extractLocalPhotoUrisFromOutboxPayload } from "./productImage";

export interface FormattedOutboxSummary {
  title: string;
  entityLabel: string;
  summaryLines: string[];
  prettyPayload: string;
  pendingMediaUri: string | null;
  pendingMediaCount: number;
}

function safeParsePayload(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed json
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function formatOperationLabel(entityType: string, operation: string): {
  title: string;
  entityLabel: string;
} {
  const key = `${entityType}:${operation}`;
  switch (key) {
    case "sale:create":
      return { title: "Record Sale", entityLabel: "Sale" };
    case "sale:refund":
      return { title: "Refund Sale", entityLabel: "Sale" };
    case "product:create":
      return { title: "Add Product", entityLabel: "Product" };
    case "product:update":
      return { title: "Update Product", entityLabel: "Product" };
    case "product:bulk_create":
      return { title: "Bulk Import Products", entityLabel: "Products" };
    case "product:stock_adjust":
      return { title: "Adjust Stock", entityLabel: "Inventory" };
    case "product:restock":
      return { title: "Record Restock", entityLabel: "Restock" };
    case "category:create":
      return { title: "Create Category", entityLabel: "Category" };
    case "category:update":
      return { title: "Update Category", entityLabel: "Category" };
    case "customer:create":
      return { title: "Add Customer", entityLabel: "Customer" };
    case "customer:update":
      return { title: "Update Customer", entityLabel: "Customer" };
    case "supplier:create":
      return { title: "Add Supplier", entityLabel: "Supplier" };
    case "supplier:update":
      return { title: "Update Supplier", entityLabel: "Supplier" };
    case "supplier_transaction:create":
      return { title: "Supplier Delivery", entityLabel: "Supplier Tx" };
    case "supplier_transaction:pay_balance":
      return { title: "Pay Supplier Balance", entityLabel: "Supplier Tx" };
    case "notification:mark_read":
      return { title: "Mark Notification Read", entityLabel: "Alert" };
    case "notification:mark_all_read":
      return { title: "Mark All Alerts Read", entityLabel: "Alerts" };
    case "notification:delete":
      return { title: "Delete Notification", entityLabel: "Alert" };
    case "notification:clear_all":
      return { title: "Clear All Notifications", entityLabel: "Alerts" };
    case "message:broadcast":
      return { title: "Send Team Broadcast", entityLabel: "Broadcast" };
    default:
      return {
        title: `${capitalizeLabel(operation.replace(/_/g, " "))} ${capitalizeLabel(entityType.replace(/_/g, " "))}`,
        entityLabel: capitalizeLabel(entityType.replace(/_/g, " ")),
      };
  }
}

export function formatOutboxItemSummary(
  item: SyncOutboxItem,
): FormattedOutboxSummary {
  const { title, entityLabel } = formatOperationLabel(
    item.entityType,
    item.operation,
  );
  const payload = safeParsePayload(item.payloadJson);
  const summaryLines: string[] = [];

  if (payload) {
    const key = `${item.entityType}:${item.operation}`;

    if (key === "sale:create") {
      const items = Array.isArray(payload.items) ? payload.items : [];
      const itemCount = items.length;
      const totalQty = items.reduce((sum, entry) => {
        if (entry && typeof entry === "object") {
          const qty = asNumber((entry as Record<string, unknown>).quantity);
          return sum + (qty ?? 0);
        }
        return sum;
      }, 0);
      const computedTotal = items.reduce((sum, entry) => {
        if (entry && typeof entry === "object") {
          const rec = entry as Record<string, unknown>;
          const qty = asNumber(rec.quantity) ?? 0;
          const price = asNumber(rec.unitPrice) ?? 0;
          return sum + qty * price;
        }
        return sum;
      }, 0);
      const paymentMode = asString(payload.paymentMode);
      const customerName = asString(payload.customerName);
      const parts: string[] = [];
      if (itemCount > 0) {
        parts.push(
          `${itemCount} line${itemCount === 1 ? "" : "s"} (${totalQty} unit${totalQty === 1 ? "" : "s"})`,
        );
      }
      if (computedTotal > 0) {
        parts.push(formatCurrency(computedTotal));
      }
      if (paymentMode) {
        parts.push(capitalizeLabel(paymentMode));
      }
      if (parts.length > 0) {
        summaryLines.push(parts.join(" · "));
      }
      if (customerName) {
        summaryLines.push(`Customer: ${customerName}`);
      }
    } else if (key === "sale:refund") {
      const reason = asString(payload.reason);
      summaryLines.push(
        reason ? `Reason: ${reason}` : "Full receipt reversal and stock return",
      );
    } else if (key === "product:create" || key === "product:update") {
      const name = asString(payload.name);
      const qty = asNumber(payload.quantity);
      const price = asNumber(payload.unitPrice);
      const barcode = asString(payload.barcode);
      const details: string[] = [];
      if (name) details.push(name);
      if (qty !== null) details.push(`${qty} in stock`);
      if (price !== null) details.push(formatCurrency(price));
      if (details.length > 0) summaryLines.push(details.join(" · "));
      if (barcode) summaryLines.push(`Barcode: ${barcode}`);
    } else if (key === "product:bulk_create") {
      const items = Array.isArray(payload.items) ? payload.items : [];
      summaryLines.push(
        `${items.length} product${items.length === 1 ? "" : "s"} queued for import`,
      );
    } else if (key === "product:stock_adjust") {
      const delta = asNumber(payload.quantityDelta);
      const reason = asString(payload.reason);
      const signed =
        delta !== null ? (delta > 0 ? `+${delta}` : String(delta)) : "Updated";
      summaryLines.push(
        reason ? `Delta: ${signed} · ${reason}` : `Quantity delta: ${signed}`,
      );
    } else if (key === "product:restock") {
      const qty = asNumber(payload.quantity);
      const cost = asNumber(payload.unitCost);
      const details: string[] = [];
      if (qty !== null) details.push(`+${qty} units`);
      if (cost !== null) details.push(`${formatCurrency(cost)} / unit`);
      if (details.length > 0) summaryLines.push(details.join(" · "));
    } else if (
      item.entityType === "category" ||
      item.entityType === "customer" ||
      item.entityType === "supplier"
    ) {
      const name =
        asString(payload.name) ||
        asString(payload.companyName);
      const contact =
        asString(payload.phonenumber) ||
        asString(payload.email) ||
        asString(payload.description);
      if (name) summaryLines.push(name);
      if (contact) summaryLines.push(contact);
    } else if (item.entityType === "supplier_transaction") {
      const amount =
        asNumber(payload.amount) ?? asNumber(payload.totalAmount);
      const paid = asNumber(payload.amountPaid);
      const notes = asString(payload.notes);
      const details: string[] = [];
      if (amount !== null) details.push(`Total: ${formatCurrency(amount)}`);
      if (paid !== null) details.push(`Paid: ${formatCurrency(paid)}`);
      if (details.length > 0) summaryLines.push(details.join(" · "));
      if (notes) summaryLines.push(notes);
    } else if (item.entityType === "message") {
      const subject = asString(payload.subject) || asString(payload.title);
      const channel = asString(payload.channel);
      if (subject) summaryLines.push(subject);
      if (channel) summaryLines.push(`Channel: ${capitalizeLabel(channel)}`);
    }
  }

  if (summaryLines.length === 0) {
    summaryLines.push(`${item.method.toUpperCase()} ${item.endpoint}`);
  }

  let prettyPayload = item.payloadJson;
  if (payload) {
    try {
      prettyPayload = JSON.stringify(payload, null, 2);
    } catch {
      prettyPayload = item.payloadJson;
    }
  }

  const localPhotoUris =
    item.entityType === "product"
      ? extractLocalPhotoUrisFromOutboxPayload(item.payloadJson)
      : [];

  return {
    title,
    entityLabel,
    summaryLines,
    prettyPayload,
    pendingMediaUri: localPhotoUris[0] ?? null,
    pendingMediaCount: localPhotoUris.length,
  };
}
