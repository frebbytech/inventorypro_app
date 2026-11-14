"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Check, RotateCcw, X } from "lucide-react";
import {
  ReceiptPrinter,
  type ReceiptPrinterStage,
} from "@/components/receipts/ReceiptPrinter";
import {
  currencyFormatter,
  currencyFormatterWithoutSign,
} from "@/config/formatter";
import { useSettings } from "@/providers/SettingsProvider";
import { CartItem } from "@/types/globals";
import { printReceiptInBrowser } from "@/lib/printReceiptBrowser";
import { getPaperConfig } from "@/lib/paperConfig";
import { PaperSizeValue } from "@/types/receipt";

export interface ReceiptModalItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface ReceiptModalData {
  sale_id: string;
  customer_name?: string;
  customer_phone?: string;
  sale_date: Date | string;
  total_amount: number;
  amount_paid?: number;
  balance?: number;
  payment_mode?: string;
  status?: string;
  attendantName?: string | null;
  qrCodeBase64?: string;
  items: CartItem[];
}

interface ReceiptPrinterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When null while `open` is true, the printer stays in the "processing"
   * stage (e.g., while waiting for the server action to create the sale).
   * Once provided, it advances to "printing" -> "complete".
   */
  // receiptData: ReceiptModalData | null;
  receiptData: string | null;
  /** Optional preview total shown on screen while still processing */
  processingTotal?: number;
  /** Optional preview invoice number while still processing */
  processingInvoiceId?: string;
  /** Whether to automatically invoke the browser PDF print dialog on complete */
  autoTriggerPrint?: boolean;
}

const DEFAULT_LOGO =
  "data:image/png;base64,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";

export function ReceiptPrinterModal({
  open,
  onOpenChange,
  receiptData,
  processingTotal,
  processingInvoiceId,
  autoTriggerPrint = true,
}: ReceiptPrinterModalProps) {
  const { settings } = useSettings();
  const [stage, setStage] = useState<ReceiptPrinterStage>("processing");
  const hasTriggeredPrintRef = useRef(false);
  const openedAtRef = useRef<number>(0);

  const displayInvoice = processingInvoiceId || "PREPARING...";
  const displayTotal = processingTotal ?? 0;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      openedAtRef.current = Date.now();
      hasTriggeredPrintRef.current = false;
      setStage("processing");
    } else {
      setStage("processing");
      hasTriggeredPrintRef.current = false;
    }
  }, [open]);

  // Transition from "processing" -> "printing" -> "complete" once receiptData is available
  useEffect(() => {
    if (!open || !receiptData) {
      return;
    }

    // Ensure "processing" stage shows for at least 400ms so user sees the screen initialize
    const elapsed = Date.now() - openedAtRef.current;
    const delayToPrinting = Math.max(400 - elapsed, 80);

    const printingTimer = setTimeout(() => {
      setStage("printing");
    }, delayToPrinting);

    // The stepped paper feed animation takes 1.75s (1750ms)
    const completeTimer = setTimeout(() => {
      setStage("complete");
      if (autoTriggerPrint && !hasTriggeredPrintRef.current) {
        hasTriggeredPrintRef.current = true;
        // triggerPDFPrint(receiptData);
      }
    }, delayToPrinting + 1800);

    return () => {
      clearTimeout(printingTimer);
      clearTimeout(completeTimer);
    };
  }, [open, receiptData, autoTriggerPrint]);

  const handleReplayAndPrint = async () => {
    if (!receiptData) return;
    setStage("printing");
    setTimeout(() => {
      setStage("complete");
    }, 1800);

    const paperSize = settings?.paper_size as PaperSizeValue;
    const config = getPaperConfig(paperSize);

    if (typeof window !== "undefined" && window.api?.printer) {
      await window.api.printer.printReceipt(
        receiptData,
        settings?.printer_device_name || "",
        {
          width: config.micronsWidth,
          height: config.micronsHeight,
        },
      );
    } else {
      await printReceiptInBrowser(receiptData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-zinc-800/80 bg-zinc-950/95 p-5 text-zinc-100 shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Thermal Receipt Printer</DialogTitle>
          <DialogDescription>
            Live thermal receipt printing progress and preview
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center pt-1">
          <ReceiptPrinter.Root
            stage={stage}
            feedMotion="stepped"
            className="w-full max-w-sm"
          >
            <ReceiptPrinter.Machine>
              <ReceiptPrinter.Header>
                <div className="flex items-center gap-2">
                  <Printer className="h-4 w-4 text-zinc-400" />
                  <span className="text-xs font-semibold tracking-wider text-zinc-300">
                    RECEIPT PRINTER
                  </span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                  {displayInvoice}
                </span>
              </ReceiptPrinter.Header>

              <ReceiptPrinter.Screen>
                <div className="flex flex-col gap-2.5">
                  <ReceiptPrinter.Status />
                  <div className="flex items-baseline justify-between border-t border-zinc-800/80 pt-2">
                    <span className="text-[11px] text-zinc-400">
                      Amount Due
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-emerald-400">
                      {currencyFormatter(displayTotal)}
                    </span>
                  </div>
                </div>
              </ReceiptPrinter.Screen>
            </ReceiptPrinter.Machine>

            <ReceiptPrinter.Output>
              <ReceiptPrinter.Paper>
                <div dangerouslySetInnerHTML={{ __html: receiptData || "" }} />
              </ReceiptPrinter.Paper>
            </ReceiptPrinter.Output>
          </ReceiptPrinter.Root>

          {/* Footer Action Controls */}
          <div className="mt-3 flex w-full items-center justify-between gap-2 border-t border-zinc-800 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!receiptData || stage === "processing"}
              onClick={handleReplayAndPrint}
              className="border-zinc-700 bg-zinc-900 text-xs text-zinc-200 hover:bg-zinc-800 hover:text-white whitespace-nowrap shrink-0"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Print Again
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="bg-primary/60 text-xs font-medium text-white hover:bg-primary/50 whitespace-nowrap shrink-0"
            >
              {stage === "complete" ? (
                <>
                  {/* <Check className="mr-1.5 h-3.5 w-3.5" /> */}
                  Done
                </>
              ) : (
                <>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Close
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
