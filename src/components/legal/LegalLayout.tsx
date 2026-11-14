// import { motion } from "framer-motion";
import Link from "next/link";
import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { checkRole } from "@/utils/roles";

interface LegalLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
  lastUpdated?: string;
}

export default async function LegalLayout({
  title,
  description,
  children,
  lastUpdated,
}: LegalLayoutProps) {
  const isAdmin = await checkRole("admin");

  return (
    <div className="container max-w-4xl mx-auto py-12 px-4 md:px-6">
      <div className="mb-6">
        <Link
          href={isAdmin ? "/admin" : "/"}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden="true">←</span>
          Back
        </Link>
      </div>

      <Card className="shadow-none border-0">
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl md:text-4xl font-bold tracking-tight">
            {title}
          </CardTitle>
          {description && (
            <p className="text-muted-foreground text-sm md:text-base">
              {description}
            </p>
          )}
          {lastUpdated && (
            <p className="text-sm text-muted-foreground/70 pt-2">
              Last updated: {lastUpdated}
            </p>
          )}
        </CardHeader>
        <Separator />
        <CardContent className="pt-6 prose prose-sm md:prose-base dark:prose-invert max-w-none">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
