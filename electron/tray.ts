// electron/tray.ts
import {  Tray, nativeImage, nativeTheme } from "electron";
import path from "path";

let tray: Tray | null = null;

export function getTrayIconPath() {
  const iconName = nativeTheme.shouldUseDarkColors ? "tray-light.png" : "tray-dark.png";
  // Note: use the LIGHT icon on a DARK background and vice versa,
  // since tray icons need to contrast with the OS taskbar color
  return path.join(process.resourcesPath, "icons", iconName);
}

export function createTray() {
  tray = new Tray(nativeImage.createFromPath(getTrayIconPath()));

  nativeTheme.on("updated", () => {
    if (tray) {
      tray.setImage(nativeImage.createFromPath(getTrayIconPath()));
    }
  });
}

// export tray