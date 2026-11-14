import React from "react";
import _ from "lodash";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerTransactionItem, SaleItem } from "@/types/globals";
import { currencyFormatter } from "@/config/formatter";

interface ItemListProps {
  items: SaleItem[];
}

const TransactionList: React.FC<ItemListProps> = ({ items }) => {
  return (
    <div className="xs:p-4 md:p-0">
      <Table>
        <TableCaption>A list of your transaction details.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            {/* <TableHead>Category</TableHead> */}
            <TableHead>unit Price</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item?.product_name}</TableCell>
              {/* <TableCell className="text-sm text-gray-500">
                {item?.category}
              </TableCell> */}
              <TableCell className="text-gray-700">
                {currencyFormatter(item?.unit_price)}
              </TableCell>
              <TableCell className="text-gray-700">{item?.quantity}</TableCell>
              <TableCell className="text-gray-700">
                {currencyFormatter(item?.subtotal)}
              </TableCell>
              {/* <TableCell className="font-medium">
                <span
                  className={`ml-1 ${
                    item?.status === "completed"
                      ? "text-green-600"
                      : "text-yellow-500"
                  }`}
                >
                  {item?.status}
                </span>
              </TableCell> */}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell>
              {_.sumBy(items, (item) => Number(item.quantity))}
            </TableCell>
            <TableCell colSpan={4} className="text-left">
              {currencyFormatter(
                _.sumBy(items, (item) => Number(item.subtotal))
              )}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

export default TransactionList;
