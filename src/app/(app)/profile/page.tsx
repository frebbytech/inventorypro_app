import { getCurrentUser } from "@/actions/_actions";
import PageContainer from "@/components/layout/page-container";
import { Heading } from "@/components/ui/heading";
import ViewProfile from "@/components/profile/ViewProfile";
import { getPageMetadata } from "@/lib/metadata";
import { Metadata } from "next";

export const metadata: Metadata = getPageMetadata("/profile");

export default async function page() {
  const user = await getCurrentUser();

  return (
    <PageContainer>
      <div className="space-y-6">
        <Heading
          title="Profile"
          description="Manage your personal information and account settings"
        />
      </div>

      <ViewProfile user={user} />
    </PageContainer>
  );
}

