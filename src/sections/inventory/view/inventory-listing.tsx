
import PageContainer from "@/components/layout/page-container";
import InventoryTable from "../inventory-tables";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { searchParamsCache } from "@/lib/searchparams";
import { getAllInventories } from "@/constants/mock-api";
import {  InventoryInfoView } from "@/types/globals";

type InventoryListingPage = {
  inventorys: InventoryInfoView[];
};

export default async function InventoryListingPage() {
  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");
  const categories = searchParamsCache.get("categories");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(categories && { categories: categories }),
  };

  const details = await getAllInventories();
  const inventories = await details.getPaginated(filters);
  const totalInventories = inventories.total_records;
  const filteredInventories: InventoryInfoView[] = inventories.records || [];

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <Heading
            title={`Inventory (${totalInventories})`}
            description="Track, monitor, and update inventory levels to ensure accurate stock availability and reduce shortages."
          />
        </div>
        <InventoryTable
          data={filteredInventories}
          totalData={totalInventories}
        />
      </div>
    </PageContainer>
  );
}
