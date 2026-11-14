import { Category } from "@/types/globals";
import ProductFormDialog from "./ProductFormDialog";

type AddProductProps = {
  categories: Category[];
};

export function AddProduct({ categories }: AddProductProps) {
  return <ProductFormDialog categories={categories || []} />;
}
