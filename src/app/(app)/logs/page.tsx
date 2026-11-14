import { getPageMetadata } from "@/lib/metadata";
import { searchParamsCache } from "@/lib/searchparams";
import LogListingPage from "@/sections/logs/view/log-listing";
import { Metadata } from "next";
import { SearchParams } from "nuqs/server";

type pageProps = {
  searchParams: Promise<SearchParams>;
};

export const metadata: Metadata = getPageMetadata("/logs");

export default async function Page({ searchParams }: pageProps) {
  const params = await searchParams;
  searchParamsCache.parse(params);

  return <LogListingPage />;
}
