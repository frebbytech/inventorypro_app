
import { searchParamsCache } from "@/lib/searchparams";
import { SearchParams } from "nuqs/server";
import { ProductListingPage } from "@/sections/product/view";
import { getPageMetadata } from "@/lib/metadata";
import { Metadata } from "next";
type pageProps = {
  searchParams: Promise<SearchParams>;
};


export const metadata: Metadata = getPageMetadata("/admin/product");

export default async function Page({ searchParams }: pageProps) {
  const params = await searchParams;
  searchParamsCache.parse(params);

  return <ProductListingPage />;
}
