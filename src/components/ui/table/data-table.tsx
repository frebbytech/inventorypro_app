"use client";
import _ from "lodash";
import React, { useState } from "react";
import {
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from "@radix-ui/react-icons";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Layers,
  LayoutGrid,
  Table as TableIcon,
} from "lucide-react";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  Updater,
  VisibilityState,
  useReactTable,
  Column,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import ColumnFilter from "./column-filter";
import DataExport from "./data-export";
import { BulkActions } from "./bulk-actions";
import { PDFColumnConfig } from "@/config/data-export";
import { format } from "date-fns";

export function extractPDFColumnsFromTable<TData>(
  visibleColumns: Column<TData, any>[],
): PDFColumnConfig<TData>[] {
  return visibleColumns
    .map((column) => {
      const colDef = column.columnDef as any;

      let headerText = "N/A";
      if (typeof colDef.header === "string") {
        headerText = colDef.header;
      } else if (column.id) {
        headerText = column.id.charAt(0).toUpperCase() + column.id.slice(1);
      }

      let accessor: any = null;
      if (typeof colDef.accessorFn === "function") {
        accessor = (row: TData) => {
          const value = colDef.accessorFn(row);
          if (value instanceof Date) return format(value, "yyyy-MM-dd HH:mm");
          return value;
        };
      } else if (colDef.accessorKey) {
        accessor = (row: TData) => {
          const value = row[colDef.accessorKey as keyof TData];
          if (value instanceof Date) return format(value, "yyyy-MM-dd HH:mm");
          return value !== undefined && value !== null ? String(value) : "N/A";
        };
      }

      if (!accessor || column.id === "actions" || column.id === "select")
        return null;

      return {
        header: headerText,
        accessor: accessor,
      };
    })
    .filter((col): col is PDFColumnConfig<TData> => col !== null);
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  dataExports?: TData[];
  totalItems: number;
  pageSizeOptions?: number[];
  tableName?: string;
  tableFilter?: React.ReactNode;
  showBulkStatusUpdate?: boolean;
  renderBulkActions?: (props: {
    selectedIds: string[];
    selectedRows: TData[];
    clearSelection: () => void;
  }) => React.ReactNode;
  renderGridView?: (props: {
    data: TData[];
    selectedIds: string[];
    onToggleSelect: (id: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
    isAllSelected: boolean;
    table: any;
  }) => React.ReactNode;
  defaultView?: "table" | "grid";
}

export function DataTable<TData, TValue>({
  columns,
  data,
  dataExports,
  totalItems,
  pageSizeOptions = [10, 20, 30, 40, 50],
  tableName,
  tableFilter,
  showBulkStatusUpdate,
  renderBulkActions,
  renderGridView,
  defaultView = "table",
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // View state (table vs grid)
  const [viewParam, setViewParam] = useQueryState(
    "view",
    parseAsString
      .withOptions({ shallow: false, history: "push" })
      .withDefault(defaultView),
  );

  const currentView = renderGridView ? (viewParam === "grid" ? "grid" : "table") : "table";

  // URL query state for pagination
  const [currentPage, setCurrentPage] = useQueryState(
    "page",
    parseAsInteger
      .withOptions({ shallow: false, history: "push" })
      .withDefault(1),
  );
  const [pageSize, setPageSize] = useQueryState(
    "limit",
    parseAsInteger
      .withOptions({ shallow: false, history: "push" })
      .withDefault(10),
  );

  // URL query state for sorting — a single-column sort, since this drives a
  // server-side ORDER BY rather than an in-memory re-sort of one page.
  const [sortBy, setSortBy] = useQueryState(
    "sortBy",
    parseAsString.withOptions({ shallow: false, history: "push" }).withDefault(""),
  );
  const [sortOrder, setSortOrder] = useQueryState(
    "sortOrder",
    parseAsString.withOptions({ shallow: false, history: "push" }).withDefault("asc"),
  );

  const sortingState: SortingState = sortBy
    ? [{ id: sortBy, desc: sortOrder === "desc" }]
    : [];

  const handleSortingChange = (updaterOrValue: Updater<SortingState>) => {
    const newSorting =
      typeof updaterOrValue === "function"
        ? updaterOrValue(sortingState)
        : updaterOrValue;

    const next = newSorting[0];
    if (!next) {
      setSortBy("");
      setSortOrder("asc");
    } else {
      setSortBy(next.id);
      setSortOrder(next.desc ? "desc" : "asc");
    }
    // A new sort order invalidates the current page's meaning — start over.
    setCurrentPage(1);
  };

  // Pagination state for TanStack Table (zero‑based page index)
  const paginationState: PaginationState = {
    pageIndex: currentPage - 1,
    pageSize: pageSize,
  };

  const pageCount = Math.ceil(totalItems / pageSize) || 1;

  const handlePaginationChange = (
    updaterOrValue:
      | PaginationState
      | ((old: PaginationState) => PaginationState),
  ) => {
    const newPagination =
      typeof updaterOrValue === "function"
        ? updaterOrValue(paginationState)
        : updaterOrValue;

    if (newPagination.pageSize !== paginationState.pageSize) {
      setCurrentPage(1);
      setPageSize(newPagination.pageSize);
    } else {
      setCurrentPage(newPagination.pageIndex + 1);
      setPageSize(newPagination.pageSize);
    }
  };

  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      pagination: paginationState,
      columnVisibility,
      rowSelection,
      sorting: sortingState,
    },
    getRowId: (row: any, index) =>
      row.id || row.inventory_id || row.product_id || String(index),
    onPaginationChange: handlePaginationChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    enableMultiSort: false,
  });

  const isProductsOrInventory =
    tableName === "products" ||
    tableName === "inventory" ||
    tableName === "stocks";

  const selectedRows = (
    table
      .getSelectedRowModel()
      ?.rows.map(
        (row: any) =>
          row.original?.id ||
          row.original?.inventory_id ||
          row.original?.product_id ||
          row.id,
      )
      .filter(Boolean) || []
  ) as string[];

  const selectedDataItems = (table
    .getSelectedRowModel()
    ?.rows.map((row: any) => row.original)
    .filter(Boolean) || []) as TData[];

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= pageCount) {
      setCurrentPage(val);
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="border-b bg-card pb-4">
        <div>
          {tableFilter}

          <div className="flex flex-col sm:flex-row flex-1 items-stretch sm:items-center justify-between gap-4 mt-4">
            {(table.getIsAllPageRowsSelected() ||
              table.getIsSomePageRowsSelected()) && (
              <div className="flex-1">
                {renderBulkActions ? (
                  renderBulkActions({
                    selectedIds: selectedRows,
                    selectedRows: selectedDataItems,
                    clearSelection: () => setRowSelection({}),
                  })
                ) : (
                  <BulkActions
                    selectedIds={selectedRows}
                    table={tableName}
                    onClearSelection={() => setRowSelection({})}
                    showStatusUpdate={
                      showBulkStatusUpdate ?? isProductsOrInventory
                    }
                  />
                )}
              </div>
            )}
            <div className="flex gap-2 items-center ml-auto">
              {renderGridView && (
                <div className="inline-flex rounded-lg border bg-background p-0.5 shadow-sm">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 px-2.5 text-sm gap-1.5 font-medium transition-all",
                      currentView === "table"
                        ? "bg-muted text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setViewParam("table")}
                    title="Table View"
                  >
                    <TableIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Table</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 px-2.5 text-sm gap-1.5 font-medium transition-all",
                      currentView === "grid"
                        ? "bg-muted text-foreground shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setViewParam("grid")}
                    title="Grid View"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </Button>
                </div>
              )}
              {currentView === "table" && <ColumnFilter table={table} />}
              <DataExport
                data={dataExports || []}
                title={tableName}
                columns={table.getVisibleFlatColumns()}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {currentView === "grid" && renderGridView ? (
          <div className="p-4 sm:p-6">
            {renderGridView({
              data,
              selectedIds: selectedRows,
              onToggleSelect: (id: string, selected: boolean) => {
                setRowSelection((prev: any) => ({
                  ...prev,
                  [id]: selected,
                }));
              },
              onSelectAll: (selected: boolean) => {
                if (selected) {
                  const newSelection: Record<string, boolean> = {};
                  data.forEach((item: any, index: number) => {
                    const rowId =
                      item.id ||
                      item.inventory_id ||
                      item.product_id ||
                      String(index);
                    newSelection[rowId] = true;
                  });
                  setRowSelection(newSelection);
                } else {
                  setRowSelection({});
                }
              },
              isAllSelected:
                data.length > 0 &&
                data.every((item: any, index: number) => {
                  const rowId =
                    item.id ||
                    item.inventory_id ||
                    item.product_id ||
                    String(index);
                  return !!(rowSelection as any)[rowId];
                }),
              table,
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-muted/30">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="h-11 px-4 whitespace-nowrap"
                        aria-sort={
                          header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : "none"
                        }
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="text-sm">
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className="transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted/60"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}  className="py-2  text-muted-foreground">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={columns.length}
                      className="h-72 w-full text-center"
                    >
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto text-muted-foreground">
                        <Layers className="h-8 w-8 text-muted-foreground/60 stroke-[1.5]" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            No records found
                          </p>
                          <p className="text-sm text-muted-foreground">
                            There is no data matching your selection. Try
                            adjusting your filters or date range.
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t bg-muted/10 py-4">
        <div className="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-sm text-muted-foreground">
            {totalItems > 0 ? (
              <>
                Showing{" "}
                <span className="font-medium text-foreground">
                  {paginationState.pageIndex * paginationState.pageSize + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium text-foreground">
                  {Math.min(
                    (paginationState.pageIndex + 1) * paginationState.pageSize,
                    totalItems,
                  )}
                </span>{" "}
                of <span className="font-medium text-foreground">{totalItems}</span>{" "}
                entries
              </>
            ) : (
              "No entries"
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Rows</span>
              <Select
                value={`${paginationState.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={paginationState.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="First page"
                >
                  <DoubleArrowLeftIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Previous page"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-sm">Page</span>
                <Input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={paginationState.pageIndex + 1}
                  onChange={handlePageInput}
                  className="h-8 w-14 text-center"
                  aria-label="Page number"
                />
                <span className="text-sm">of {pageCount}</span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Next page"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => table.setPageIndex(pageCount - 1)}
                  disabled={!table.getCanNextPage()}
                  aria-label="Last page"
                >
                  <DoubleArrowRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

