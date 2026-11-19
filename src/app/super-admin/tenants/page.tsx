import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/super-admin";
import { getSuperAdminOverviewAndTenants } from "@/actions/super-admin";
import TenantsConsole from "@/components/super-admin/TenantsConsole";

export const dynamic = "force-dynamic";

export default async function SuperAdminTenantsPage() {
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

  return (
    <TenantsConsole
      initialMetrics={initialMetrics}
      initialTenants={initialTenants}
      heading="Tenants Directory"
      subheading="Provision business tenants, suspend or reactivate workspaces, and drill into each business's member roster."
    />
  );
}
