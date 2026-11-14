// preload.ts
import { contextBridge, ipcRenderer } from "electron";
// import { ElectronAPI } from "./types/api";
import { PrinterAPI } from "./types/printer";
import { ThemeAPI } from "./types/theme";
import { ElectronAPI } from "../global";

const printer: PrinterAPI = {
  getPrinters: () => ipcRenderer.invoke("printer:get-printers"),
  printReceipt: (html, printerName, options) =>
    ipcRenderer.invoke("printer:print-receipt", html, printerName, options),
};

const theme: ThemeAPI = {
  changeTheme: (payload) => ipcRenderer.invoke("theme:update", payload),
  toggleFS: () => ipcRenderer.invoke("theme:toggle-fullscreen"),
};

const api: ElectronAPI = { printer, theme, platform: "desktop", };

contextBridge.exposeInMainWorld("api", api);
