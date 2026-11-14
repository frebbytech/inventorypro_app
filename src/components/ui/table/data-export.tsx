import { Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { exportToCsv, exportToExcel, exportToPDF } from "@/config/data-export";
import { extractPDFColumnsFromTable } from "./data-table";
import { Column, ColumnDef } from "@tanstack/react-table";
import { useSettings } from "@/providers/SettingsProvider";
import { Settings } from "@/types/globals";

type ExportDataProps<TData> = {
  data: TData[];
  title?: string;
  columns: Column<TData, any>[];
};

type exportPDFType<TData> = {
  data: TData[];
  columns: Column<TData, any>[];
  fileName: string;
};

export default function DataExport<TData>({
  data,
  title,
  columns,
}: ExportDataProps<TData>) {
  const { settings } = useSettings();

  const handlePDFExport = ({
    data,
    columns,
    fileName,
  }: exportPDFType<TData>) => {
    // Extract configuration fields automatically from your existing table setup
    const extractedPdfColumns = extractPDFColumnsFromTable<TData>(columns);

    exportToPDF<TData>({
      data: data, // Your current table row dataset array
      columns: extractedPdfColumns,
      title: fileName,
      fileName: fileName,
      settings,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 h-9">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[80px]">
        <DropdownMenuItem
          onClick={() => exportToExcel({ data, fileName: title || "Data" })}
        >
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportToCsv({ data, fileName: title || "Data" })}
        >
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            handlePDFExport({
              data,
              columns: columns,
              fileName: title || "Data",
            })
          }
        >
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
