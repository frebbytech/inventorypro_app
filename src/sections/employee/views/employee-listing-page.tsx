import PageContainer from "@/components/layout/page-container";
import EmployeeTable from "../employee-tables";
import { buttonVariants } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { searchParamsCache } from "@/lib/searchparams";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { getAllUsers } from "@/constants/mock-api";
import { User } from "@/types/globals";
import { Suspense } from "react";
import TableSkeleton from "@/components/custom/skeleton/TableSkeleton";

export default async function EmployeeListingPage() {
  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const role = searchParamsCache.get("role");
  const pageLimit = searchParamsCache.get("limit");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(role && { roles: role }),
  };

  // mock api call

  const details = await getAllUsers();
  const users = await details.getPaginated(filters);
  const totalUsers = users.total_records;
  const filteredUsers: User[] = users.records || [];

  return (
    <PageContainer>
      <div className="space-y-6">
        <Heading
          title={`Employee (${totalUsers})`}
          description="Organize, update, and manage employee profiles, roles, and permissions to maintain efficient workforce management."
        button={   <Link
            href={"/admin/employee/new"}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            <Plus className="mr-2 h-4 w-4" /> New Employee
          </Link>}
        />


        <Suspense fallback={<TableSkeleton />}>
          <EmployeeTable data={filteredUsers} totalData={totalUsers} />
        </Suspense>
      </div>
    </PageContainer>
  );
}
