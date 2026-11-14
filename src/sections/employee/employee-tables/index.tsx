"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/table/data-table";
import { DataTableFilterBox } from "@/components/ui/table/data-table-filter-box";
import { DataTableResetFilter } from "@/components/ui/table/data-table-reset-filter";
import { DataTableSearch } from "@/components/ui/table/data-table-search";
import { columns } from "./columns";
import {
  ROLE_OPTIONS,
  useEmployeeTableFilters,
} from "./use-employee-table-filters";
import { User } from "@/types/globals";

export default function EmployeeTable({
  data,
  totalData,
}: {
  data: User[];
  totalData: number;
}) {
  const {
    roleFilter,
    setRoleFilter,
    isAnyFilterActive,
    resetFilters,
    searchQuery,
    setPage,
    setSearchQuery,
  } = useEmployeeTableFilters();

  const router = useRouter();

  return (
    <div className="space-y-4 ">
      <DataTable
        tableName="users"
        columns={columns}
        data={data}
        totalItems={totalData}
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
                filterKey="role"
                title="Role"
                options={ROLE_OPTIONS}
                setFilterValue={setRoleFilter}
                filterValue={roleFilter}
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
      />
    </div>
  );
}
