// types/printer.ts
export interface PrintOptions {
  width: number;  // microns
  height: number; // microns
}

export interface PrinterInfo {
  name: string;
  displayName: string;
    options?: Electron.PrinterInfo["options"];
  // status: number;
  // isDefault: boolean;
}

// Shape exposed via contextBridge in preload.ts
export interface PrinterAPI {
  getPrinters: () => Promise<PrinterInfo[]>;
  printReceipt: (html: string, printerName: string, options: PrintOptions) => Promise<void>;
}

declare global {
  interface Window {
    printerAPI: PrinterAPI;
  }
}