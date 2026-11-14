import { nativeTheme } from "electron";
import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from "electron";

import { IThemePayload } from "../types/theme";

export function registerThemeHandlers(): void {
  // Explicitly type the theme argument
  ipcMain.handle(
    "theme:update",
    (event: IpcMainInvokeEvent, payload: IThemePayload) => {
      const { theme, accentColor } = payload;

      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error("No window associated with this request");

      // console.log(payload);
      // Set native window/OS dark or light context
      nativeTheme.themeSource = theme;

      if (win) {
        // Dynamically update the background color of the default titlebar region
        if (accentColor) {
          try {
            win.setAccentColor(accentColor);
          } catch (error) {
            console.warn("Could not update titlebar overlay:", error);
          }
        }
      }
    },
  );

  ipcMain.handle("theme:toggle-fullscreen", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error("No window associated with this request");

    if (win) {
      const isFS = win.isFullScreen();
      win.setFullScreen(!isFS); // Toggles the fullscreen state
    }
  });
}
