import SupplierFormDialog from "@/components/admin/suppliers/SupplierFormDialog";
import { InsertSupplier } from "@/types/globals";
type EditSupplierProps = {
  supplier: InsertSupplier;
};

const EditSupplier = ({ supplier }: EditSupplierProps) => {
  return <SupplierFormDialog supplier={supplier} />;
};

export default EditSupplier;
