"use client";
import _ from "lodash";
import { DataTable } from "@/components/ui/table/data-table";
import { DataTableFilterBox } from "@/components/ui/table/data-table-filter-box";
import { DataTableResetFilter } from "@/components/ui/table/data-table-reset-filter";
import { DataTableSearch } from "@/components/ui/table/data-table-search";
import {
  CATEGORY_OPTIONS,
  useInventoryTableFilters,
} from "./use-inventory-table-filters";
import { columns } from "./columns";
import { Inventory, InventoryInfoView } from "@/types/globals";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currencyFormatter } from "@/config/formatter";

export default function InventoryTable({
  data,
  totalData,
}: {
  data: InventoryInfoView[];
  totalData: number;
}) {
  const router = useRouter();

  const {
    categoriesFilter,
    setCategoriesFilter,
    isAnyFilterActive,
    resetFilters,
    searchQuery,
    setPage,
    setSearchQuery,
  } = useInventoryTableFilters();

  return (
    <div className="space-y-4 ">
      <div className="flex flex-col md:flex-row w-full gap-4 items-center ">
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Restocked Quantity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {_.sumBy(data, (data) => Number(data?.restock_quantity))}
            </div>
            {/* <p className="text-sm text-muted-foreground">
              +20.1% from last month
            </p> */}
          </CardContent>
        </Card>
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <p> GHS</p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {" "}
              {/* {currencyFormatter(
                _.sumBy(data, (data) => Number(data?.total))
              )} */}
            </div>
            {/* <p className="text-sm text-muted-foreground">
              +20.1% from last month
            </p> */}
          </CardContent>
        </Card>
      </div>
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
            title="Categories"
            options={CATEGORY_OPTIONS}
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
      <DataTable columns={columns} data={data} totalItems={totalData} />
    </div>
  );
}
