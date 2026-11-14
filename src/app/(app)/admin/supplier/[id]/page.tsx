import { getSupplier } from "@/actions/suppliers";
import ViewSupplier from "@/components/admin/suppliers/ViewSupplier";
import { redirect } from "next/navigation";
import React, { Suspense } from "react";
import { SearchParams } from "nuqs/server";
import { searchParamsCache } from "@/lib/searchparams";
import PageSkeleton from "@/components/custom/skeleton/PageSkeleton";

type PageProps = {
  params: Promise<{ id?: string }>;
  searchParams: Promise<SearchParams>;
};

export default async function Page({ params, searchParams }: PageProps) {
  // 1. Await both promises in parallel
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  // 2. Pass the resolved search params to the nuqs cache
  searchParamsCache.parse(resolvedSearchParams);

  // 3. Use the resolved path params safely
  if (!resolvedParams?.id) {
    redirect("/admin/supplier");
  }
  const { data: supplier } = await getSupplier(resolvedParams?.id as string);

  if (!supplier) {
    redirect("/admin");
  }

  return (
    <Suspense fallback={<PageSkeleton />}>
      <ViewSupplier supplier={supplier || []} />;
    </Suspense>
  );
}
