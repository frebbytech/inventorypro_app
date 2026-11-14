"use client";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import { SaleSummaryView } from "@/types/globals";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const columns: ColumnDef<SaleSummaryView>[] = [
  {
    accessorKey: "sale_date",
    header: "SALES DATE",
    cell: ({ row }) => format(row.original.sale_date, "PPpp"),
  },
  {
    accessorKey: "customer_name",
    header: "CUSTOMER NAME",
  },
  {
    accessorKey: "phonenumber",
    header: "PHONE NUMBER",
  },
  {
    accessorKey: "total_amount",
    header: "TOTAL AMOUNT (GHS)",
  },
  // {
  //   accessorKey: "total_amount",
  //   header: "AMOUNT PAID (GHS)",
  // },
  // {
  //   accessorKey: "balance",
  //   header: "BALANCE (GHS)",
  // },
  {
    accessorKey: "payment_mode",
    header: "PAYMENT MODE",
  },
  {
    accessorKey: "status",
    header: "STATUS",
    cell: ({ row }) => {
      return (
        <Badge
          variant="outline"
          className={cn(
            "text-sm capitalize text-white",
            row.original.status === "completed"
              ? " bg-green-500"
              : " bg-yellow-500"
          )}
        >
          {row.original.status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "user_name",
    header: "COMPLETED BY",
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
