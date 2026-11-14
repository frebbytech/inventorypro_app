import PageContainer from "@/components/layout/page-container";

import { CartProvider } from "@/components/providers/cart-provider";
import CartSummary from "@/components/sales/CartSummary";
import { searchParamsCache } from "@/lib/searchparams";
import { SearchParams } from "nuqs/server";
import { getPageMetadata } from "@/lib/metadata";
import { Metadata } from "next";
import { Suspense } from "react";
import ResponsivePanelWrapper from "@/components/sales/ResponsivePanelWrapper";
import SalesSkeleton from "@/components/custom/skeleton/SalesSkeleton";
import { getCategories } from "@/actions/product-category";
import { getAllProducts } from "@/constants/mock-api";
import { ProductCatalogView } from "@/types/globals";
// import { MobilePOSView } from "@/components/sales/MobilePOSView";
import ProductTable from "@/sections/sales/product-tables";

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export const metadata: Metadata = getPageMetadata("/sales");

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  searchParamsCache.parse(resolvedSearchParams);

  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");
  const categories = searchParamsCache.get("categories");
  const stock = searchParamsCache.get("stock");
  // const view = searchParamsCache.get("view");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(categories && { categories: categories }),
    ...(stock && stock !== "all" && { filters: { stock } }),
  };

  const [productCategories, details] = await Promise.all([
    getCategories(),
    getAllProducts(),
  ]);

  const products = await details.getPaginated(filters);
  const totalProducts = products.total_records;
  const filteredProducts: ProductCatalogView[] = products.records || [];

  const categoriesLabels = productCategories.data?.map((category) => {
    return {
      label: category.name,
      value: category.name,
    };
  });

  return (
    <CartProvider>
      <div>
        {/* Suspense handles the background streaming behavior cleanly */}
        <Suspense fallback={<SalesSkeleton />}>
          <>
            {/* <div className="hidden md:block"> */}
            <div>
              <ResponsivePanelWrapper
                productListing={
                  <ProductTable
                    data={filteredProducts}
                    totalData={totalProducts}
                    categoryList={categoriesLabels || []}
                  />
                }
                cartSummary={<CartSummary />}
              />
            </div>
            {/* <MobilePOSView
              data={filteredProducts}
              totalData={totalProducts}
              categoryList={categoriesLabels || []}
            /> */}
          </>
        </Suspense>
      </div>
    </CartProvider>
  );
}
