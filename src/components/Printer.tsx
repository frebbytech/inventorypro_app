"use client";

import React, { useState } from "react";
// @ts-ignore - esc-pos-encoder lacks types
import EscPosEncoder from "esc-pos-encoder";
import { jsPDF } from "jspdf";
import { generateReceiptPDF } from "@/lib/receipt";
import { PaymentInfo } from "@/types/globals";



type ReceiptProps = {
  info: PaymentInfo;
};

export default function SmartInjectedPrinter({
  info,
}: ReceiptProps): React.JSX.Element {
  const [status, setStatus] = useState<string>("Ready");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const LINE_WIDTH = 42;
  const items = info?.products;

  // --- RAW BASE64 ASSETS ---
  //   const sampleBase64Logo: string = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAGBQTFRF////qqqqVFRUQEBAgICAX19fT09PUFBQX19fbW1tcXFxampqa2trf39/gICAhISEjIyMmJiYoKCgpKSkrKysvLy8wMDA0NDQ2NjY4ODg6Ojo8PDw+Pj4////MDAw////AAAA6b90cwAAABF0Uk5T/////////////////////wAlv96BAAAAn0lEQVR42mNgwA0YmZgYmBiwA0YoYGJgZgHzmBiwA0YoYGFgZgXzmBiwA0YoYGVgZgPzmBiwA0YoYGNwZgdzmBiwA0YoYGPwYAdzmBiwA0YoYGPwYgdzmBiwA0YoYGPwYQdzmBiwA0YoYGNwZgdzmBiwA0YoYGNwZgdzmBiwA0YoYGNwZgdzmBiwA0YoYGNwZgdzmBiwA0YoYGNwZgcDAPbYAn97InscAAAAAElFTkSuQmCC";
  //   const sampleBase64Qr: string = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABmJLR0QA/wD/AP+gvaeTAAAAcklEQVR42u3XwQkAMQzE0E67/8pSgX0EAs6Bnd8Zp7IsX2fNeeR9gA8IICCAgAACCAlw6YF9v9wPCCAggIACAggJICCAgAACCAnwzwP0wL5f7gcEEBBAQAEBhAQQEEBAAAEBhAQQEEBAAAEBhAS4dG8P0AEwswXvQfGCAAAAAElFTkSuQmCC";

  // --- GRID TEXT FORMATTER ---
  const padRow = (left: string, right: string): string => {
    const spaces = LINE_WIDTH - (left.length + right.length);
    return spaces > 0
      ? left + " ".repeat(spaces) + right
      : left.substring(0, LINE_WIDTH - right.length - 3) + "... " + right;
  };

  // --- INTERNAL HELPER TO LOAD HTML IMAGES FOR ESC/POS ---
  const loadImageElement = (base64Src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new globalThis.Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = base64Src;
    });
  };

  // --- ENGINE A: SILENT PDF GENERATION WITH IMAGES ---
  const generateSilentPdfFallback = (): void => {
    setStatus("Printer unavailable. Compiling PDF invoice...");

    // Layout configuration corresponding to standard 80mm thermal receipt sizing
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: [226, 450],
    });

    // 1. Inject Graphic Logo Top-Center
    // Parameters: addImage(imageData, format, x, y, width, height)
    // doc.addImage(sampleBase64Logo, 'PNG', 97, 15, 32, 32);

    doc.setFont("courier", "normal");
    doc.setFontSize(10);

    let yPosition = 65; // Push text starting point below the injected logo graphic
    const lineSpacing = 14;

    const addPdfLine = (text: string, align: "left" | "center" = "left") => {
      if (align === "center") {
        doc.text(text, 113, yPosition, { align: "center" });
      } else {
        doc.text(text, 12, yPosition);
      }
      yPosition += lineSpacing;
    };

    // Render Receipt Text Tree
    addPdfLine("*** HYBRID INVOICE BACKUP ***", "center");
    addPdfLine("Order Ref: #11094", "center");
    addPdfLine("=".repeat(LINE_WIDTH));
    addPdfLine(padRow("QTY  DESCRIPTION", "PRICE"));
    addPdfLine("-".repeat(LINE_WIDTH));

    items.forEach((item) => {
      addPdfLine(
        padRow(`${item.quantity}x   ${item.name}`, item.unit_price?.toString()),
      );
    });

    addPdfLine("-".repeat(LINE_WIDTH));
    doc.setFont("courier", "bold");
    addPdfLine(padRow("TOTAL AMOUNT DUE", info.totalAmount?.toString()));
    doc.setFont("courier", "normal");
    addPdfLine("=".repeat(LINE_WIDTH));

    addPdfLine("Scan below for digital verification", "center");
    yPosition += 5; // Extra padding before QR block

    // 2. Inject QR Code Bottom-Center
    // doc.addImage(sampleBase64Qr, 'PNG', 89, yPosition, 48, 48);

    yPosition += 60; // Push text below QR bounding coordinates
    doc.text("Thank You!", 113, yPosition, { align: "center" });

    // Download instantly to file memory structure
    doc.save(`Invoice-Receipt-${info.receipt_number}.pdf`);
    setStatus("PDF generated silently with graphics!");
  };

  // --- ENGINE B: HARDWARE CONNECTOR VIA USB ---
  const handlePrintTransaction = async (): Promise<void> => {
    if (isProcessing) return;
    setIsProcessing(true);
    setStatus("Probing USB hardware connection channels...");

    try {
      // 1. Check for hardware device profile assignment
      const device = await (navigator as any).usb.requestDevice({
        filters: [],
      });

      setStatus("Printer found! Loading graphics...");
      //   const logoImg = await loadImageElement(sampleBase64Logo);
      //   const qrImg = await loadImageElement(sampleBase64Qr);

      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);

      // 2. Format ESC/POS data structures
      const encoder = new EscPosEncoder();
      let receipt: EscPosEncoder = encoder
        .initialize()
        .align("center")
        // .image(logoImg, 32, 32, 'threshold')
        .line(" ")
        .line("*** HARDWARE RECEIPT ***")
        .line("-".repeat(LINE_WIDTH))
        .align("left");

      items.forEach((item) => {
        receipt = receipt.line(
          padRow(`${item.quantity}x ${item.name}`, item.unit_price?.toString()),
        );
      });

      const encodedReceipt = receipt
        .line("-".repeat(LINE_WIDTH))
        .align("center")
        // .image(qrImg, 48, 48, 'threshold')
        .line(" ")
        .cut()
        .encode();

      // 3. Dispatch raw data down the cable endpoint
      const endpoints = device.configuration.interfaces.alternates.endpoints;
      const outEndpoint = endpoints.find((ep: any) => ep.direction === "out");

      if (!outEndpoint) throw new Error("Endpoint channel unavailable.");

      await device.transferOut(outEndpoint.endpointNumber, encodedReceipt);
      await device.releaseInterface(0);
      await device.close();

      setStatus("Receipt issued successfully via hardware!");
    } catch (error) {
      console.warn(
        "Hardware failure trigger, routing safely to PDF logic loop:",
        error,
      );

      // 4. Executing silent fallback bypass structure seamlessly on catch triggers
      //   generateSilentPdfFallback();
      // generateReceiptPDF();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button
      onClick={handlePrintTransaction}
      disabled={isProcessing}
      style={{
        padding: "12px 24px",
        backgroundColor: "#0070f3",
        color: "#fff",
        border: "none",
        borderRadius: "6px",
        fontWeight: "bold",
        cursor: isProcessing ? "not-allowed" : "pointer",
        width: "100%",
        boxShadow: "0 4px 6px rgba(0, 112, 243, 0.2)",
      }}
    >
      {isProcessing ? "Routing Layout..." : "Process Order Receipt"}
    </button>
  );
}

// // src/components/AdvancedNextPrinter.tsx
// "use client";

// import React, { useState, useEffect } from "react";
// // @ts-ignore
// import EscPosEncoder from "esc-pos-encoder";

// interface LineItem {
//   qty: string | number;
//   desc: string;
//   tax: string;
//   price: string;
// }

// interface ColumnWidths {
//   qty: number;
//   desc: number;
//   tax: number;
//   price: number;
// }

// export default function AdvancedNextPrinter(): React.JSX.Element {
//   const [status, setStatus] = useState<string>("Initializing...");
//   const [isSupported, setIsSupported] = useState<boolean>(false);

//   const LINE_WIDTH: number = 42;
//   const COL_WIDTHS: ColumnWidths = { qty: 4, desc: 20, tax: 6, price: 12 };

//   // --- Safe Browser Feature Detection ---
//   useEffect(() => {
//     if (typeof window !== "undefined" && "usb" in navigator) {
//       setIsSupported(true);
//       setStatus("Ready");
//     } else {
//       setIsSupported(false);
//       setStatus("WebUSB not supported in this browser (Use Chrome/Edge).");
//     }
//   }, []);

//   const sampleBase64Logo: string =
//     "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAGBQTFRF////qqqqVFRUQEBAgICAX19fT09PUFBQX19fbW1tcXFxampqa2trf39/gICAhISEjIyMmJiYoKCgpKSkrKysvLy8wMDA0NDQ2NjY4ODg6Ojo8PDw+Pj4////MDAw////AAAA6b90cwAAABF0Uk5T/////////////////////wAlv96BAAAAn0lEQVR42mNgwA0YmZgYmBiwA0YoYGJgZgHzmBiwA0YoYGFgZgXzmBiwA0YoYGVgZgPzmBiwA0YoYGNwZgdzmBiwA0YoYGPwYAdzmBiwA0YoYGPwYgdzmBiwA0YoYGPwYQdzmBiwA0YoYGNwZgdzmBiwA0YoYGNwZgdzmBiwA0YoYGNwZgdzmBiwA0YoYGNwZgdzmBiwA0YoYGNwZgcDAPbYAn97InscAAAAAElFTkSuQmCC";
//   const sampleBase64Qr: string =
//     "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABmJLR0QA/wD/AP+gvaeTAAAAcklEQVR42u3XwQkAMQzE0E67/8pSgX0EAs6Bnd8Zp7IsX2fNeeR9gA8IICCAgAACCAlw6YF9v9wPCCAggIACAggJICCAgAACCAnwzwP0wL5f7gcEEBBAQAEBhAQQEEBAAAEBhAQQEEBAAAEBhAS4dG8P0AEwswXvQfGCAAAAAElFTkSuQmCC";

//   const items: LineItem[] = [
//     { qty: "1", desc: "Sourdough Loaf", tax: "T1", price: "$6.50" },
//     { qty: "2", desc: "Almond Croissant", tax: "T1", price: "$18.00" },
//   ];

//   const createMultiColumnRow = (
//     qty: string | number,
//     desc: string,
//     tax: string,
//     price: string,
//   ): string => {
//     let d: string = desc;
//     if (d.length > COL_WIDTHS.desc) {
//       d = d.substring(0, COL_WIDTHS.desc - 2) + "..";
//     } else {
//       d = d.padEnd(COL_WIDTHS.desc, " ");
//     }
//     return `${qty.toString().padEnd(COL_WIDTHS.qty, " ")}${d}${tax.padEnd(COL_WIDTHS.tax, " ")}${price.padStart(COL_WIDTHS.price, " ")}`;
//   };

//   // Safe Browser-Only Image Construction
//   const loadImageElement = (base64Src: string): Promise<HTMLImageElement> => {
//     return new Promise((resolve, reject) => {
//       if (typeof window === "undefined") {
//         return reject(new Error("Cannot load images on SSR server."));
//       }

//       const img = new globalThis.Image();

//       img.onload = async () => {
//         try {
//           // Modern browser performance check: forces the browser to decode
//           // the base64 matrix in memory completely before passing it to ESC/POS
//           if ("decode" in img) {
//             await img.decode();
//           }
//           resolve(img);
//         } catch (decodeError) {
//           console.warn(
//             "Async decoding failed, falling back to instant resolution",
//             decodeError,
//           );
//           resolve(img); // Resolve anyway as fallback
//         }
//       };

//       img.onerror = (err) => {
//         console.error("Base64 Render Image Core Failure:", err);
//         reject(
//           new Error(
//             "The browser layout engine failed to decode the image payload format.",
//           ),
//         );
//       };

//       // Apply source last to ensure handlers catch the execution cleanly
//       img.src = base64Src;
//     });
//   };

//   const printAdvancedReceipt = async (): Promise<void> => {
//     if (!isSupported) return;
//     try {
//       setStatus("Processing layout assets...");
//     //   const logoImg = await loadImageElement(sampleBase64Logo);
//     //   const qrImg = await loadImageElement(sampleBase64Qr);

//       setStatus("Connecting to hardware via WebUSB...");
//       const device = await (navigator as any).usb.requestDevice({
//         filters: [],
//       });
//       await device.open();
//       await device.selectConfiguration(1);
//       await device.claimInterface(0);

//       setStatus("Encoding layout...");
//       const encoder = new EscPosEncoder();
//       let receipt = encoder.initialize();

//       receipt = receipt
//         .align("center")
//         // .image(logoImg, 32, 32, "threshold")
//         .line(" ")
//         .line("NEXT.JS COMPLIANT SHOP")
//         .line("-".repeat(LINE_WIDTH))
//         .align("left");

//       receipt = receipt.line(
//         createMultiColumnRow("QTY", "DESCRIPTION", "TAX", "PRICE"),
//       );
//       items.forEach((item) => {
//         receipt = receipt.line(
//           createMultiColumnRow(item.qty, item.desc, item.tax, item.price),
//         );
//       });

//       receipt = receipt
//         .line("-".repeat(LINE_WIDTH))
//         .align("center")
//         // .image(qrImg, 48, 48, "threshold")
//         .line(" ")
//         .cut()
//         .encode();

//       const endpoints =
//         device.configuration.interfaces[0].alternates[0].endpoints;
//       const outEndpoint = endpoints.find((ep: any) => ep.direction === "out");

//       if (!outEndpoint) throw new Error("Outbound endpoint channel missing.");

//       await device.transferOut(outEndpoint.endpointNumber, receipt);
//       await device.releaseInterface(0);
//       await device.close();
//       setStatus("Print Complete!");
//     } catch (error) {
//       console.error(error);
//       setStatus(
//         `Error: ${error instanceof Error ? error.message : "Print failed"}`,
//       );
//     }
//   };

//   return (
//     <div
//       style={{ padding: "24px", border: "1px solid #ccc", borderRadius: "8px" }}
//     >
//       <h3>Next.js WebUSB Print Engine</h3>
//       <p>
//         Status:{" "}
//         <strong style={{ color: isSupported ? "green" : "red" }}>
//           {status}
//         </strong>
//       </p>
//       <button
//         onClick={printAdvancedReceipt}
//         disabled={!isSupported}
//         style={{
//           padding: "10px 20px",
//           cursor: isSupported ? "pointer" : "not-allowed",
//         }}
//       >
//         Print Dynamic Layout
//       </button>
//     </div>
//   );
// }
