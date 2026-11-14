import { getDailySalesReports } from "@/actions/daily-reports";
import DailyReportsView from "@/components/admin/reports/DailyReportsView";

export const metadata = {
  title: "Daily Sales Reports | Admin Dashboard",
  description: "View and send daily sales reports at the end of business hours via SMS, Email, or In-App.",
};

export default async function DailyReportsPage() {
  const reportsRes = await getDailySalesReports(30);
  const reports = reportsRes.success && reportsRes.data ? reportsRes.data : [];

  return <DailyReportsView initialReports={reports} />;
}
