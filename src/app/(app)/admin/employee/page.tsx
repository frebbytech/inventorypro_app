import { getPageMetadata } from "@/lib/metadata";
import { searchParamsCache } from "@/lib/searchparams";
import { EmployeeListingPage } from "@/sections/employee/views";
import { Metadata } from "next";
import { SearchParams } from "nuqs/server";
import React from "react";

type pageProps = {
  searchParams: Promise<SearchParams>;
};
export const metadata: Metadata = getPageMetadata("/admin/employee");

export default async function Page({ searchParams }: pageProps) {
  const params = await searchParams;
  searchParamsCache.parse(params);

  return <EmployeeListingPage />;
}
