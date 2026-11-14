"use client";

import { useCallback, useRef, useState } from "react";
import { Barcode, Loader2, Scan } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { cn } from "@/lib/utils";
import { playStockAlertSound } from "@/utils/audioAlert";
import { BarcodeScannerModal } from "./barcode-scanner-modal";

interface BarcodeQuickScannerProps {
  onBarcodeScanned: (barcode: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function BarcodeQuickScanner({
  onBarcodeScanned,
  placeholder = "Scan a barcode or type one",
  className,
  autoFocus = false,
}: BarcodeQuickScannerProps) {
  const [inputValue, setInputValue] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Every scan route (typed, USB/Bluetooth, camera modal) ends up here, so
  // this is the one place that plays a sound and reports errors — the modal
  // itself stays silent, rather than every path playing its own sound and
  // stacking two on top of each other for a single scan.
  const processBarcode = useCallback(
    async (barcode: string) => {
      const trimmed = barcode.trim();
      if (!trimmed || isLoading) return;

      setIsLoading(true);
      try {
        playStockAlertSound();
        await onBarcodeScanned(trimmed);
      } catch (error) {
        toast.error("Couldn't process that barcode", {
          description: error instanceof Error ? error.message : "Lookup failed.",
        });
      } finally {
        setIsLoading(false);
        setInputValue("");
      }
    },
    [isLoading, onBarcodeScanned]
  );

  // Stable regardless of `processBarcode`'s own identity churn, so anything
  // depending on *this* reference (the modal, the hardware-scanner hook)
  // never sees it change and re-subscribe unnecessarily.
  const processBarcodeRef = useRef(processBarcode);
  processBarcodeRef.current = processBarcode;
  const handleScan = useCallback((code: string) => processBarcodeRef.current(code), []);

  // Listens for a USB/Bluetooth hardware scanner acting as a keyboard, independent of focus.
  useBarcodeScanner({ onScan: handleScan, enabled: true });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void processBarcode(inputValue);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <form onSubmit={handleSubmit} className="relative flex-1">
        <Label htmlFor="barcode-quick-input" className="sr-only">
          Barcode
        </Label>
        <Barcode
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="barcode-quick-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={isLoading}
          className="pr-16 pl-9 font-mono"
        />
        <div className="absolute top-1/2 right-1.5 -translate-y-1/2">
          {isLoading ? (
            <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : (
            inputValue.trim() && (
              <Button type="submit" size="sm" variant="ghost" className="h-7 px-2">
                Go
              </Button>
            )
          )}
        </div>
      </form>

      <Button type="button" variant="outline" onClick={() => setModalOpen(true)} className="gap-1.5">
        <Scan aria-hidden className="size-4" />
        <span className="hidden sm:inline">Scan with camera</span>
      </Button>

      <BarcodeScannerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onScan={handleScan}
        isProcessing={isLoading}
      />
    </div>
  );
}

// "use client";

// import { useState, useRef } from "react";
// import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button";
// import { BarcodeScannerModal } from "./barcode-scanner-modal";
// import {
//   useBarcodeScanner,
//   playScanBeepSound,
// } from "@/hooks/use-barcode-scanner";
// import { Scan, Barcode, Loader2, Sparkles } from "lucide-react";
// import { toast } from "sonner";
// import { playStockAlertSound } from "@/utils/audioAlert";

// interface BarcodeQuickScannerProps {
//   onBarcodeScanned: (barcode: string) => Promise<void> | void;
//   placeholder?: string;
//   className?: string;
//   autoFocus?: boolean;
// }

// export function BarcodeQuickScanner({
//   onBarcodeScanned,
//   placeholder = "Scan barcode or enter manually...",
//   className = "",
//   autoFocus = false,
// }: BarcodeQuickScannerProps) {
//   const [inputValue, setInputValue] = useState("");
//   const [modalOpen, setModalOpen] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const inputRef = useRef<HTMLInputElement>(null);

//   const processBarcode = async (barcode: string) => {
//     const trimmed = barcode.trim();
//     if (!trimmed || isLoading) return;

//     setIsLoading(true);
//     try {
//       // playScanBeepSound();
//       playStockAlertSound();
//       await onBarcodeScanned(trimmed);
//     } catch (error: unknown) {
//       console.error("Error processing scanned barcode:", error);
//       toast.error("Error processing barcode", {
//         description: error instanceof Error ? error.message : "Lookup failed",
//       });
//     } finally {
//       setIsLoading(false);
//       setInputValue("");
//     }
//   };

//   // Enable continuous USB/Bluetooth scanner listener
//   useBarcodeScanner({
//     onScan: (scannedBarcode) => {
//       processBarcode(scannedBarcode);
//     },
//     enabled: true,
//   });

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
//     processBarcode(inputValue);
//   };

//   return (
//     <div className={`flex items-center gap-2 ${className}`}>
//       <form
//         onSubmit={handleSubmit}
//         className="relative flex-1 flex items-center"
//       >
//         <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//         <Input
//           ref={inputRef}
//           type="text"
//           value={inputValue}
//           onChange={(e) => setInputValue(e.target.value)}
//           placeholder={placeholder}
//           autoFocus={autoFocus}
//           disabled={isLoading}
//           className="pl-9 pr-12 font-mono text-xs focus-visible:ring-1"
//         />
//         <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
//           {isLoading ? (
//             <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
//           ) : (
//             inputValue.trim() && (
//               <Button
//                 type="submit"
//                 size="sm"
//                 variant="ghost"
//                 className="h-7 px-2 text-xs"
//               >
//                 Go
//               </Button>
//             )
//           )}
//         </div>
//       </form>

//       <Button
//         type="button"
//         variant="outline"
//         size="sm"
//         onClick={() => setModalOpen(true)}
//         className="flex items-center gap-1.5 whitespace-nowrap text-xs h-9 px-3 border-dashed hover:border-solid hover:bg-accent"
//       >
//         <Scan className="h-3.5 w-3.5 text-primary" />
//         <span className="hidden sm:inline font-medium">Scan Camera</span>
//       </Button>

//       <BarcodeScannerModal
//         open={modalOpen}
//         onOpenChange={setModalOpen}
//         onScan={(scannedCode) => {
//           processBarcode(scannedCode);
//         }}
//       />
//     </div>
//   );
// }
