import { getCurrentUser } from "@/actions/_actions";
import { getComprehensiveAdminDashboardData } from "@/actions/dashboard";
import { getSalesSummaryByUser } from "@/actions/summary";
// import DashboardSkeleton from "@/components/custom/skeleton/DashboardSkeleton";
import MemberDashboardSkeleton from "@/components/custom/skeleton/MemberDashboardSkeleton";
import { getPageMetadata } from "@/lib/metadata";
import { OverViewPageView, UserOverViewPage } from "@/sections/overview/view";
import { checkRole } from "@/utils/roles";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

// Component broken out to leverage the Suspense boundary effectively
async function DashboardContent({
  userId,
  username,
  firstname,
}: {
  userId: string;
  username?: string;
  firstname?: string;
}) {
  const data = await getSalesSummaryByUser(userId);

  console.log("DashboardContent data:", data);
  return <UserOverViewPage data={data} name={firstname || username || ""} />;
}

async function AdminDashboardContent() {
  const result = await getComprehensiveAdminDashboardData();

  return (
    <OverViewPageView
      fullData={result.success ? result.data : null}
      errors={{
        dashboard: result.success ? null : result.message,
      }}
    />
  );
}

export const metadata: Metadata = getPageMetadata("/");

export default async function Page() {
  // 1. Check role first to avoid fetching user data if migrating to admin

  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/auth/sign-in");
  }

  const isAdmin = await checkRole("admin");

  // 2. Render Suspense immediately so the skeleton shows while user/sales data loads
  return (
    <Suspense fallback={<MemberDashboardSkeleton />}>
      {isAdmin ? (
        <AdminDashboardContent />
      ) : (
        <DashboardContent
          userId={user.id}
          username={user.username}
          firstname={user.firstname}
        />
      )}
    </Suspense>
  );
}
