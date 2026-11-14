import { searchParamsCache } from "@/lib/searchparams";
import ProductTable from "../product-tables";
import { getAllProducts } from "@/constants/mock-api";
import {  ProductCatalogView } from "@/types/globals";
import { getCategories } from "@/actions/product-category";


export default async function ProductListingPage() {
  // Showcasing the use of search params cache in nested RSCs
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("q");
  const pageLimit = searchParamsCache.get("limit");
  const categories = searchParamsCache.get("categories");
  const stock = searchParamsCache.get("stock");




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
    <>
      <ProductTable
        data={filteredProducts}
        totalData={totalProducts}
        categoryList={categoriesLabels || []}
      />
     
    </>
  );
}
