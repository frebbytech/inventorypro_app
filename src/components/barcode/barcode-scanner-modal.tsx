"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { CameraOff, CheckCircle2, Keyboard, RefreshCw, Scan } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface BarcodeScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (barcode: string) => void;
  title?: string;
  description?: string;
  /** True while a previously scanned code is still being handled upstream (e.g. a product lookup). New detections are ignored, not queued, until this clears. */
  isProcessing?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Constants (module scope)                                                  */
/* -------------------------------------------------------------------------- */

// Kept as one list so the on-screen "Supports" line can never drift out of
// sync with what the scanner is actually configured to recognise.
const SUPPORTED_FORMATS: { format: Html5QrcodeSupportedFormats; label: string }[] = [
  { format: Html5QrcodeSupportedFormats.EAN_13, label: "EAN-13" },
  { format: Html5QrcodeSupportedFormats.EAN_8, label: "EAN-8" },
  { format: Html5QrcodeSupportedFormats.UPC_A, label: "UPC-A" },
  { format: Html5QrcodeSupportedFormats.UPC_E, label: "UPC-E" },
  { format: Html5QrcodeSupportedFormats.CODE_128, label: "Code 128" },
  { format: Html5QrcodeSupportedFormats.CODE_39, label: "Code 39" },
  { format: Html5QrcodeSupportedFormats.ITF, label: "ITF" },
  { format: Html5QrcodeSupportedFormats.QR_CODE, label: "QR code" },
  { format: Html5QrcodeSupportedFormats.DATA_MATRIX, label: "Data Matrix" },
];
const FORMATS_TO_SUPPORT = SUPPORTED_FORMATS.map((f) => f.format);
const FORMATS_LABEL = SUPPORTED_FORMATS.map((f) => f.label).join(", ");

const REPEAT_SCAN_WINDOW_MS = 1200; // ignore the same frame-by-frame re-detection within this window
const START_DELAY_MS = 300; // lets the container element mount before html5-qrcode looks for it

function isPermissionError(err: unknown) {
  if (err instanceof DOMException) return err.name === "NotAllowedError";
  const message = err instanceof Error ? err.message : String(err);
  return /notallowederror|permission|denied/i.test(message);
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function BarcodeScannerModal({
  open,
  onOpenChange,
  onScan,
  title = "Scan barcode",
  description = "Point the camera at a barcode, or enter the code manually.",
  isProcessing = false,
}: BarcodeScannerModalProps) {
  const [manualCode, setManualCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [justScanned, setJustScanned] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef(0);
  const containerId = `html5qrcode-view-${useId().replace(/:/g, "")}`;

  // The camera-start effect below only re-runs when `open` changes (see its
  // deps). Routing onScan/isProcessing through refs means a parent re-render
  // — typing in a sibling field, a loading flag flipping — can never tear
  // down and restart the camera stream, which is the actual cause of a
  // flickering, endlessly-reinitialising scanner.
  const onScanRef = useRef(onScan);
  const isProcessingRef = useRef(isProcessing);
  useEffect(() => {
    onScanRef.current = onScan;
    isProcessingRef.current = isProcessing;
  }, [onScan, isProcessing]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;

    try {
      if (scanner.isScanning) await scanner.stop();
      await scanner.clear();
    } catch (err) {
      console.warn("Failed to stop the barcode scanner cleanly:", err);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleDetected = useCallback((decodedText: string) => {
    // A previous scan is still being handled upstream (e.g. looking the
    // product up) — surfacing "detected!" for a scan that gets silently
    // dropped downstream would be misleading, so ignore it entirely for now.
    if (isProcessingRef.current) return;

    const now = Date.now();
    if (now - lastScanTimeRef.current < REPEAT_SCAN_WINDOW_MS) return;
    lastScanTimeRef.current = now;

    const code = decodedText.trim();
    if (!code) return;

    setLastScannedCode(code);
    setJustScanned(true);
    setTimeout(() => setJustScanned(false), 1000);

    onScanRef.current(code);
  }, []);

  const startScanner = useCallback(
    async (cameraId?: string) => {
      setCameraError(null);
      await stopScanner();

      try {
        const html5Qrcode = new Html5Qrcode(containerId, {
          formatsToSupport: FORMATS_TO_SUPPORT,
          verbose: false,
        });
        scannerRef.current = html5Qrcode;

        const devices = await Html5Qrcode.getCameras();
        if (!devices || devices.length === 0) {
          setCameraError("No camera was found on this device.");
          return;
        }

        setCameras(devices.map((d, i) => ({ id: d.id, label: d.label || `Camera ${i + 1}` })));

        const targetId =
          cameraId ??
          devices.find((d) => /back|environment/i.test(d.label))?.id ??
          devices[0].id;
        setSelectedCameraId(targetId);

        await html5Qrcode.start(
          targetId,
          { fps: 15, qrbox: { width: 280, height: 180 }, aspectRatio: 1.333 },
          handleDetected,
          () => {} // per-frame "nothing found" callback: expected on almost every frame, not an error
        );
        setIsScanning(true);
      } catch (err) {
        console.warn("Camera initialization failed:", err);
        setCameraError(
          isPermissionError(err)
            ? "Camera access was denied. Allow it in your browser's site settings, or use manual entry below."
            : "Couldn't access a camera. Check that one is connected, or use manual entry below."
        );
      }
    },
    [containerId, handleDetected, stopScanner]
  );

  // Starts the camera when the dialog opens and tears it down when it
  // closes or unmounts. `startScanner`/`stopScanner` are stable (see above),
  // so — correctly — this only fires on real open/close transitions.
  useEffect(() => {
    if (!open) {
      void stopScanner();
      setManualCode("");
      setLastScannedCode(null);
      setCameraError(null);
      return;
    }

    const timer = setTimeout(() => void startScanner(), START_DELAY_MS);
    return () => {
      clearTimeout(timer);
      void stopScanner();
    };
  }, [open, startScanner, stopScanner]);

  function handleManualSubmit(e?: FormEvent) {
    e?.preventDefault();
    const code = manualCode.trim();
    if (!code || isProcessing) return;
    onScanRef.current(code);
    setManualCode("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Plain, global-scope keyframes: harmless if this component ever rendered
          twice, since both instances would define the identical rule. Kept local
          rather than added to a shared stylesheet, since this animation is only
          ever used here. */}
      <style>{`
        @keyframes barcode-laser-sweep-frames {
          0%, 100% { top: 8%; }
          50% { top: 88%; }
        }
        .barcode-laser-sweep {
          animation: barcode-laser-sweep-frames 1.8s ease-in-out infinite;
        }
      `}</style>

      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Scan aria-hidden className="size-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* Camera preview: intentionally dark regardless of theme, like any video viewfinder */}
          <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-lg bg-black">
            <div id={containerId} className="h-full min-h-64 w-full" />

            {isScanning && !cameraError && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div
                  className={cn(
                    "relative h-44 w-72 overflow-hidden rounded-lg border-2 transition-colors",
                    justScanned ? "border-emerald-400" : "border-white/60"
                  )}
                >
                  {/* Sweeps top-to-bottom-to-top while actively looking; freezes in place the
                      moment something is detected or a previous scan is still being handled,
                      so the motion always matches what the scanner is actually doing. */}
                  <span
                    aria-hidden
                    className="barcode-laser-sweep absolute inset-x-2 h-0.5 rounded-full bg-red-500 shadow-[0_0_6px_theme(colors.red.500)]"
                    style={{ animationPlayState: justScanned || isProcessing ? "paused" : "running" }}
                  />
                </div>
                <p className="rounded-full bg-black/70 px-3 py-1 text-sm text-white">
                  {justScanned ? "Detected" : "Looking for a barcode…"}
                </p>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                <CameraOff aria-hidden className="size-8 text-white/70" />
                <p className="max-w-xs text-sm text-white/80">{cameraError}</p>
                <Button size="sm" variant="secondary" onClick={() => void startScanner(selectedCameraId)}>
                  <RefreshCw aria-hidden className="size-3.5" />
                  Try again
                </Button>
              </div>
            )}
          </div>

          {/* <p className="text-sm text-muted-foreground">Supports {FORMATS_LABEL}.</p> */}

          {cameras.length > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`${containerId}-camera`} className="text-sm text-muted-foreground">
                Camera
              </Label>
              <select
                id={`${containerId}-camera`}
                value={selectedCameraId}
                onChange={(e) => void startScanner(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {lastScannedCode && (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 aria-hidden className="size-4 shrink-0" />
              Last scanned <span className="font-mono font-medium">{lastScannedCode}</span>
            </p>
          )}

          {isProcessing && (
            <p className="text-sm text-muted-foreground">Processing the last scan…</p>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-2 border-t pt-4">
            <Label htmlFor={`${containerId}-manual`} className="flex items-center gap-1.5 text-sm">
              <Keyboard aria-hidden className="size-3.5 text-muted-foreground" />
              Manual entry, or USB scanner
            </Label>
            <div className="flex gap-2">
              <Input
                id={`${containerId}-manual`}
                placeholder="Type or scan a code…"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                disabled={isProcessing}
                className="font-mono"
              />
              <Button type="submit" disabled={!manualCode.trim() || isProcessing}>
                Submit
              </Button>
            </div>
          </form>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "use client";

// import { useEffect, useRef, useState, useCallback } from "react";
// import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
// import { Dialog as RadixDialog, DialogContent as RadixDialogContent, DialogHeader as RadixDialogHeader, DialogTitle as RadixDialogTitle, DialogDescription as RadixDialogDescription, DialogFooter as RadixDialogFooter } from "@/components/ui/dialog";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Badge } from "@/components/ui/badge";
// import { Camera, CameraOff, Keyboard, Scan, RefreshCw, CheckCircle2, Volume2 } from "lucide-react";
// import { playScanBeepSound } from "@/hooks/use-barcode-scanner";

// interface BarcodeScannerModalProps {
//   open: boolean;
//   onOpenChange: (open: boolean) => void;
//   onScan: (barcode: string) => void;
//   title?: string;
//   description?: string;
// }

// export function BarcodeScannerModal({
//   open,
//   onOpenChange,
//   onScan,
//   title = "Scan Barcode",
//   description = "Align the barcode within the camera frame or enter the code manually.",
// }: BarcodeScannerModalProps) {
//   const [manualCode, setManualCode] = useState("");
//   const [isScanning, setIsScanning] = useState(false);
//   const [cameraError, setCameraError] = useState<string | null>(null);
//   const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
//   const [selectedCameraId, setSelectedCameraId] = useState<string>("");
//   const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
//   const [scanSuccessFeedback, setScanSuccessFeedback] = useState(false);

//   const scannerRef = useRef<Html5Qrcode | null>(null);
//   const scannerContainerId = "html5qrcode-camera-view";
//   const lastScanTimeRef = useRef<number>(0);

//   // Stop current camera scanner cleanly
//   const stopScanner = useCallback(async () => {
//     if (scannerRef.current) {
//       try {
//         if (scannerRef.current.isScanning) {
//           await scannerRef.current.stop();
//         }
//         await scannerRef.current.clear();
//       } catch (err) {
//         console.warn("Failed to stop html5Qrcode scanner:", err);
//       } finally {
//         scannerRef.current = null;
//         setIsScanning(false);
//       }
//     }
//   }, []);

//   // Handle successful scan event
//   const handleScanSuccess = useCallback(
//     (decodedText: string) => {
//       const now = Date.now();
//       // Debounce repeat scans within 1.2s
//       if (now - lastScanTimeRef.current < 1200) return;
//       lastScanTimeRef.current = now;

//       const cleanedCode = decodedText.trim();
//       if (!cleanedCode) return;

//       playScanBeepSound();
//       setLastScannedCode(cleanedCode);
//       setScanSuccessFeedback(true);

//       setTimeout(() => {
//         setScanSuccessFeedback(false);
//       }, 1000);

//       onScan(cleanedCode);
//     },
//     [onScan]
//   );

//   // Start camera scanner
//   const startScanner = useCallback(
//     async (cameraId?: string) => {
//       setCameraError(null);
//       await stopScanner();

//       try {
//         const formatsToSupport = [
//           Html5QrcodeSupportedFormats.EAN_13,
//           Html5QrcodeSupportedFormats.EAN_8,
//           Html5QrcodeSupportedFormats.UPC_A,
//           Html5QrcodeSupportedFormats.UPC_E,
//           Html5QrcodeSupportedFormats.CODE_128,
//           Html5QrcodeSupportedFormats.CODE_39,
//           Html5QrcodeSupportedFormats.ITF,
//           Html5QrcodeSupportedFormats.QR_CODE,
//           Html5QrcodeSupportedFormats.DATA_MATRIX,
//         ];

//         const html5Qrcode = new Html5Qrcode(scannerContainerId, {
//           formatsToSupport,
//           verbose: false,
//         });

//         scannerRef.current = html5Qrcode;

//         const availableDevices = await Html5Qrcode.getCameras();
//         if (availableDevices && availableDevices.length > 0) {
//           setCameras(
//             availableDevices.map((d, index) => ({
//               id: d.id,
//               label: d.label || `Camera ${index + 1}`,
//             }))
//           );

//           // Default to back/environment camera if available
//           const targetCamId =
//             cameraId ||
//             availableDevices.find((d) =>
//               d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("environment")
//             )?.id ||
//             availableDevices[0].id;

//           setSelectedCameraId(targetCamId);

//           await html5Qrcode.start(
//             targetCamId,
//             {
//               fps: 15,
//               qrbox: { width: 280, height: 180 },
//               aspectRatio: 1.333,
//             },
//             (decodedText) => {
//               handleScanSuccess(decodedText);
//             },
//             () => {
//               // Ignore framing errors during scanning
//             }
//           );

//           setIsScanning(true);
//         } else {
//           setCameraError("No camera device found on this system.");
//         }
//       } catch (err: unknown) {
//         console.warn("Camera initialization notice:", err);
//         const errMsg = err instanceof Error ? err.message : String(err);
//         if (
//           errMsg.includes("NotAllowedError") ||
//           errMsg.includes("Permission") ||
//           errMsg.includes("denied")
//         ) {
//           setCameraError(
//             "Camera permission was denied. You can allow camera access in your browser settings, or enter barcodes manually / use a hardware USB scanner below."
//           );
//         } else {
//           setCameraError(
//             "Could not access camera device. Please ensure your camera is connected or use manual entry / USB scanner."
//           );
//         }
//       }
//     },
//     [handleScanSuccess, stopScanner]
//   );

//   // Initialize or teardown when modal opens/closes
//   useEffect(() => {
//     if (open) {
//       // Delay slightly to ensure DOM element exists
//       const timer = setTimeout(() => {
//         startScanner();
//       }, 300);
//       return () => {
//         clearTimeout(timer);
//         stopScanner();
//       };
//     } else {
//       stopScanner();
//       setManualCode("");
//       setLastScannedCode(null);
//       setCameraError(null);
//     }
//   }, [open, startScanner, stopScanner]);

//   const handleManualSubmit = (e?: React.FormEvent) => {
//     if (e) e.preventDefault();
//     if (!manualCode.trim()) return;
//     playScanBeepSound();
//     onScan(manualCode.trim());
//     setManualCode("");
//   };

//   return (
//     <RadixDialog open={open} onOpenChange={onOpenChange}>
//       <RadixDialogContent className="sm:max-w-md">
//         <RadixDialogHeader>
//           <RadixDialogTitle className="flex items-center gap-2 text-xl font-bold">
//             <Scan className="h-5 w-5 text-primary" />
//             {title}
//           </RadixDialogTitle>
//           <RadixDialogDescription>{description}</RadixDialogDescription>
//         </RadixDialogHeader>

//         <div className="space-y-4 my-2">
//           {/* Format Badges */}
//           <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
//             <span className="font-semibold text-foreground">Formats:</span>
//             <Badge variant="outline" className="text-[10px] py-0 px-1.5">
//               EAN-13
//             </Badge>
//             <Badge variant="outline" className="text-[10px] py-0 px-1.5">
//               EAN-8
//             </Badge>
//             <Badge variant="outline" className="text-[10px] py-0 px-1.5">
//               UPC-A/E
//             </Badge>
//             <Badge variant="outline" className="text-[10px] py-0 px-1.5">
//               Code 128
//             </Badge>
//             <Badge variant="outline" className="text-[10px] py-0 px-1.5">
//               Code 39
//             </Badge>
//             <Badge variant="outline" className="text-[10px] py-0 px-1.5">
//               ITF
//             </Badge>
//           </div>

//           {/* Camera Stream Area */}
//           <div className="relative overflow-hidden rounded-xl border border-border bg-slate-950 min-h-[260px] flex items-center justify-center">
//             {/* HTML5 QrCode Container */}
//             <div id={scannerContainerId} className="w-full h-full min-h-[260px]" />

//             {/* Scan Beam & Framing Overlay when Scanning */}
//             {isScanning && !cameraError && (
//               <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
//                 <div
//                   className={`relative w-[280px] h-[180px] rounded-lg border-2 transition-colors duration-300 ${
//                     scanSuccessFeedback
//                       ? "border-emerald-500 bg-emerald-500/20"
//                       : "border-primary/80"
//                   }`}
//                 >
//                   {/* Corner Target Markers */}
//                   <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary -mt-1 -ml-1 rounded-tl-sm" />
//                   <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary -mt-1 -mr-1 rounded-tr-sm" />
//                   <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary -mb-1 -ml-1 rounded-bl-sm" />
//                   <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary -mb-1 -mr-1 rounded-br-sm" />

//                   {/* Animated laser line */}
//                   <div className="w-full h-0.5 bg-red-500/90 shadow-[0_0_8px_#ef4444] animate-pulse my-[88px]" />
//                 </div>
//                 <p className="mt-3 text-xs font-medium text-slate-300 bg-slate-900/80 px-3 py-1 rounded-full backdrop-blur-sm">
//                   {scanSuccessFeedback ? "Barcode Detected!" : "Scanning barcode..."}
//                 </p>
//               </div>
//             )}

//             {/* Error or No Camera Overlay */}
//             {cameraError && (
//               <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-slate-900/95 text-slate-200 space-y-3">
//                 <div className="p-3 bg-red-500/10 rounded-full text-red-400">
//                   <CameraOff className="h-8 w-8" />
//                 </div>
//                 <div className="space-y-1">
//                   <p className="font-semibold text-sm text-red-300">Camera Unavailable</p>
//                   <p className="text-xs text-slate-400 max-w-xs">{cameraError}</p>
//                 </div>
//                 <Button
//                   size="sm"
//                   variant="outline"
//                   onClick={() => startScanner(selectedCameraId)}
//                   className="mt-2 text-xs border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
//                 >
//                   <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry Camera
//                 </Button>
//               </div>
//             )}
//           </div>

//           {/* Camera Selection & Status */}
//           {cameras.length > 1 && (
//             <div className="flex items-center justify-between text-xs">
//               <span className="text-muted-foreground">Select Camera:</span>
//               <select
//                 value={selectedCameraId}
//                 onChange={(e) => startScanner(e.target.value)}
//                 className="bg-background border border-input rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
//               >
//                 {cameras.map((cam) => (
//                   <option key={cam.id} value={cam.id}>
//                     {cam.label}
//                   </option>
//                 ))}
//               </select>
//             </div>
//           )}

//           {/* Last Scanned Feedback */}
//           {lastScannedCode && (
//             <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-lg text-xs font-medium animate-in fade-in">
//               <span className="flex items-center gap-1.5">
//                 <CheckCircle2 className="h-4 w-4 text-emerald-500" />
//                 Last Scanned: <span className="font-mono font-bold">{lastScannedCode}</span>
//               </span>
//               <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
//                 Processed
//               </Badge>
//             </div>
//           )}

//           {/* Manual Barcode Input Fallback */}
//           <form onSubmit={handleManualSubmit} className="space-y-2 pt-2 border-t">
//             <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
//               <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
//               Manual Barcode Entry / USB Hardware Scanner
//             </label>
//             <div className="flex gap-2">
//               <Input
//                 placeholder="Type or scan barcode here..."
//                 value={manualCode}
//                 onChange={(e) => setManualCode(e.target.value)}
//                 className="text-xs font-mono"
//               />
//               <Button type="submit" size="sm" disabled={!manualCode.trim()}>
//                 Submit
//               </Button>
//             </div>
//           </form>
//         </div>

//         <RadixDialogFooter className="sm:justify-between flex-row gap-2 items-center">
//           <span className="text-[11px] text-muted-foreground flex items-center gap-1">
//             <Volume2 className="h-3 w-3 text-muted-foreground" />
//             Audio feedback enabled
//           </span>
//           <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
//             Done
//           </Button>
//         </RadixDialogFooter>
//       </RadixDialogContent>
//     </RadixDialog>
//   );
// }
