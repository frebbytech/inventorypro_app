// types/printer.ts
import type { PrinterInfo } from "electron";

export interface PrintOptions {
  width: number; // microns
  height: number; // microns
}

export interface PrintInfo {
  name: string;
  displayName: string;
  options?: PrinterInfo["options"];
}


// Shape exposed via contextBridge in preload.ts
export interface PrinterAPI {
  getPrinters: () => Promise<PrintInfo[]>;
  printReceipt: (
    html: string,
    printerName: string,
    options: PrintOptions,
  ) => Promise<void>;
}

declare global {
  interface Window {
    printerAPI: PrinterAPI;
  }
}
