import PageContainer from "@/components/layout/page-container";
import ProductTable from "../product-tables";
import { Heading } from "@/components/ui/heading";
import { searchParamsCache } from "@/lib/searchparams";
import { getAllProducts } from "@/constants/mock-api";
import { AddProduct } from "@/components/admin/products/AddProduct";
import { ProductCatalogView } from "@/types/globals";
import { getCategories } from "@/actions/product-category";
import TableSkeleton from "@/components/custom/skeleton/TableSkeleton";
import { Suspense } from "react";
import { BulkImportDialog } from "@/components/admin/import/BulkImportDialog";
// import type { SearchParams } from "nuqs/server";

export default async function ProductListingPage() {
  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");
  const categories = searchParamsCache.get("categories");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(categories && { categories: categories }),
  };

  const productCategories = await getCategories();
  const details = await getAllProducts();
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
    <PageContainer>
      <div className="space-y-6">
        <Heading
          title={`Products (${totalProducts})`}
          description="Easily manage all product listings, descriptions, categories, and relevant details for seamless inventory."
          button={
            <div className="flex items-center justify-end gap-3">
              <BulkImportDialog
                initialType="products"
                availableCategories={productCategories?.data || []}
              />
              <AddProduct categories={productCategories?.data || []} />
            </div>
          }
        />


        <Suspense fallback={<TableSkeleton />}>
          <ProductTable
            data={filteredProducts}
            totalData={totalProducts || 0}
            categoryList={categoriesLabels || []}
          />
        </Suspense>
      </div>
    </PageContainer>
  );
}
