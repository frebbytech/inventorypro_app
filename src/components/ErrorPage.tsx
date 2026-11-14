"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import PageContainer from "./layout/page-container";

export default function ErrorPage({ error }: { error: string }) {
  const router = useRouter();

  const handleRefresh = () => {
    router.refresh();
  };

  const goBack = () => {
    router.back();
  };

  return (
    <PageContainer>
      <div className=" container mx-auto  flex flex-col items-center justify-center gap-4 min-h-svh bg-card mt-6 rounded-md">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-6 w-6" />
          <div>Something went wrong</div>
        </div>
        <div>We couldn’t load the information. Please try again.</div>

        <div>
          <div className="bg-muted/50 p-4 rounded-md text-sm font-mono break-all">
            {error || "Unknown error"}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleRefresh} className="w-full sm:w-auto">
            Try again
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={goBack}
          >
            Go back
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
