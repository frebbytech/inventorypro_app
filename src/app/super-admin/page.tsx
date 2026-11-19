import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/super-admin";
import { getSuperAdminOverviewAndTenants } from "@/actions/super-admin";
import TenantsConsole from "@/components/super-admin/TenantsConsole";

export const dynamic = "force-dynamic";

export default async function SuperAdminOverviewPage() {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect("/super-admin/login");
  }

  const res = await getSuperAdminOverviewAndTenants();
  const initialMetrics = res.data?.metrics ?? {
    totalTenants: 0,
    activeTenants: 0,
    suspendedTenants: 0,
    totalMembers: 0,
    totalProducts: 0,
    totalSalesRevenue: 0,
  };
  const initialTenants = res.data?.tenants ?? [];
  const initialGrowthSeries = res.data?.growthSeries ?? [];

  return (
    <TenantsConsole
      initialMetrics={initialMetrics}
      initialTenants={initialTenants}
      initialGrowthSeries={initialGrowthSeries}
      showGrowthChart
      heading="Platform Overview & Tenants"
      subheading="Monitor active businesses across InventoryPro, provision new tenant workspaces, and manage staff teams."
    />
  );
}
