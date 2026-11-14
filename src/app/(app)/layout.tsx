import React from "react";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { checkRole } from "@/utils/roles";
import Footer from "@/components/layout/footer";
import AppBreadcrumb from "@/components/custom/Breadcrumbs";
import { navItems, userNavItems } from "@/constants/data";
// import { DailyReportScheduler } from "@/components/admin/DailyReportScheduler";
// import { SessionTimeoutWarning } from "@/components/auth/SessionTimeoutWarning";
async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isAdmin = await checkRole("admin");
  return (
    <div className="flex h-screen overflow-hidden">
        {/* <DailyReportScheduler /> */}
      {isAdmin ? (
        <Sidebar navItems={navItems} />
      ) : (
        <Sidebar navItems={userNavItems} />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="bg-background flex-1 h-svh overflow-y-auto overflow-x-hidden">
          <div className="flex justify-end pt-8 pr-8 gap-5">
            <AppBreadcrumb />
          </div>
          {children}
          <Footer />
        </div>
      </main>
  {/* <SessionTimeoutWarning /> */}
      <Toaster />
    </div>
  );
}

export default AppLayout;
