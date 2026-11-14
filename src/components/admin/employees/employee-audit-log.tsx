"use client";

import { Activity, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTableSearch } from "@/hooks/use-table-search";
import EmployeeLogsTable from "./EmployeeLogsTable";
import { AuditLogView } from "@/types/globals";

// The exact fields aren't known here (rendering is left to EmployeeLogsTable),
// so searching is done defensively over whichever of these happen to exist.

interface EmployeeAuditLogProps {
  logs: AuditLogView[];
  pageSize?: number;
}

const countFormat = new Intl.NumberFormat("en-GH");

/** Stringifies a value for the search index; never throws on odd or circular data. */
function toSearchable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function matchesQuery(log: AuditLogView, query: string) {
  const dateText = (() => {
    const date = new Date(log.created_at);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString("en-GH", { dateStyle: "long" });
  })();

  const haystack = [
    log.action,
    dateText,
    log.ip_address,
    toSearchable(log.old_values),
    toSearchable(log.new_values),
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export default function EmployeeAuditLog({
  logs,
  pageSize = 10,
}: EmployeeAuditLogProps) {
  const {
    search,
    setSearch,
    page,
    setPage,
    pageCount,
    pageItems,
    filteredTotal,
    rangeStart,
    rangeEnd,
    isFiltered,
  } = useTableSearch({ items: logs, matches: matchesQuery, pageSize });

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Audit log</h2>
          <p className="text-sm text-muted-foreground">
            All actions performed by this employee.
          </p>
        </div>

        {logs.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search audit log"
              placeholder="Search action, date, IP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </header>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Activity aria-hidden className="size-8 opacity-40" />
          <p className="text-sm">No audit log entries for this employee.</p>
        </div>
      ) : filteredTotal === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No entries match "{search.trim()}".
          </p>
          <Button variant="outline" size="sm" onClick={() => setSearch("")}>
            Clear search
          </Button>
        </div>
      ) : (
        <>
          <div className="p-5 pt-0 sm:p-6 sm:pt-0">
            <EmployeeLogsTable logs={pageItems} />
          </div>

          {(pageCount > 1 || isFiltered) && (
            <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-3 sm:flex-row sm:px-6">
              <p className="text-sm text-muted-foreground tabular-nums">
                {rangeStart}–{rangeEnd} of {countFormat.format(filteredTotal)}
                {isFiltered &&
                  ` (filtered from ${countFormat.format(logs.length)})`}
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <p
                    aria-live="polite"
                    className="min-w-20 text-center text-sm text-muted-foreground tabular-nums"
                  >
                    Page {page} of {pageCount}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
