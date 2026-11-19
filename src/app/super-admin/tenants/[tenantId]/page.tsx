import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { getSuperAdminSession } from "@/lib/super-admin";
import { getTenantMembersBySuperAdmin } from "@/actions/super-admin";
import TenantMembersConsole from "@/components/super-admin/TenantMembersConsole";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SuperAdminTenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const session = await getSuperAdminSession();
  if (!session) {
    redirect("/super-admin/login");
  }

  const { tenantId } = await params;
  const res = await getTenantMembersBySuperAdmin(tenantId);

  if (!res.success || !res.data) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-16 text-center">
        <Building2 className="h-9 w-9 text-muted-foreground/60" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">
          Tenant Not Found
        </h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {res.message || "The requested business workspace does not exist."}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4 gap-1.5">
          <Link href="/super-admin/tenants">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Tenants</span>
          </Link>
        </Button>
      </div>
    );
  }

  return <TenantMembersConsole initialData={res.data} />;
}
