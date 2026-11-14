// main/handlers/index.ts
import { registerPrinterHandlers } from "./printerHandlers";
import { registerThemeHandlers } from "./themeHandlers";

export function registerAllIpcHandlers(): void {
  registerPrinterHandlers();
  registerThemeHandlers();
}
