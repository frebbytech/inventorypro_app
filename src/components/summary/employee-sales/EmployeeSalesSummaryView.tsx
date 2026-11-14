"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DatePreset,
  EmployeeInfo,
  getEmployeeSalesSummaryData,
  getEmployeesList,
  getEmployeeSummaryExportData,
} from "@/actions/employee-summary";
import { exportToCsv, exportToExcel } from "@/config/data-export";
import EmployeeFilterToolbar from "./EmployeeFilterToolbar";
import EmployeeSummaryKpis from "./EmployeeSummaryKpis";
import EmployeeSalesCharts from "./EmployeeSalesCharts";
import EmployeePerformanceTable from "./EmployeePerformanceTable";
import EmployeeTransactionsTable from "./EmployeeTransactionsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  FileText,
  Users,
  AlertTriangle,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface EmployeeSalesSummaryViewProps {
  initialEmployees?: EmployeeInfo[];
}

export default function EmployeeSalesSummaryView({
  initialEmployees = [],
}: EmployeeSalesSummaryViewProps) {
  // ── Filter State ──
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"all" | "employee">("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("this_month");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [status, setStatus] = useState<string>("all");
  const [paymentMode, setPaymentMode] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("overview");

  // ── Pagination & Sorting State ──
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortBy, setSortBy] = useState<string>("sale_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // ── 1. Fetch Employees List ──
  const { data: employeesListRes } = useQuery({
    queryKey: ["all-employees-list"],
    queryFn: async () => {
      const res = await getEmployeesList();
      return res.success && res.data ? res.data : initialEmployees;
    },
    initialData: initialEmployees,
    staleTime: 5 * 60 * 1000,
  });

  const employees = employeesListRes || [];

  // ── 2. Fetch Employee Sales Summary ──
  const queryParams = {
    employeeId: selectedEmployeeId,
    datePreset,
    startDate: startDate?.toISOString(),
    endDate: endDate?.toISOString(),
    status,
    paymentMode,
    searchQuery,
    page,
    pageSize,
    sortBy,
    sortOrder,
  };

  const {
    data: summaryResult,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["employee-sales-summary", queryParams],
    queryFn: async () => {
      const res = await getEmployeeSalesSummaryData(queryParams);
      if (!res.success || !res.data) {
        throw new Error(res.message || "Failed to load summary data");
      }
      return res.data;
    },
    staleTime: 60 * 1000,
  });

  const summary = summaryResult;
  const isSingleEmployeeView = selectedEmployeeId !== "all" || viewMode === "employee";
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  // console.log(summary)

  // ── Filter Handlers ──
  const handleSelectEmployee = (id: string) => {
    setSelectedEmployeeId(id);
    if (id !== "all") {
      setViewMode("employee");
    } else {
      setViewMode("all");
    }
    setPage(1);
  };

  const handleChangeViewMode = (mode: "all" | "employee") => {
    setViewMode(mode);
    if (mode === "all") {
      setSelectedEmployeeId("all");
    } else if (selectedEmployeeId === "all" && employees.length > 0) {
      setSelectedEmployeeId(employees[0].id);
    }
    setPage(1);
  };

  const handleChangeDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== "custom") {
      setStartDate(undefined);
      setEndDate(undefined);
    }
    setPage(1);
  };

  const handleChangeCustomDateRange = (start?: Date, end?: Date) => {
    setStartDate(start);
    setEndDate(end);
    if (start && end) {
      setDatePreset("custom");
    }
    setPage(1);
  };

  const handleResetFilters = () => {
    setSelectedEmployeeId("all");
    setViewMode("all");
    setDatePreset("this_month");
    setStartDate(undefined);
    setEndDate(undefined);
    setStatus("all");
    setPaymentMode("all");
    setSearchQuery("");
    setPage(1);
    toast.info("Filters reset to default");
  };

  const isFilterActive =
    selectedEmployeeId !== "all" ||
    datePreset !== "this_month" ||
    startDate !== undefined ||
    endDate !== undefined ||
    status !== "all" ||
    paymentMode !== "all" ||
    searchQuery !== "";

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  // ── Export Handlers ──
  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const res = await getEmployeeSummaryExportData(queryParams);
      if (!res.success || !res.data) {
        throw new Error(res.message || "Failed to fetch export records");
      }
      const exportRows = res.data.transactions.map((tx: any) => ({
        "Receipt #": tx.receiptNo,
        Date: tx.saleDate,
        Employee: tx.employeeName,
        Username: tx.employeeUsername,
        Customer: tx.customerName,
        Phone: tx.customerPhone || "N/A",
        Items: tx.itemsSummary,
        Units: tx.itemCount,
        "Total Amount (GHS)": tx.totalAmount,
        "Paid (GHS)": tx.amountPaid,
        Discount: tx.discount,
        Tax: tx.tax,
        Payment: tx.paymentMode,
        Status: tx.status,
      }));

      exportToCsv({
        data: exportRows,
        fileName: `employee_sales_summary_${datePreset}_${Date.now()}`,
      });
      toast.success("CSV export downloaded successfully");
    } catch (err: any) {
      toast.error(err?.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const res = await getEmployeeSummaryExportData(queryParams);
      if (!res.success || !res.data) {
        throw new Error(res.message || "Failed to fetch export records");
      }
      const exportRows = res.data.transactions.map((tx: any) => ({
        "Receipt #": tx.receiptNo,
        Date: tx.saleDate,
        Employee: tx.employeeName,
        Username: tx.employeeUsername,
        Customer: tx.customerName,
        Phone: tx.customerPhone || "N/A",
        Items: tx.itemsSummary,
        Units: tx.itemCount,
        "Total Amount (GHS)": tx.totalAmount,
        "Paid (GHS)": tx.amountPaid,
        Discount: tx.discount,
        Tax: tx.tax,
        Payment: tx.paymentMode,
        Status: tx.status,
      }));

      exportToExcel({
        data: exportRows,
        fileName: `employee_sales_summary_${datePreset}_${Date.now()}`,
      });
      toast.success("Excel export downloaded successfully");
    } catch (err: any) {
      toast.error(err?.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Universal Interactive Filter Toolbar */}
      <EmployeeFilterToolbar
        employees={employees}
        selectedEmployeeId={selectedEmployeeId}
        onSelectEmployee={handleSelectEmployee}
        viewMode={viewMode}
        onChangeViewMode={handleChangeViewMode}
        datePreset={datePreset}
        onChangeDatePreset={handleChangeDatePreset}
        startDate={startDate}
        endDate={endDate}
        onChangeCustomDateRange={handleChangeCustomDateRange}
        status={status}
        onChangeStatus={(s) => {
          setStatus(s);
          setPage(1);
        }}
        paymentMode={paymentMode}
        onChangePaymentMode={(pm) => {
          setPaymentMode(pm);
          setPage(1);
        }}
        searchQuery={searchQuery}
        onChangeSearchQuery={(q) => {
          setSearchQuery(q);
          setPage(1);
        }}
        onResetFilters={handleResetFilters}
        isFilterActive={isFilterActive}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        isExporting={isExporting}
      />

      {/* 2. Error State */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center justify-between gap-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{(error as Error)?.message || "Failed to load sales summary"}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-7 text-sm gap-1">
            <RefreshCcw className="h-3 w-3" /> Retry
          </Button>
        </div>
      )}

      {/* 3. KPI Metrics Dashboard Cards */}
      {summary && (
        <EmployeeSummaryKpis
          metrics={summary.metrics}
          selectedEmployeeName={selectedEmployee?.name}
          isSingleEmployeeView={isSingleEmployeeView}
          isLoading={isPending}
        />
      )}

      {/* 4. Tab Navigation for Deep Dive Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="overview" className="gap-1.5 text-sm">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Sales & Visual Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-1.5 text-sm">
              <Users className="h-3.5 w-3.5" />
              <span>Team Performance Table</span>
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5 text-sm">
              <FileText className="h-3.5 w-3.5" />
              <span>Transaction Ledger ({summary?.transactions?.totalRecords || 0})</span>
            </TabsTrigger>
          </TabsList>

          {selectedEmployee && isSingleEmployeeView && (
            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
              <span>Drilldown active:</span>
              <strong className="text-foreground">{selectedEmployee.name}</strong>
              <button
                type="button"
                onClick={() => handleSelectEmployee("all")}
                className="text-primary underline ml-1 hover:text-primary/80"
              >
                Clear drilldown
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: Overview & Interactive Charts */}
        <TabsContent value="overview" className="space-y-6 m-0">
          {summary && (
            <EmployeeSalesCharts
              timeSeries={summary.timeSeries}
              salesByEmployee={summary.employeeComparison.salesByEmployee}
              paymentModeBreakdown={summary.employeeComparison.paymentModeBreakdown}
              isSingleEmployeeView={isSingleEmployeeView}
              selectedEmployeeName={selectedEmployee?.name}
            />
          )}

          {/* Quick preview of recent transactions */}
          {summary && (
            <EmployeeTransactionsTable
              transactions={summary.transactions.records}
              totalRecords={summary.transactions.totalRecords}
              currentPage={summary.transactions.page}
              pageSize={summary.transactions.pageSize}
              totalPages={summary.transactions.totalPages}
              onPageChange={setPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
              }}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              isLoading={isPending}
            />
          )}
        </TabsContent>

        {/* Tab 2: Employee Performance Comparative Table */}
        <TabsContent value="performance" className="space-y-4 m-0">
          {summary && (
            <EmployeePerformanceTable
              data={summary.employeePerformance}
              onSelectEmployeeForDrilldown={(empId) => {
                handleSelectEmployee(empId);
                setActiveTab("overview");
              }}
              isLoading={isPending}
            />
          )}
        </TabsContent>

        {/* Tab 3: Detailed Itemized Transaction History Table */}
        <TabsContent value="transactions" className="space-y-4 m-0">
          {summary && (
            <EmployeeTransactionsTable
              transactions={summary.transactions.records}
              totalRecords={summary.transactions.totalRecords}
              currentPage={summary.transactions.page}
              pageSize={summary.transactions.pageSize}
              totalPages={summary.transactions.totalPages}
              onPageChange={setPage}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setPage(1);
              }}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              isLoading={isPending}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
