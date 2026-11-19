import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/super-admin";
import SuperAdminLoginForm from "@/components/super-admin/SuperAdminLoginForm";

export const dynamic = "force-dynamic";

export default async function SuperAdminLoginPage() {
  const session = await getSuperAdminSession();
  if (session) {
    redirect("/super-admin");
  }

  return <SuperAdminLoginForm />;
}
