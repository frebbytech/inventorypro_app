
import PageContainer from "@/components/layout/page-container";
import CustomerTable from "../customer-tables";
import { Heading } from "@/components/ui/heading";
import { searchParamsCache } from "@/lib/searchparams";
import { getAllCustomers } from "@/constants/mock-api";
import { AddCustomer } from "@/components/admin/customers/AddCustomer";
import { CustomerInfoView } from "@/types/globals";
import TableSkeleton from "@/components/custom/skeleton/TableSkeleton";
import { Suspense } from "react";

export default async function CustomerListingPage() {
  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
  };

  const details = await getAllCustomers();
  const customers = await details.getPaginated(filters);
  const totalCustomers = customers.total_records;
  const filteredCustomers: CustomerInfoView[] = customers.records || [];

  // console.log(data)

  return (
    <PageContainer>
      <div className="space-y-6">
        <Heading
          title={`Customers (${totalCustomers})`}
          description="Access and manage detailed customer information to improve service and maintain customer relationships."
          button={<AddCustomer />}
        />

        {/* <Separator /> */}
        <Suspense fallback={<TableSkeleton />}>
          <CustomerTable data={filteredCustomers} totalData={totalCustomers} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
