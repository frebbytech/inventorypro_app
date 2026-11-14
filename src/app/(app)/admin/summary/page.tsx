import { searchParamsCache } from "@/lib/searchparams";
import { SearchParams } from "nuqs/server";
import { SummaryListingPage } from "@/sections/summary/view";
import { getPageMetadata } from "@/lib/metadata";
import { Metadata } from "next";

type pageProps = {
  searchParams: Promise<SearchParams>;
};

export const metadata: Metadata = getPageMetadata("/admin/summary");

export default async function Page({ searchParams }: pageProps) {
  
  const params = await searchParams;
  searchParamsCache.parse(params);
 
  return <SummaryListingPage searchParams={params} />;
}
