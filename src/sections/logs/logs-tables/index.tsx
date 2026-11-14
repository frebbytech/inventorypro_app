"use client";
import { DataTable } from "@/components/ui/table/data-table";
import { DataTableSearch } from "@/components/ui/table/data-table-search";
import { useLogTableFilters } from "./use-log-table-filters";

import { columns } from "./columns";
import { AuditLogView } from "@/types/globals";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LOG_CATEGORIES } from "@/constants/mock-api";
import { DataTableFilterBox } from "@/components/ui/table/data-table-filter-box";
import { DataTableResetFilter } from "@/components/ui/table/data-table-reset-filter";

export default function LogTable({
  data,
  totalData,
}: {
  data: AuditLogView[];
  totalData: number;
}) {
  const router = useRouter();

  const {
    searchQuery,
    setPage,
    setSearchQuery,
    categoriesFilter,
    setCategoriesFilter,
    isAnyFilterActive,
    resetFilters,
  } = useLogTableFilters();

  return (
    <div className="space-y-4 ">
      <DataTable
        tableFilter={
          <div className="w-full flex flex-wrap items-center justify-between gap-4 ">
            <div className="flex items-center  gap-4 ">
              <DataTableSearch
                searchKey="name"
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                setPage={setPage}
              />
              <DataTableFilterBox
                filterKey="categories"
                title="Entry Type"
                options={LOG_CATEGORIES}
                setFilterValue={setCategoriesFilter}
                filterValue={categoriesFilter}
              />
              <DataTableResetFilter
                isFilterActive={isAnyFilterActive}
                onReset={resetFilters}
              />
            </div>
            <div className="self-end">
              <Button
                variant="outline"
                className=""
                onClick={() => router.refresh()}
              >
                Refresh
              </Button>
            </div>
          </div>
        }
        tableName="logs"
        columns={columns}
        data={data}
        totalItems={totalData}
      />
    </div>
  );
}
