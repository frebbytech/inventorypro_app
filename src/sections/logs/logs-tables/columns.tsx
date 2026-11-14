"use client";
import { ColumnDef } from "@tanstack/react-table";
// import { Checkbox } from "@/components/ui/checkbox";
// import { CellAction } from "./cell-action";
import { AuditLogView, AuditEntityType } from "@/types/globals";
import { format } from "date-fns";
import { EntityAuditCell } from "@/components/custom/EntityHoverCard";

export const columns: ColumnDef<AuditLogView>[] = [
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
  {
    accessorKey: "entity_type",
    header: "ENTITY TYPE",
  },
  {
    accessorKey: "action",
    header: "ACTION",
  },
  {
    accessorKey: "old_values",
    header: "OLD VALUES",
    cell: ({ row }) => {
      return (
        <div className="max-w-[150px] truncate">
          <EntityAuditCell
            entityType={row.original.entity_type as AuditEntityType}
            values={row.original.old_values}
          />
        </div>
      );
    },
  },
  {
    accessorKey: "new_values",
    header: "NEW VALUES",
    cell: ({ row }) => {
      return (
        <div className="relative max-w-[120px] truncate ">
          <EntityAuditCell
            entityType={row.original.entity_type as AuditEntityType}
            values={row.original.new_values}
          />
        </div>
      );
    },
  },
  {
    accessorKey: "user_name",
    header: "PERFORMED BY",
  },
  {
    accessorKey: "created_at",
    header: "PERFORMED ON",
    cell: ({ row }) => {
      return (
        <p className="">
          {format(new Date(row?.original?.created_at), "PPpp")}
        </p>
      );
    },
  },
  // {
  //   id: "actions",
  //   cell: ({ row }) => <CellAction data={row.original} />,
  // },
];
