
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory Pro | Admin Dashboard",
  description: "Admin dashboard layout for the Inventory Pro application.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
