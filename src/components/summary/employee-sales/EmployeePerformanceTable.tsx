"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { EmployeePerformanceRow } from "@/actions/employee-summary";
import { currencyFormatter } from "@/config/formatter";
import {
  ArrowUpDown,
  Eye,
  Search,
  Users,
  Award,
} from "lucide-react";

interface EmployeePerformanceTableProps {
  data: EmployeePerformanceRow[];
  onSelectEmployeeForDrilldown: (employeeId: string) => void;
  isLoading?: boolean;
}

type SortField =
  | "employeeName"
  | "totalSales"
  | "totalTransactions"
  | "avgTransactionValue"
  | "itemsSold"
  | "successRate"
  | "salesContributionPct"
  | "lastTransactionDate";

export default function EmployeePerformanceTable({
  data,
  onSelectEmployeeForDrilldown,
  isLoading = false,
}: EmployeePerformanceTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalSales");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let result = [...data];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.employeeName ?? "").toLowerCase().includes(q) ||
          (r.username ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.role ?? "").toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === "lastTransactionDate") {
        valA = a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : 0;
        valB = b.lastTransactionDate ? new Date(b.lastTransactionDate).getTime() : 0;
      }

      if (typeof valA === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
    });

    return result;
  }, [data, search, sortField, sortAsc]);

  return (
    <Card className="shadow-xs">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span>Employee Performance Summary</span>
          </CardTitle>
          <CardDescription className="text-sm">
            Comprehensive sales output, success rates, and contributions across team members
          </CardDescription>
        </div>

        <div className="relative w-full sm:w-60">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50 text-sm">
              <TableRow>
                <TableHead className="w-[180px]">
                  <button
                    type="button"
                    onClick={() => handleSort("employeeName")}
                    className="flex items-center gap-1 font-semibold hover:text-foreground"
                  >
                    Employee
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("totalSales")}
                    className="flex items-center gap-1 font-semibold hover:text-foreground ml-auto"
                  >
                    Net Sales
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("totalTransactions")}
                    className="flex items-center gap-1 font-semibold hover:text-foreground ml-auto"
                  >
                    Transactions
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("avgTransactionValue")}
                    className="flex items-center gap-1 font-semibold hover:text-foreground ml-auto"
                  >
                    Avg Ticket
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("itemsSold")}
                    className="flex items-center gap-1 font-semibold hover:text-foreground ml-auto"
                  >
                    Units Sold
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button
                    type="button"
                    onClick={() => handleSort("successRate")}
                    className="flex items-center gap-1 font-semibold hover:text-foreground ml-auto"
                  >
                    Success Rate
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="w-[160px]">
                  <button
                    type="button"
                    onClick={() => handleSort("salesContributionPct")}
                    className="flex items-center gap-1 font-semibold hover:text-foreground"
                  >
                    Sales Share
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => handleSort("lastTransactionDate")}
                    className="flex items-center gap-1 font-semibold hover:text-foreground"
                  >
                    Last Sale
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9} className="py-4 text-center">
                      <div className="h-4 bg-muted animate-pulse rounded w-3/4 mx-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredAndSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No employees matching the current criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSorted.map((emp, index) => (
                  <TableRow
                    key={emp.employeeId}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {index === 0 && emp.totalSales > 0 && (
                          <span title="Top Performer">
                            <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          </span>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">{emp.employeeName}</span>
                            <Badge
                              variant={emp.role === "admin" ? "default" : "secondary"}
                              className="text-[9px] px-1 py-0 h-3.5"
                            >
                              {emp.role}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">@{emp.username}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {currencyFormatter(emp.totalSales)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span>{emp.completedTransactions}</span>
                      <span className="text-[11px] text-muted-foreground ml-1">
                        / {emp.totalTransactions}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {currencyFormatter(emp.avgTransactionValue)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {emp.itemsSold.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-semibold ${
                          emp.successRate >= 95
                            ? "text-emerald-600 dark:text-emerald-400"
                            : emp.successRate >= 80
                            ? "text-amber-600"
                            : "text-rose-600"
                        }`}
                      >
                        {emp.successRate}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-medium">{emp.salesContributionPct}%</span>
                        </div>
                        <Progress value={emp.salesContributionPct} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {emp.lastTransactionDate
                        ? format(new Date(emp.lastTransactionDate), "MMM dd, yyyy")
                        : "No sales"}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectEmployeeForDrilldown(emp.employeeId)}
                        className="h-7 text-sm gap-1 text-primary hover:text-primary hover:bg-primary/10"
                        title={`View ${emp.employeeName}'s full breakdown`}
                      >
                        <Eye className="h-3 w-3" />
                        <span>Drilldown</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
