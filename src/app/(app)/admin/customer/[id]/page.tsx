import ViewCustomer from "@/components/admin/customers/ViewCustomer";
import { redirect } from "next/navigation";
import React from "react";
import { SearchParams } from "nuqs/server";
import { searchParamsCache } from "@/lib/searchparams";

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
    redirect("/admin/customer");
  }

  return <ViewCustomer params={resolvedParams} />;
}
