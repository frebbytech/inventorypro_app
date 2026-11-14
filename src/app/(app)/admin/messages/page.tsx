import { checkRole } from "@/utils/roles";
import { redirect } from "next/navigation";
import PageContainer from "@/components/layout/page-container";
import { Heading } from "@/components/ui/heading";
import { getSettings } from "@/actions/settings";
import { getBroadcastHistory, getRecipientsForGroup } from "@/actions/messages";
import MessagesClient from "@/components/admin/messages/MessagesClient";

export default async function AdminMessagesPage() {
  const isAdmin = await checkRole("admin");
  if (!isAdmin) {
    redirect("/dashboard");
  }

  // Fetch settings & data concurrently
  const [settingsRes, historyRes, suppliersRes, customersRes, employeesRes] =
    await Promise.all([
      getSettings(),
      getBroadcastHistory(),
      getRecipientsForGroup("suppliers"),
      getRecipientsForGroup("customers"),
      getRecipientsForGroup("employees"),
    ]);

  const settings = settingsRes.success ? settingsRes.data : null;
  const history = historyRes.success && historyRes.data ? historyRes.data : [];
  const suppliers =
    suppliersRes.success && suppliersRes.data ? suppliersRes.data : [];
  const customers =
    customersRes.success && customersRes.data ? customersRes.data : [];
  const employees =
    employeesRes.success && employeesRes.data ? employeesRes.data : [];

  return (
    <PageContainer>
      <div className="space-y-6 pb-8">
        <div>
          <Heading
            title="Messages & Broadcasts"
            description="Send targeted Email, SMS, or internal In-App messages to suppliers, customers, or employees based on notification preferences."
          />
        </div>

        <MessagesClient
          settings={settings}
          initialHistory={history}
          initialSuppliers={suppliers}
          initialCustomers={customers}
          initialEmployees={employees}
        />
      </div>
    </PageContainer>
  );
}
