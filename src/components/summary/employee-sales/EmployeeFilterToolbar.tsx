"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronsUpDown,
  Download,
  Filter,
  RefreshCw,
  Search,
  User,
  Users,
  X,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { DatePreset, EmployeeInfo } from "@/actions/employee-summary";
import { cn } from "@/lib/utils";

interface EmployeeFilterToolbarProps {
  employees: EmployeeInfo[];
  selectedEmployeeId: string;
  onSelectEmployee: (id: string) => void;
  viewMode: "all" | "employee";
  onChangeViewMode: (mode: "all" | "employee") => void;
  datePreset: DatePreset;
  onChangeDatePreset: (preset: DatePreset) => void;
  startDate?: Date;
  endDate?: Date;
  onChangeCustomDateRange: (start?: Date, end?: Date) => void;
  status: string;
  onChangeStatus: (status: string) => void;
  paymentMode: string;
  onChangePaymentMode: (mode: string) => void;
  searchQuery: string;
  onChangeSearchQuery: (query: string) => void;
  onResetFilters: () => void;
  isFilterActive: boolean;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onExportCsv: () => void;
  onExportExcel: () => void;
  isExporting?: boolean;
}

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "Last Week", value: "last_week" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "This Year", value: "this_year" },
  { label: "Custom Range", value: "custom" },
];

export default function EmployeeFilterToolbar({
  employees,
  selectedEmployeeId,
  onSelectEmployee,
  viewMode,
  onChangeViewMode,
  datePreset,
  onChangeDatePreset,
  startDate,
  endDate,
  onChangeCustomDateRange,
  status,
  onChangeStatus,
  paymentMode,
  onChangePaymentMode,
  searchQuery,
  onChangeSearchQuery,
  onResetFilters,
  isFilterActive,
  onRefresh,
  isRefreshing = false,
  onExportCsv,
  onExportExcel,
  isExporting = false,
}: EmployeeFilterToolbarProps) {
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);
  const [dateRangePickerOpen, setDateRangePickerOpen] = useState(false);
  const [singleDatePickerOpen, setSingleDatePickerOpen] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const handleSelectPreset = (preset: DatePreset) => {
    onChangeDatePreset(preset);
  };

  const handleSingleDateSelect = (day?: Date) => {
    if (day) {
      onChangeCustomDateRange(day, day);
      onChangeDatePreset("custom");
      setSingleDatePickerOpen(false);
    }
  };

  return (
    <div className="space-y-3 bg-card border rounded-xl p-4 shadow-sm">
      {/* Top Row: View Mode Switcher + Employee Selection + Search + Export */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Left Section: View Mode and Employee Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle Pill */}
          <div className="inline-flex items-center rounded-lg bg-muted p-1 text-muted-foreground border">
            <button
              type="button"
              onClick={() => {
                onChangeViewMode("all");
                onSelectEmployee("all");
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                viewMode === "all" && selectedEmployeeId === "all"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "hover:text-foreground"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              All Transactions
            </button>
            <button
              type="button"
              onClick={() => {
                onChangeViewMode("employee");
                if (selectedEmployeeId === "all" && employees.length > 0) {
                  onSelectEmployee(employees[0].id);
                }
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                viewMode === "employee" || selectedEmployeeId !== "all"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "hover:text-foreground"
              )}
            >
              <User className="h-3.5 w-3.5" />
              By Employee
            </button>
          </div>

          {/* Searchable Employee Combobox Popover */}
          <Popover open={employeeComboboxOpen} onOpenChange={setEmployeeComboboxOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={employeeComboboxOpen}
                className="h-9 min-w-[220px] justify-between text-sm font-normal border-dashed"
              >
                <div className="flex items-center gap-2 truncate">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate font-medium">
                    {selectedEmployeeId === "all"
                      ? "All Employees (Organization)"
                      : selectedEmployee?.name || "Select employee..."}
                  </span>
                </div>
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search employee by name, username..." className="h-9 text-sm" />
                <CommandList>
                  <CommandEmpty className="p-3 text-sm text-muted-foreground text-center">
                    No employee found.
                  </CommandEmpty>
                  <CommandGroup heading="Organization">
                    <CommandItem
                      value="all_employees_organization"
                      onSelect={() => {
                        onSelectEmployee("all");
                        onChangeViewMode("all");
                        setEmployeeComboboxOpen(false);
                      }}
                      className="text-sm cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="font-semibold">All Employees</span>
                      </div>
                      {selectedEmployeeId === "all" && <Check className="h-3.5 w-3.5 text-primary" />}
                    </CommandItem>
                  </CommandGroup>
                  <CommandGroup heading="Staff Members">
                    {employees.map((emp) => (
                      <CommandItem
                        key={emp.id}
                        value={`${emp.name} ${emp.username} ${emp.email}`}
                        onSelect={() => {
                          onSelectEmployee(emp.id);
                          onChangeViewMode("employee");
                          setEmployeeComboboxOpen(false);
                        }}
                        className="text-sm cursor-pointer flex items-center justify-between py-2"
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{emp.name}</span>
                            <Badge
                              variant={emp.role === "admin" ? "default" : "secondary"}
                              className="text-[10px] py-0 px-1.5 h-4"
                            >
                              {emp.role}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground">@{emp.username}</span>
                        </div>
                        {selectedEmployeeId === emp.id && (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search receipt, customer, item..."
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Actions (Export & Refresh) */}
        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm" disabled={isExporting}>
                <Download className="h-3.5 w-3.5" />
                {isExporting ? "Exporting..." : "Export Report"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 text-sm">
              <DropdownMenuLabel>Export Filtered Data</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExportExcel} className="gap-2 cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Export to Excel (.xlsx)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportCsv} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4 text-blue-600" />
                <span>Export to CSV (.csv)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9 gap-1.5 text-sm"
            title="Refresh sales data"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {isFilterActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="h-9 gap-1 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Bottom Row: Date Presets & Secondary Filters (Status, Payment Mode, Custom Date) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t">
        {/* Preset Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-muted-foreground mr-1 flex items-center gap-1">
            <CalendarIcon className="h-3 w-3" /> Period:
          </span>
          {PRESETS.map((p) => {
            const isActive = datePreset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => handleSelectPreset(p.value)}
                className={cn(
                  "px-2.5 py-1 text-sm rounded-md transition-colors font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Filters: Custom Date Range / Single Date + Status + Payment Mode */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Custom Date Range Picker */}
          {datePreset === "custom" && (
            <Popover open={dateRangePickerOpen} onOpenChange={setDateRangePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-sm font-normal gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {startDate ? (
                    endDate ? (
                      <>
                        {format(startDate, "LLL dd, y")} - {format(endDate, "LLL dd, y")}
                      </>
                    ) : (
                      format(startDate, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick dates</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={startDate || new Date()}
                  selected={{
                    from: startDate,
                    to: endDate,
                  }}
                  onSelect={(range) => {
                    onChangeCustomDateRange(range?.from, range?.to);
                    if (range?.from && range?.to) {
                      setDateRangePickerOpen(false);
                    }
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Status Filter */}
          <Select value={status} onValueChange={onChangeStatus}>
            <SelectTrigger className="h-8 w-[130px] text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="text-sm">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          {/* Payment Mode Filter */}
          <Select value={paymentMode} onValueChange={onChangePaymentMode}>
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue placeholder="Payment Mode" />
            </SelectTrigger>
            <SelectContent className="text-sm">
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="momo">Mobile Money (MoMo)</SelectItem>
              <SelectItem value="card">Card / POS</SelectItem>
              <SelectItem value="bank">Bank Transfer</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
