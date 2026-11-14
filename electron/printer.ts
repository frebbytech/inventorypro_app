// main/printer.ts
import { BrowserWindow } from "electron";
import { PrintInfo } from "./types/printer";

export async function getPrinters(win: BrowserWindow): Promise<PrintInfo[]> {
  const printers = await win.webContents.getPrintersAsync();

  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName,
    // status: p.status,
    // isDefault: p.isDefault,
    options: p.options,
  }));
}
