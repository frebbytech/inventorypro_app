// types/api.ts

import { PrinterAPI } from "./electron/types/printer";
import { ThemeAPI } from "./electron/types/theme";

export interface ElectronAPI {
  printer: PrinterAPI;
  theme: ThemeAPI;
  platform: String;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
