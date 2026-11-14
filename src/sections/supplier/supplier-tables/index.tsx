"use client";
import { DataTable } from "@/components/ui/table/data-table";
import { DataTableSearch } from "@/components/ui/table/data-table-search";
import { useSupplierTableFilters } from "./use-supplier-table-filters";
import { columns } from "./columns";
import { SupplierInfoView } from "@/types/globals";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function SupplierTable({
  data,
  totalData,
}: {
  data: SupplierInfoView[];
  totalData: number;
}) {
  const router = useRouter();

  const { searchQuery, setPage, setSearchQuery } = useSupplierTableFilters();

  return (
    <div className="space-y-4 ">
      <DataTable
        tableName="suppliers"
        columns={columns}
        data={data}
        totalItems={totalData}
        // dataExports={dataExports}
        tableFilter={
          <div className="w-full flex flex-wrap items-center justify-between gap-4 ">
            <div className="flex items-center  gap-4 ">
              <DataTableSearch
                searchKey="name"
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                setPage={setPage}
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
