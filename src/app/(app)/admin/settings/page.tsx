import { redirect } from "next/navigation";
import { getSettings } from "@/actions/settings";
import { getCurrentUser } from "@/actions/_actions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Bell,
  Palette,
  Languages,
  ArrowLeft,
  Printer,
} from "lucide-react";
import Link from "next/link";
import PageContainer from "@/components/layout/page-container";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import BusinessHoursSettings from "@/components/settings/BusinessHoursSettings";
import BusinessSettings from "@/components/settings/BusinessSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import LanguageCurrencySettings from "@/components/settings/LanguageCurrencySettings";
import { getPageMetadata } from "@/lib/metadata";
import { Metadata } from "next";
import PrintingSettings from "@/components/settings/PrintingSettings";
import { getApiSettings } from "@/actions/api-settings";
import ApiSettings from "@/components/settings/ApiSettings";
import { getStaffTwoFactorAccounts } from "@/actions/security";
import SecuritySettings from "@/components/settings/SecuritySettings";

export const metadata: Metadata = getPageMetadata("/admin/settings");

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const isAdmin = user.role === "admin";

  const [settingsResult, apiSettingsResult, staffSecurityResult] =
    await Promise.all([
      getSettings(),
      getApiSettings(),
      isAdmin ? getStaffTwoFactorAccounts() : Promise.resolve(null),
    ]);
  const settings = settingsResult.success ? settingsResult.data : null;
  const apiSettings = apiSettingsResult.success ? apiSettingsResult.data : null;

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}

        <Heading
          title="Settings"
          description="Manage your application preferences and business information"
        />

        {/* Tabs */}
        <Tabs defaultValue="business" className="space-y-6 ">
          <TabsList className="md:w-fit overflow-y-hidden overflow-x-auto no-scrollbar">
            <TabsTrigger value="business">
              {/* <Building2 className="h-4 w-4" /> */}
              Business
            </TabsTrigger>
            <TabsTrigger value="hours">Hours</TabsTrigger>
            <TabsTrigger value="notifications">
              {/* <Bell className="h-4 w-4" /> */}
              Notifications
            </TabsTrigger>
            <TabsTrigger value="appearance">
              {/* <Palette className="h-4 w-4" /> */}
              Appearance
            </TabsTrigger>
            {/* <TabsTrigger value="language" >
              <Languages className="h-4 w-4" />
              Language
            </TabsTrigger> */}
            <TabsTrigger value="printing">
              {/* <Printer className="h-4 w-4" /> */}
              Printing
            </TabsTrigger>
            <TabsTrigger value="api">API Integration</TabsTrigger>
            {isAdmin && <TabsTrigger value="security">Security</TabsTrigger>}
          </TabsList>

          <TabsContent value="business">
            <BusinessSettings settings={settings} />
          </TabsContent>
          <TabsContent value="hours">
            <BusinessHoursSettings settings={settings} />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationSettings settings={settings} />
          </TabsContent>
          <TabsContent value="appearance">
            <AppearanceSettings settings={settings} />
          </TabsContent>
          <TabsContent value="printing">
            <PrintingSettings settings={settings} />
          </TabsContent>
          <TabsContent value="api">
            <ApiSettings
              apiSettings={apiSettings}
              settings={{
                business_name: settings?.business_name || "",
                business_email: settings?.business_email || "",
              }}
            />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="security">
              <SecuritySettings
                initialAccounts={
                  staffSecurityResult?.success ? staffSecurityResult.data : []
                }
                emailConfigured={Boolean(
                  apiSettings?.smtp_user && apiSettings?.has_smtp_password,
                )}
                smsConfigured={Boolean(apiSettings?.has_arkessel_api_key)}
                loadError={
                  staffSecurityResult && !staffSecurityResult.success
                    ? staffSecurityResult.message
                    : null
                }
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </PageContainer>
  );
}
