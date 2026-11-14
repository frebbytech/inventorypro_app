"use client";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import { CustomerSaleView } from "@/types/globals";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const columns: ColumnDef<CustomerSaleView>[] = [

  {
    accessorKey: "saleDate",
    header: "SALES DATE",
    cell: ({ row }) => format(row.original.saleDate,"PPpp")
  },
  {
    accessorKey: "customerName",
    header: "CUSTOMER NAME",
  },
  {
    accessorKey: "phoneNumber",
    header: "PHONE NUMBER",
  },
  {
    accessorKey: "totalAmount",
    header: "TOTAL AMOUNT",
  },
  {
    accessorKey: "paymentMode",
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
            "text-sm w-15 capitalize text-white",
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
    accessorKey: "issuerName",
    header: "COMPLETED BY",
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
