"use client";
import React, { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InventoryInfoView } from "@/types/globals";
import ViewItem from "@/components/custom/ViewItem";
import { currencyFormatter } from "@/config/formatter";
import { format } from "date-fns";

type ViewInventoryProps = {
  inventory: InventoryInfoView;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
};

function ViewInventory({ open, setOpen, inventory }: ViewInventoryProps) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-screen-md">
        <DialogHeader>
          <DialogTitle> Inventory Details</DialogTitle>
          <DialogDescription>Product restock information</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ViewItem title="ID" value={inventory.inventory_id?.toString()} />
          <ViewItem title="PRODUCT" value={inventory.product_name} />
          <ViewItem title="CATEGORY" value={inventory.category_name} />
          <ViewItem
            title="UNIT PRICE"
            value={currencyFormatter(inventory.unit_price)}
          />
          <ViewItem
            title="QUANTITY"
            value={inventory.current_stock?.toString()}
          />
          {/* <ViewItem title="TOTAL" value={currencyFormatter(inventory.total)} /> */}
          <ViewItem title="SUPPLIER" value={inventory.supplier_name} />
          <ViewItem
            title="RESTOCKED ON"
            value={format(new Date(inventory.restock_date), "PPpp")}
          />
        </div>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export default ViewInventory;
