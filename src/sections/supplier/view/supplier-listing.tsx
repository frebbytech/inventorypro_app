import PageContainer from "@/components/layout/page-container";
import SupplierTable from "../supplier-tables";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { searchParamsCache } from "@/lib/searchparams";
import { getAllSuppliers } from "@/constants/mock-api";
import { SupplierInfoView } from "@/types/globals";
import AddSupplier from "@/components/admin/suppliers/AddSupplier";
import { Suspense } from "react";
import TableSkeleton from "@/components/custom/skeleton/TableSkeleton";

export default async function SupplierListingPage() {
  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
  };

  const details = await getAllSuppliers();
  const suppliers = await details.getPaginated(filters);
  const totalSuppliers = suppliers.total_records;
  const filteredSuppliers: SupplierInfoView[] = suppliers.records || [];

  // console.log(filteredSuppliers)

  return (
    <PageContainer>
      <div className="space-y-6">
        <Heading
          title={`Suppliers (${totalSuppliers})`}
          description="Organize, track, and nurture supplier relationships to ensure a reliable supply chain and smooth procurement."
       button={ <AddSupplier />}
       />
       
        <Suspense fallback={<TableSkeleton />}>
          <SupplierTable data={filteredSuppliers} totalData={totalSuppliers} />
        </Suspense>
        {/* <SupplierTable data={filteredSuppliers} totalData={totalSuppliers} /> */}
      </div>
    </PageContainer>
  );
}
