"use client";

import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ProductHover } from "@/components/admin/products/ProductHover";
import { AuditLogView } from "@/types/globals";

function formatDate(value: unknown, pattern = "PPP p") {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}


interface LogsTableProps {
  logs: AuditLogView[];
}

export function LogsTable({ logs }: LogsTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const query = search.toLowerCase();
    return logs.filter((log) => {
      const action = (log.action || "").toLowerCase();
      const user = (log.user_name || "").toLowerCase();
      const ip = (log.ip_address || "").toLowerCase();
      return action.includes(query) || user.includes(query) || ip.includes(query);
    });
  }, [logs, search]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  return (
    <div className="space-y-4">
      {/* Search and Rows-per-page Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter by action, user, or IP..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(val) => {
              setPageSize(Number(val));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5 sm:pl-6">Action</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Before</TableHead>
              <TableHead>After</TableHead>
              <TableHead>IP address</TableHead>
              <TableHead className="pr-5 sm:pr-6">By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No results found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="pl-5 sm:pl-6">
                    <Badge variant="outline" className="capitalize">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(log.created_at) ?? "Unknown"}
                  </TableCell>
                  <TableCell className="max-w-40 truncate">
                    <ProductHover values={log.old_values} />
                  </TableCell>
                  <TableCell className="max-w-40 truncate">
                    <ProductHover values={log.new_values} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.ip_address || "—"}
                  </TableCell>
                  <TableCell className="max-w-32 truncate pr-5 sm:pr-6">
                    {log.user_name || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {filteredLogs.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
          <div>
            Showing {Math.min((currentPage - 1) * pageSize + 1, filteredLogs.length)} to{" "}
            {Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} entries
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-xs font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}