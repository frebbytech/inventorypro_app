"use client";
import { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, icons, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<
  TData,
  TValue,
> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
  icon?: typeof Package;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  icon: Icon,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div
        className={cn(
           "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
          className,
        )}
      >
       {Icon &&  <Icon className="h-3.5 w-3.5" />}
        {title}
      </div>
    );
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "-ml-3 h-8 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-transparent hover:text-foreground",
        sorted && "text-foreground",
        className,
      )}
    >
       {Icon &&  <Icon className="h-3.5 w-3.5" />}
      <span>{title}</span>
      {sorted === "asc" ? (
        <ArrowUp className="h-3.5 w-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </Button>
  );
}
