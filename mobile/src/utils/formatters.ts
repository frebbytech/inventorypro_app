/**
 * Currency, numeric, and date formatters matching src/config/formatter.ts and src/lib/currency.ts.
 * Uses GHS (GH₵) with en-GH formatting and safe fallback if Intl locale data is absent on older Android JSC/Hermes builds.
 */

export function formatCurrency(amount: number | string | null | undefined, currency = "GHS"): string {
  const numeric = Number(amount ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;

  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    const symbol = currency === "GHS" ? "GH₵" : `${currency} `;
    return `${symbol}${safe.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
}

export function formatNumber(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  try {
    return new Intl.NumberFormat("en-GH").format(safe);
  } catch {
    return safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function formatTimeOnly(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toTimeString().slice(0, 5);
  }
}

export function calculateMarginPercent(unitPrice: number, costPrice: number): number | null {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(costPrice) || costPrice <= 0) {
    return null;
  }
  return ((unitPrice - costPrice) / costPrice) * 100;
}

export function capitalizeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.toLowerCase() === "momo") return "MoMo";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
