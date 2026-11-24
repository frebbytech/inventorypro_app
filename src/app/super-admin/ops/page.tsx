import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/super-admin";
import { getProductionOpsSnapshot } from "@/lib/ops";
import ProductionOpsConsole from "@/components/super-admin/ProductionOpsConsole";

export const dynamic = "force-dynamic";

export default async function SuperAdminOpsPage() {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect("/super-admin/login");
  }

  const initialSnapshot = await getProductionOpsSnapshot();

  return <ProductionOpsConsole initialSnapshot={initialSnapshot} />;
}
