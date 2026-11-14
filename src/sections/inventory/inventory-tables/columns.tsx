"use client";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import { InventoryInfoView } from "@/types/globals";
import { currencyFormatter } from "@/config/formatter";
import { format } from "date-fns";
// import { Checkbox } from "@/components/ui/checkbox";

export const columns: ColumnDef<InventoryInfoView>[] = [
  // {
  //   id: "select",
  //   header: ({ table }) => (
  //     <Checkbox
  //       checked={table.getIsAllPageRowsSelected()}
  //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
  //       aria-label="Select all"
  //     />
  //   ),
  //   cell: ({ row }) => (
  //     <Checkbox
  //       checked={row.getIsSelected()}
  //       onCheckedChange={(value) => row.toggleSelected(!!value)}
  //       aria-label="Select row"
  //     />
  //   ),
  //   enableSorting: false,
  //   enableHiding: false,
  // },
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
    accessorKey: "product_name",
    header: "PRODUCT NAME",
  },
  {
    accessorKey: "category",
    header: "CATEGORY",
  },
  // {
  //   accessorKey: "cost_price",
  //   header: "COST PRICE",
  // },
  {
    accessorKey: "unit_price",
    header: "UNIT PRICE",
    cell: ({ row }) => {
      return <p className="">{currencyFormatter(row?.original.unit_price)}</p>;
    },
  },
  {
    accessorKey: "restocked_quantity",
    header: "QUANTITY",
  },
  // {
  //   accessorKey: "total",
  //   header: "TOTAL",

  //   cell: ({ row }) => {
  //     return <p className="">{currencyFormatter(row?.original.unit_price)}</p>;
  //   },
  // },
  {
    accessorKey: "restock_date",
    header: "RESTOCKED ON",
    cell: ({ row }) => {
      return (
        <p className="">
          {format(new Date(row?.original.restock_date), "PPpp")}
        </p>
      );
    },
  },

  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
