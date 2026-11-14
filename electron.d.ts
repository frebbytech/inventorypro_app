import { IpcHandler } from "./electron/preload";
import { ElectronAPI } from "./global";

declare global {
  interface Window {
    ipc: IpcHandler;
    api: ElectronAPI;
  }
}
