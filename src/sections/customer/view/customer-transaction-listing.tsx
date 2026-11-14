import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { searchParamsCache } from "@/lib/searchparams";
import { getAllMainCustomerSales } from "@/constants/mock-api";
import { CustomerSaleView } from "@/types/globals";
import CustomerSalesTable from "../customer-transaction-tables";
import PageContainer from "@/components/layout/page-container";
// import type { SearchParams } from "nuqs/server";

type CustomerTransactionListingPageProps = {
  id: string;
};

export default async function CustomerTransactionListingPage({
  id,
}: CustomerTransactionListingPageProps) {
  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
  };

  const details = await getAllMainCustomerSales(id);
  const sales = await details.getPaginated(filters);
  const totalCustomerSales = sales.total_records;
  const filteredCustomerSales: CustomerSaleView[] = sales.records || [];

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-start justify-between py-4">
          <Heading
            title={`Customers Transactions (${totalCustomerSales})`}
            description="Manage customers (Server side table functionalities.)"
          />
        </div>
      
        <CustomerSalesTable
          data={filteredCustomerSales}
          totalData={totalCustomerSales}
        />
      </div>
    </PageContainer>
  );
}
