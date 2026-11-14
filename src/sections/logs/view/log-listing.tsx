import { Breadcrumbs } from "@/components/breadcrumbs";
import PageContainer from "@/components/layout/page-container";
import LogTable from "../logs-tables";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { searchParamsCache } from "@/lib/searchparams";
import { getAllLogs } from "@/constants/mock-api";

import { AuditLogView } from "@/types/globals";
import { Suspense } from "react";
import TableSkeleton from "@/components/custom/skeleton/TableSkeleton";
// import type { SearchParams } from "nuqs/server";

export default async function LogListingPage() {
  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");
    const categories = searchParamsCache.get("categories");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(categories && { categories }),
  };
  

  const details = await getAllLogs();
  const logs = await details.getPaginated(filters);
  const totalLogs = logs.total_records;
  const filteredLogs: AuditLogView[] = logs.records || [];

  return (
    <PageContainer>
      <div className="space-y-6">
        <Heading
          title={`Activity Logs (${totalLogs})`}
          description="Detailed insights into user actions, resources accessed, and activity timestamps."
        />
        <Suspense fallback={<TableSkeleton />}>
          <LogTable data={filteredLogs} totalData={totalLogs} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
