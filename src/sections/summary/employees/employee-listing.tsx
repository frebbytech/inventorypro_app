import { redirect } from "next/navigation";
import PageContainer from "@/components/layout/page-container";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { getEmployeesList } from "@/actions/employee-summary";
import EmployeeSalesSummaryView from "@/components/summary/employee-sales/EmployeeSalesSummaryView";
import { getAuthSession } from "@/lib/auth";
import { SearchParams } from "nuqs/server";

export default async function EmployeeListingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAuthSession();
  if (!session?.id) {
    redirect("/auth/sign-in?session=expired");
  }

  const employeesRes = await getEmployeesList();
  const initialEmployees = employeesRes.success && employeesRes.data ? employeesRes.data : [];

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <Heading
            title="Employee Sales Summary"
            description="Interactive performance analytics, individual staff drilldown, transaction ledgers, and revenue reports."
          />
        </div>
        <Separator />

        <EmployeeSalesSummaryView initialEmployees={initialEmployees} />
      </div>
    </PageContainer>
  );
}
