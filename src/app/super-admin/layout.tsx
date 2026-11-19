import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/super-admin";
import SuperAdminShell from "@/components/super-admin/SuperAdminShell";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Note: /super-admin/login has its own page under /super-admin/login/page.tsx
  // and passes through here because it sits inside /super-admin.
  // Check session cleanly; if absent, allow only when rendering /super-admin/login,
  // otherwise redirect to /super-admin/login.
  const session = await getSuperAdminSession();

  if (!session) {
    // Next.js layouts wrap child segments including /super-admin/login.
    // Proxy already protects non-login routes, and if session is null we inspect
    // whether this is a protected page via a fallback wrapper or headers.
    const hdrs = await headers();
    const invokePath =
      hdrs.get("x-invoke-path") ||
      hdrs.get("next-url") ||
      hdrs.get("x-matched-path") ||
      "";
    if (invokePath && !invokePath.includes("/super-admin/login")) {
      redirect("/super-admin/login");
    }
    return <>{children}</>;
  }

  return <SuperAdminShell operator={session}>{children}</SuperAdminShell>;
}
