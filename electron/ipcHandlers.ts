// main/ipcHandlers.ts
import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from "electron";
import { getPrinters } from "./printer";
import { printReceipt } from "./printReceipt";
import { PrintInfo, PrintOptions } from "./types/printer";

export function registerPrinterIpcHandlers(): void {
  ipcMain.handle(
    "get-printers",
    async (event: IpcMainInvokeEvent): Promise<PrintInfo[]> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window associated with this request");
      return getPrinters(win);
    }
  );

  ipcMain.handle(
    "print-receipt",
    async (
      _event: IpcMainInvokeEvent,
      html: string,
      printerName: string,
      options: PrintOptions
    ): Promise<void> => {
      return printReceipt(html, printerName, options);
    }
  );
}