import { app, BrowserWindow, dialog, Menu } from "electron";
import fs from "fs";
import path from "path";
import { ChildProcess, spawn } from "child_process";
import getPort from "get-port";
import { createdWindow } from "./helpers/create-window";
import { initDatabase } from "./dbRunner";
import { createTray } from "./tray";
import { registerAllIpcHandlers } from "./handlers";
import {
  startEodScheduler,
  waitForNextServerReady,
} from "./electron-eod-scheduler";

//
app.commandLine.appendSwitch("ignore-certificate-errors");

// let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const dbPath = path.join(app.getPath("userData"), "inventorypro.sqlite3");

const logPath = path.join(app.getPath("userData"), "app.log");
function log(msg: string) {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
}

async function startNextServer(): Promise<number> {
  const port = await getPort({ port: 3000 });
  const serverPath = path.join(
    process.resourcesPath,
    "standalone",
    "server.js",
  );

  const certPath = path.join(
    process.resourcesPath,
    "standalone",
    "certificates",
  );

  // Spawn Next.js server locally on the Windows machine completely offline
  serverProcess = spawn("node", [serverPath], {
    windowsHide: true,

  });

  return new Promise((resolve) => {
    serverProcess!.stdout?.on("data", (data: Buffer) => {
      log(`[next-stdout] ${data}`);
      if (data.toString().includes("Ready")) resolve(port);
    });

    serverProcess!.on("error", (err) => {
      log(`Failed to spawn server process: ${err}`);
    });

    serverProcess!.stderr?.on("data", (data) => log(`[next-stderr] ${data}`));

    serverProcess!.on("exit", (code, signal) => {
      log(`Server process exited: code=${code} signal=${signal}`);
    });
  });
}

async function createWindow(): Promise<void> {
  const isDev = process.env.NODE_ENV === "development";
  const port = isDev ? 3000 : await startNextServer();
  const ready = await waitForNextServerReady(port);
  if (!ready) {
    log("Next.js server never became ready; EOD scheduler not started");
    console.error(
      "Next.js server never became ready; EOD scheduler not started",
    );
  } else {
    startEodScheduler(port);
  }

  Menu.setApplicationMenu(null);
  mainWindow = createdWindow("/", {
    width: 1200,
    height: 800,
    show: false,
    titleBarStyle: "hiddenInset", // REQUIRED: Must be hidden, not 'default'
    titleBarOverlay: {
      // REQUIRED: Must provide initial configs
      color: "#ffffff",
      symbolColor: "#000000",
      height: 35,
    },
    icon: path.join(__dirname, "..", "build", "icon.ico"), // Windows
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  // 💡 Intercept the close event
  mainWindow.on("close", async (e) => {
    // If the user already confirmed, bypass the dialog and let the window close
    if (isQuitting) {
      return;
    }

    // 1. Prevent the window from closing immediately
    e.preventDefault();

    // 2. Open a native system confirmation dialog
    const choice = await dialog.showMessageBox(mainWindow!, {
      type: "question",
      buttons: ["Yes, Close", "No, Stay"], // Button indexes: 0 = Yes, 1 = No
      defaultId: 1, // Highlights the 'No' button for safety
      title: "Confirm Exit",
      message: "Are you sure you want to close Inventory Pro?",
      detail: "Any unsaved changes will be lost.",
      cancelId: 1, // Triggers 'No' if they hit Escape or close the dialog box
    });

    // 3. If the user clicks 'Yes, Close' (index 0)
    if (choice.response === 0) {
      // Destroy the window context completely bypassing this listener
      isQuitting = true;
      app.quit();
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  if (isDev) {
    mainWindow.loadURL(`https://localhost:${port}`);
  } else {
    mainWindow.loadURL(`http://localhost:${port}`);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    log("App ready, starting server...");
    try {
      await initDatabase();
      log("Db initiated");

      registerAllIpcHandlers();

      createTray();

      await createWindow();
      log("Window created successfully");

      app.on("activate", function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    } catch (err) {
      dialog.showErrorBox(
        "Database Error",
        "Failed to initialize the database. The app will now quit.",
      );
      log(`ERROR: ${err}`);
    }
  });
}

app.on("window-all-closed", () => {
  serverProcess?.kill("SIGTERM");
  if (process.platform !== "darwin") app.quit();
});
