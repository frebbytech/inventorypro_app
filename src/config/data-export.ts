// utils/exportToExcel.ts
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import autoTable from "jspdf-autotable";
import { Settings } from "@/types/globals";

export interface PDFColumnConfig<TData> {
  header: string;
  // Allows extraction via a string key or a custom formatting function
  accessor: keyof TData | ((row: TData) => string | number);
}

export interface ExportPDFProps<TData> {
  data: TData[];
  columns: PDFColumnConfig<TData>[];
  title?: string;
  fileName?: string;
  settings: Settings | null;
}

type ExportProps<TData> = {
  data: TData[];
  fileName: string;
};

export function exportToExcel<TData>({
  data,
  fileName = "summary",
}: ExportProps<TData>) {
  // Create a new workbook and worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function exportToCsv<TData>({
  data,
  fileName = "summary",
}: ExportProps<TData>) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  XLSX.writeFile(workbook, `${fileName}.csv`, { bookType: "csv" });
}

export function exportToPDF<TData>({
  data,
  columns,
  title = "Report Summary",
  fileName = "summary",
  settings,
}: ExportPDFProps<TData>) {
  // 1. Determine layout orientation based on the number of columns
  const isLandscape = columns.length > 6;

  // Initialize document with dynamic structure:
  // p = portrait, l = landscape | pt = points, mm = millimeters | a4 = page size
  const doc = new jsPDF({
    orientation: isLandscape ? "l" : "p",
    unit: "mm",
    format: "a4",
  });

  // 2. Fetch runtime page dimensions dynamically to calculate flexible layouts
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const rightMargin = pageWidth - 14;

  // --- 1. RENDER BASE64 IMAGE LOGO ---
  // Replace this string placeholder with your actual base64 data variable or string import
  const base64LogoUrl = settings?.logo;

  if (base64LogoUrl) {
    try {
      // Parameters: addImage(imageData, format, x, y, width, height)
      // 14 and 12 are the coordinate starting points; 15 and 15 are the box size dimensions in millimeters
      doc.addImage(base64LogoUrl, "PNG", 14, 12, 15, 15);
    } catch (error) {
      console.error("Failed to render base64 logo image in PDF:", error);
      // Fallback: draws a simple box if the base64 string is corrupted or invalid
      doc.setFillColor(79, 70, 229);
      doc.rect(14, 12, 15, 15, "F");
    }
  }

  // --- COMPANY METADATA BLOCK (Shifted slightly right to make room for your logo) ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(79, 70, 229);
  doc.text(settings?.business_name || "", 34, 18); // x moved from 30 to 34 to clear the wider image logo

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(settings?.business_address || "", 34, 23);
  doc.text(settings?.business_email || "", 34, 28);

  // Decorative thin divider line below company info
doc.setDrawColor(226, 232, 240);
doc.setLineWidth(0.5);
doc.line(14, 33, rightMargin, 33); 

  // --- REPORT TITLE & METADATA ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59); // Dark slate text color
  doc.text(title, 14, 43);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated on: ${format(new Date(), "MMMM dd, yyyy HH:mm:a")}`,
    14,
    49,
  );

  // Extract columns headers and map table row strings
  const headers = [columns.map((col) => col.header)];
  const tableRows = data.map((row) =>
    columns.map((col) => {
      if (typeof col.accessor === "function") {
        return col.accessor(row);
      }
      const value = row[col.accessor];
      return value !== undefined && value !== null ? String(value) : "N/A";
    }),
  );

  // --- DATA TABLE INJECTION WITH AUTO FOOTER ---
  autoTable(doc, {
    startY: 55,
    head: headers,
    body: tableRows,
    theme: "striped",
    headStyles: {
      // fillColor: settings?.accent_color,
      fontStyle: "bold",
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      overflow: "linebreak", // Automatically wraps text inside narrow grid columns
    },
    alternateRowStyles: {
      // fillColor: settings?.accent_color,
    },
    didDrawPage: (data) => {
      // 4. Clean footer drawing with margins that adapt to page resizing
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.5);
      doc.line(14, pageHeight - 18, rightMargin, pageHeight - 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);

      const footerNote =
        "Confidential - Internal Use Only. Thank you for your business.";
      doc.text(footerNote, 14, pageHeight - 12);

      const pageNumberString = `Page ${data.pageNumber}`;
      doc.text(
        pageNumberString,
        rightMargin - doc.getTextWidth(pageNumberString),
        pageHeight - 12,
      );
    },
  });

  doc.save(`${fileName}.pdf`);
}
