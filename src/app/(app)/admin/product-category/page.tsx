import { getCategories } from "@/actions/product-category";
import ProductsCategoriesSkeleton from "@/components/custom/skeleton/ProductCategorySkeleton";
import PageContainer from "@/components/layout/page-container";
import CategoryList from "@/components/product-category/CategoryList";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { getPageMetadata } from "@/lib/metadata";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = getPageMetadata("/admin/product-category");

export default async function CategoriesPage() {
  const result = await getCategories();

  // If error, you might want to show an error state.
  // For simplicity, we pass the result to the client component.

  return (
    <PageContainer>
      <div className="space-y-6">
        <Heading
          title={`Products Categories`}
          description="Easily manage all product listings, descriptions, categories, and relevant details for seamless inventory."
        />
        {/* <Separator /> */}
        <CategoryList initialResult={result} />
      </div>
    </PageContainer>
  );
}
