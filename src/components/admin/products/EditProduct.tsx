import { InsertProduct, Product } from "@/types/globals";
import ProductFormDialog from "./ProductFormDialog";
import { getCategories } from "@/actions/product-category";

type EditProductProps = {
  product: InsertProduct;
};

async function EditProduct({ product }: EditProductProps) {
  const { data: categories } = await getCategories();

  return <ProductFormDialog categories={categories || []} product={product} />;
}

export default EditProduct;
