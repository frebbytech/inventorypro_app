// components/receipts/SheetReceipt.tsx

import { PaperConfig, ReceiptOrder } from "../../types/receipt";
import {
  formatCurrency,
  formatDate,
  formatShortDate,
  toImageSrc,
} from "@/lib/helpers";

interface SheetReceiptProps {
  order: ReceiptOrder;
  config: PaperConfig;
}

export function SheetReceipt({ order, config }: SheetReceiptProps) {
  const currency = order.currency ?? "GHS";
  const taxRate = order.taxRate ?? 0;
  const subtotal = order?.items.reduce((sum, i) => sum + i.subtotal, 0);
  const tax = subtotal * taxRate;
  const total = order.total_amount || subtotal + tax;
  const items = order?.items;

  const scale = config.widthMm / 210;

  return (
    <div
      className="receipt-sheet"
      style={
        {
          "--accent": order.accentColor,
          fontSize: `${16 * scale}px`,
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <header className="rs-header">
        {order.logoBase64 && (
          <img className="rs-logo" src={toImageSrc(order.logoBase64)} alt="" />
        )}
        <h1 className="rs-store-name">{order.storeName}</h1>
        <div className="rs-contact-row">
          <span className="rs-contact-item">📍 {order.storeAddress}</span>
          <span className="rs-contact-item">📞 {order.storePhone}</span>
          <span className="rs-contact-item">✉ {order.storeEmail}</span>
        </div>
        <div className="rs-divider" />
      </header>

      {/* Paid by / Receipt title */}
      <div className="rs-top-row">
        <div>
          <div className="rs-label">Paid By</div>
          <div className="rs-value">
            {order.customer_name || "Walk-in Customer"}
          </div>
        </div>
        <div className="rs-receipt-title">RECEIPT</div>
      </div>

      {/* Sale details */}
      <div className="rs-details">
        <div className="rs-label rs-details-heading">Sale Details</div>
        <div className="rs-details-grid">
          <div className="rs-details-col">
            <div className="rs-detail-row">
              <span className="rs-detail-key">Date</span>
              <span>{formatDate(order.sale_date)}</span>
            </div>
            <div className="rs-detail-row">
              <span className="rs-detail-key">Payment Method</span>
              <span className="rs-capitalize">{order.payment_mode}</span>
            </div>
            <div className="rs-detail-row">
              <span className="rs-detail-key">Served By</span>
              <span>{order.attendantName}</span>
            </div>
          </div>
          <div className="rs-details-col rs-details-col-right">
            <div className="rs-detail-row">
              <span className="rs-label">Receipt #</span>
              <span>{order.sale_id}</span>
            </div>
            <div className="rs-detail-row">
              <span className="rs-label">Receipt Date</span>
              <span>{formatShortDate(order.sale_date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Items table – Description first, then Qty */}
      <table className="rs-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="rs-qty-header">Qty</th>
            <th className="rs-align-right">Unit Price</th>
            <th className="rs-align-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>{item.product_name}</td>
              <td className="rs-qty-cell">{item.quantity}</td>
              <td className="rs-align-right">
                {formatCurrency(item.unit_price, currency)}
              </td>
              <td className="rs-align-right">
                {formatCurrency(item.subtotal, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="rs-totals">
        <div className="rs-totals-row">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="rs-totals-row">
          <span>Tax</span>
          <span>{formatCurrency(tax, currency)}</span>
        </div>
        <div className="rs-totals-row rs-totals-final">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>
      {taxRate > 0 && (
        <div className="rs-tax-footnote">
          {/* *Tax: {(taxRate * 100).toFixed(2)}% */}
        </div>
      )}

      {/* Notes + QR (larger) */}
      <div className="rs-footer">
        <div className="rs-notes">
          <div className="rs-label">Notes</div>
          <p>
            Thank you for shopping with us. We look forward to serving you
            again.
          </p>
        </div>
        {order.qrCodeBase64 && (
          <img
            className="rs-qr"
            src={toImageSrc(order.qrCodeBase64)}
            alt="Receipt QR code"
          />
        )}
      </div>
      <p
        style={{
          fontSize: "9px",
          fontWeight: "bold",
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        Designed by: Frebbytech Solutions(+233 543 772 591)
      </p>
    </div>
  );
}
