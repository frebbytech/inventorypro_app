"use client";
import { useRef, Dispatch, SetStateAction } from "react";

import dynamic from "next/dynamic";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrinterIcon } from "lucide-react";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { PaymentInfo } from "@/types/globals";
import { currencyFormatter } from "@/config/formatter";
import { format } from "date-fns";
import { generateReceiptPDF } from "@/lib/receipt";
import { useSettings } from "@/providers/SettingsProvider";

type ReceiptProps = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  info: PaymentInfo;
};

const AdvancedNextPrinter = dynamic(() => import("@/components/Printer"), {
  ssr: false,
});

function Receipt({ open, setOpen, info }: ReceiptProps) {
  const { settings } = useSettings();

  const componentRef = useRef<HTMLDivElement>(null);


  const handlePrintReceipt = () => {
    const saleData = {
      sale_id: info.receipt_number,
      customer_name: info?.customer.name,
      sale_date: info?.date || new Date(),
      total_amount: info?.totalAmount || 0,
      payment_mode: info?.paymentMode || "cash",
      status: "completed",
      // optional store overrides
      storeName: settings?.business_name || "InventoryPro",
      storeAddress: settings?.business_address || "Plot 15 Block D,Kronum",
      storeEmail: settings?.business_email || "frebbytechsolutions@gmail.com",
      storePhone:
        settings?.business_phone || "+233 543 77 2591 | +233 560 37 2844",
      logoBase64:
        settings?.logo ||
        "data:image/png;base64,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",
      qrCodeBase64: info?.qrcode,
      attendantName: (info as any)?.user_name || "Cashier",
      accentColor: settings?.accent_color || "#2f6f4f",
    };

    const items = info?.products.map((item) => ({
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: Number(item.cost_price) * Number(item.quantity),
    }));

    generateReceiptPDF(saleData, items);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-screen-md">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
          <DialogDescription>Customer receipt print details</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[calc(80vh-180px)]   md:h-[calc(80dvh-160px)] p-2">
          <div
            ref={componentRef}
            className="p-8 max-w-2xl mx-auto border border-gray-200"
          >
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold">
                {settings?.business_name || "InventoryPro"}
              </h1>
              <p className="text-sm">
                {settings?.business_address || "Plot 15 Block D,Kronum"}
                <br />
                {settings?.business_email || "frebbytechsolutions@gmail.com"}
                <br />
                {settings?.business_phone ||
                  "+233 543 77 2591 | +233 560 37 2844"}
              </p>
            </div>

            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="font-bold text-lg">BILL TO</h2>
                <p>
                  <span className="block">{info?.customer?.name}</span>
                  <span className="block">{info?.customer?.phonenumber}</span>
                </p>
              </div>

              <div className="text-right">
                <p>
                  <span className="font-bold">Receipt No:</span>{" "}
                  {info?.receipt_number}
                </p>
                <p>
                  <span className="font-bold">Payment Date:</span>{" "}
                  {info?.date
                    ? format(new Date(info?.date), "PPpp")
                    : format(new Date(), "PPpp")}
                </p>
              </div>
            </div>

            <table className="w-full text-left mb-8">
              <thead className="bg-gray-100 dark:bg-transparent">
                <tr>
                  <th className="p-2 border">DESCRIPTION</th>
                  <th className="p-2 border">QTY</th>
                  <th className="p-2 border">UNIT PRICE</th>
                  <th className="p-2 border">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {/* Repeat this <tr> block for each item */}
                {info?.products.map((product) => {
                  return (
                    <tr key={product?.id}>
                      <td className="p-2 border">{product?.name}</td>
                      <td className="p-2 border">{product?.quantity}</td>
                      <td className="p-2 border">
                        {currencyFormatter(product?.unit_price)}
                      </td>
                      <td className="p-2 border">
                        {currencyFormatter(
                          product?.unit_price * product?.quantity,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="text-left">Payment Mode: {info?.paymentMode}</p>
            <div className="text-right mb-8">
              <p>Subtotal: {currencyFormatter(info?.totalAmount)}</p>
              {/* <p>Discount: $0.00</p>
              <p>Tax Rate: 0.00%</p>
              <p>Total Tax: $0.00</p> */}
              <p className="font-bold">
                Amount Paid: {currencyFormatter(info?.amountPaid)}
              </p>
              <p className="font-bold">
                Balance: {currencyFormatter(info?.balance)}
              </p>
            </div>

            <p className="text-sm text-center">Thank you for your business!</p>
          </div>
        </ScrollArea>
        <DialogFooter>
          {/* <AdvancedNextPrinter info={info} /> */}
          <Button onClick={handlePrintReceipt}>
            <PrinterIcon className="mr-2 h-4 w-4" /> Print Receipt
          </Button>

          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Receipt;
