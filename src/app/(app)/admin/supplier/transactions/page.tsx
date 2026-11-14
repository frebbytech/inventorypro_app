import React, { Suspense } from "react";
import PageContainer from "@/components/layout/page-container";
import SupplierTransactionListingPage from "@/components/admin/suppliers/SupplierTransactionListingPage";
import PageSkeleton from "@/components/custom/skeleton/PageSkeleton";

export const metadata = {
  title: "Supplier Transactions | Admin Dashboard",
  description: "Record and manage supplier transactions, delivered products, and vendor payments.",
};

export default function SupplierTransactionsPage() {
  return (
    <PageContainer>
      <Suspense fallback={<PageSkeleton />}>
        <SupplierTransactionListingPage />
      </Suspense>
    </PageContainer>
  );
}
