"use client";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import {  SupplierInfoView } from "@/types/globals";
import { Checkbox } from "@/components/ui/checkbox";

export const columns: ColumnDef<SupplierInfoView>[] = [
  // {
  //   accessorKey: "photo_url",
  //   header: "IMAGE",
  //   cell: ({ row }) => {
  //     return (
  //       <div className="relative aspect-square">
  //         <Image
  //           src={row.getValue("photo_url")}
  //           alt={row.getValue("name")}
  //           fill
  //           className="rounded-lg"
  //         />
  //       </div>
  //     );
  //   },
  // },
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "NAME",
  },
  {
    accessorKey: "company_name",
    header: "COMPANY",
  },
  {
    accessorKey: "address",
    header: "ADDRESS",
  },
  {
    accessorKey: "phonenumber",
    header: "PHONE NUMBER",
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
