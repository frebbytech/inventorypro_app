import PageContainer from "@/components/layout/page-container";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import {  searchParamsCache } from "@/lib/searchparams";
import { getAllSalesSummary } from "@/constants/mock-api";
import { SaleSummaryView } from "@/types/globals";
import SummaryTable from "../summary-tables";
import TableSkeleton from "@/components/custom/skeleton/TableSkeleton";
import { Suspense } from "react";
import { SearchParams } from "nuqs/server";

export default async function SummaryListingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // console.log(searchParams?.date);

  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");
  const categories = searchParamsCache.get("categories");
 

  // 1. Manually unpack and parse the raw string parameter safely
  let dateRange = {}; // Default fallback

  if (typeof searchParams?.date === "string") {
    try {
      const parsedJson = JSON.parse(searchParams.date);
      // Run it through the zod schema we updated earlier (with z.coerce.date)
      // const validation = dateRangeSchema.safeParse(parsedJson);

      // if (validation.success) {
      dateRange = parsedJson as {
        from: Date | undefined;
        to: Date | undefined;
      };
      // }
    } catch (e) {
      console.error("Failed parsing URL date string", e);
    }
  }

  // console.log(dateRange);

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(categories && { categories: categories }),
    dateRange: dateRange,
  };

  const details = await getAllSalesSummary();
  const sales = await details.getPaginated(filters);
  const totalSales = sales.total_records || 0;
  const filteredSales: SaleSummaryView[] = sales.records || [];

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <Heading
            title={`Sales Summary (${totalSales})`}
            description="Analyze detailed sales performance, trends, and summaries to gain insights for strategic planning."
          />
        </div>
        <Separator />

        <Suspense fallback={<TableSkeleton />}>
          <SummaryTable
            data={filteredSales}
            recordsCount={totalSales}
            dataExports={sales.data}
      
          />
        </Suspense>
      </div>
    </PageContainer>
  );
}
