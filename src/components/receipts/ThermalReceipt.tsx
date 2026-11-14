// components/receipts/ThermalReceipt.tsx
import { Fragment } from "react";
import { PaperConfig, ReceiptOrder, ReceiptItem } from "../../types/receipt";
import { formatCurrency, formatShortDate, toImageSrc } from "@/lib/helpers";

interface ThermalReceiptProps {
  order: ReceiptOrder;
  config: PaperConfig;
}

export function ThermalReceipt({ order, config }: ThermalReceiptProps) {
  const currency = order.currency ?? "GHS";
  const items = order.items || [];
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
  const total = order.total_amount;

  const scale = config.widthMm / 80;

  return (
    <div
      className="receipt-thermal"
      style={
        {
          "--accent": "#000000" /* Bypassing color for crisp text print */,
          fontSize: `${13 * scale}px`,
          fontWeight: "600",
        } as React.CSSProperties
      }
    >
      <header className="rt-header">
        {/* <div className="rt-divider" /> */}
        <div className="rt-header-container">
          {order.logoBase64 && (
            <div className="rt-logo-side">
              <img
                className="rt-logo"
                src={toImageSrc(order.logoBase64)}
                alt=""
              />
            </div>
          )}
          <div className={order.logoBase64 ? "rt-info-side" : "rt-info-full"}>
            <h1 className="rt-store-name">{order.storeName}</h1>
            <div className="rt-contact">{order.storeAddress}</div>
            <div className="rt-contact">{order.storePhone}</div>
            <div className="rt-contact">{order.storeEmail}</div>
          </div>
        </div>
      </header>

      <div className="rt-receipt-title">RECEIPT</div>

      <div className="rt-meta-grid">
        <div className="rt-meta-row">
          <span className="rt-label">Receipt #</span>
          <span>{order.sale_id}</span>
        </div>
        <div className="rt-meta-row">
          <span className="rt-label">Date</span>
          <span>{formatShortDate(order.sale_date)}</span>
        </div>
        <div className="rt-meta-row">
          <span className="rt-label">Paid By</span>
          <span>{order.customer_name || "Walk-in Customer"}</span>
        </div>
        <div className="rt-meta-row">
          <span className="rt-label">Payment</span>
          <span className="rt-capitalize">{order.payment_mode}</span>
        </div>
        <div className="rt-meta-row">
          <span className="rt-label">Served By</span>
          <span>{order.attendantName}</span>
        </div>
      </div>

      <div className="rt-divider" />

      {/* Items Table */}
      <table className="rt-table">
        <thead>
          <tr>
            <th className="rt-item-col" style={{ width: "55%" }}>
              Item
            </th>
            <th
              className="rt-qty-col"
              style={{ width: "9%", textAlign: "center" }}
            >
              Qty
            </th>
            <th
              className="rt-price-col"
              style={{ width: "18%", textAlign: "right" }}
            >
              Price
            </th>
            <th
              className="rt-total-col"
              style={{ width: "18%", textAlign: "right" }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="rt-item-row">
              <td className="rt-item-name">{item.product_name}</td>
              <td className="rt-qty">{item.quantity}</td>
              <td className="rt-price">{item.unit_price?.toFixed(2)}</td>
              <td className="rt-total">{item.subtotal?.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* <div className="rt-divider" /> */}

      {/* Totals */}
      <div className="rt-totals">
        <div className="rt-totals-row">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="rt-totals-row rt-totals-final">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>

      {/* <div className="rt-divider" /> */}

      {/* {order.qrCodeBase64 && (
        <div className="rt-qr-wrap">
          <img
            className="rt-qr"
            src={toImageSrc(order.qrCodeBase64)}
            alt="Receipt QR code"
          />
        </div>
      )} */}

      <div className="rt-footer-notes">
        <p className="rt-notes">Thank You!</p>
        <p className="rt-dev-tag">By Frebbytech Solutions (+233 543 772 591)</p>
        <div
          className="bt"
        
        />
      </div>
    </div>
  );
}

// // components/receipts/ThermalReceipt.tsx
// import { Fragment } from "react";
// import { PaperConfig, ReceiptOrder, ReceiptItem } from "../../types/receipt";
// import { formatCurrency, formatShortDate, toImageSrc } from "@/lib/helpers";

// interface ThermalReceiptProps {
//   order: ReceiptOrder;
//   config: PaperConfig;
// }

// export function ThermalReceipt({ order, config }: ThermalReceiptProps) {
//   const currency = order.currency ?? "GHS";
//   const items = order.items;
//   const subtotal = items?.reduce((sum, i) => sum + i.subtotal, 0);
//   const total = order.total_amount;

//   const scale = config.widthMm / 80;

//   return (
//     <div
//       className="receipt-thermal"
//       style={
//         {
//           "--accent": order.accentColor || "#1a1a2e",
//           fontSize: `${12 * scale}px`,
//         } as React.CSSProperties
//       }
//     >
//       <header className="rt-header">
//         {order.logoBase64 && (
//           <img className="rt-logo" src={toImageSrc(order.logoBase64)} alt="" />
//         )}
//         <h1 className="rt-store-name">{order.storeName}</h1>
//         <div className="rt-contact">{order.storeAddress}</div>
//         <div className="rt-contact">{order.storePhone}</div>
//         <div className="rt-contact">{order.storeEmail}</div>
//         <div className="rt-divider" />
//       </header>

//       <div className="rt-receipt-title">RECEIPT</div>

//       <div className="rt-meta-grid">
//         <div className="rt-meta-row">
//           <span className="rt-label">Receipt #</span>
//           <span>{order.sale_id}</span>
//         </div>
//         <div className="rt-meta-row">
//           <span className="rt-label">Date</span>
//           <span>{formatShortDate(order.sale_date)}</span>
//         </div>
//         <div className="rt-meta-row">
//           <span className="rt-label">Paid By</span>
//           <span>{order.customer_name || "Walk-in Customer"}</span>
//         </div>
//         <div className="rt-meta-row">
//           <span className="rt-label">Payment</span>
//           <span className="rt-capitalize">{order.payment_mode}</span>
//         </div>
//         <div className="rt-meta-row">
//           <span className="rt-label">Served By</span>
//           <span>{order.attendantName}</span>
//         </div>
//       </div>

//       <div className="rt-divider" />

//       {/* Items Table */}
//       <table className="rt-table">
//         <thead>
//           <tr>
//             <th className="rt-item-col">Item</th>
//             <th className="rt-qty-col">Qty</th>
//             <th className="rt-price-col">Price</th>
//             <th className="rt-total-col">Total</th>
//           </tr>
//         </thead>
//         <tbody>
//           {items.map((item, i) => (
//             <tr key={i} className="rt-item-row">
//               <td className="rt-item-name">{item.product_name}</td>
//               <td className="rt-qty">{item.quantity}</td>
//               <td className="rt-price">
//                 {item.unit_price}
//               </td>
//               <td className="rt-total">
//                 {item.subtotal}
//               </td>
//             </tr>
//           ))}
//         </tbody>
//       </table>

//       <div className="rt-divider" />

//       {/* Totals */}
//       <div className="rt-totals">
//         <div className="rt-totals-row">
//           <span>Subtotal</span>
//           <span>{formatCurrency(subtotal, currency)}</span>
//         </div>
//         {/* Add tax or discounts here if needed */}
//         <div className="rt-totals-row rt-totals-final">
//           <span>Total</span>
//           <span>{formatCurrency(total, currency)}</span>
//         </div>
//       </div>

//       <div className="rt-divider" />

//       {order.qrCodeBase64 && (
//         <div className="rt-qr-wrap">
//           <img
//             className="rt-qr"
//             src={toImageSrc(order.qrCodeBase64)}
//             alt="Receipt QR code"
//           />
//         </div>
//       )}

//       <p className="rt-notes">
//         Thank you for shopping with us 🤝.
//         <br />
//         {/* We look forward to serving you again  */}
//       </p>
//       <p style={{ fontSize: "8px",fontWeight:'bold', fontStyle: "italic" }}>
//         Designed by: Frebbytech Solutions(+233 543 772 591)
//       </p>
//     </div>
//   );
// }
