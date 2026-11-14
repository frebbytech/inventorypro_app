"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ReceiptPrinterModal,
  type ReceiptModalData,
} from "@/components/receipts/ReceiptPrinterModal";

interface ReprintReceiptButtonProps {
  receiptData: ReceiptModalData;
}

export function ReprintReceiptButton({
  receiptData,
}: ReprintReceiptButtonProps) {
  const [printerOpen, setPrinterOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => setPrinterOpen(true)}
        className="gap-2 whitespace-nowrap shrink-0"
      >
        <Printer className="h-4 w-4" />
        <span>Print Receipt</span>
      </Button>

      {/* <ReceiptPrinterModal
        open={printerOpen}
        onOpenChange={setPrinterOpen}
        receiptData={printerOpen ? receiptData : null}
        autoTriggerPrint={true}
      /> */}
    </>
  );
}
