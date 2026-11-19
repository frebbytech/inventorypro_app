import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Inventory Pro | Admin Dashboard",
  description: "Admin dashboard layout for the Inventory Pro application.",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session?.id) {
    redirect("/auth/sign-in?session=expired");
  }
  if (session.role !== "admin") {
    redirect("/");
  }
  return <>{children}</>;
}
