"use client";

// import { Checkbox } from "@/components/ui/checkbox";
import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import { User } from "@/types/globals";
import { Badge } from "@/components/ui/badge";
import ToggleRole from "@/components/admin/employees/ToggleRole";
export const columns: ColumnDef<User>[] = [
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
    accessorKey: "fullname",
    header: "NAME",
  },
  {
    accessorKey: "username",
    header: "USERNAME",
  },
  {
    accessorKey: "email",
    header: "EMAIL",
  },
  {
    accessorKey: "phonenumber",
    header: "PHONE NUMBER",
  },
  {
    accessorKey: "role",
    header: "ROLE",
    cell: ({ row }) => (
      <ToggleRole id={row.original.id} role={row.original.role} />
    ),
  },
   {
    id: "status",
    header: "STATUS",
    cell: ({ row }) => {
      const isLocked =
        row.original.locked_until &&
        new Date(row.original.locked_until) > new Date();

      if (isLocked) {
        return <Badge variant="destructive">Locked</Badge>;
      }

      return (
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-700 border-emerald-200"
        >
          Active
        </Badge>
      );
    },
  },

  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
