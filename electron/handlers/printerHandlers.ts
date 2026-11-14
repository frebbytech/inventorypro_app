// main/handlers/printerHandlers.ts (updated to use shared channel constants)
import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from "electron";

import { getPrinters } from "../printer";
import { printReceipt } from "../printReceipt";
import { PrintOptions } from "../types/printer";


export function registerPrinterHandlers(): void {
  ipcMain.handle("printer:get-printers", async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error("No window associated with this request");
    return getPrinters(win);
  });

  ipcMain.handle(
    "printer:print-receipt",
    async (
      _event,
      html: string,
      printerName: string,
      options: PrintOptions,
    ) => {
      return printReceipt(html, printerName, options);
    },
  );
}
