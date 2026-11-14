// main/printReceipt.ts
import { BrowserWindow } from "electron";
import { PrintOptions } from "./types/printer";
import { log } from "./log";

export async function printReceipt(
  html: string,
  printerName: string,
  options: PrintOptions,
): Promise<void> {
  // Create an offscreen window to optimize performance and prevent visual flickering
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
    },
  });

  try {
    // log(`Print started for printer: ${printerName}`);
    // log(`Width: ${options.width}, Height: ${options.height}`);

    // Wait for the HTML content to completely finish loading before attempting to print
    await printWin.loadURL(
      "data:text/html;charset=UTF-8," + encodeURIComponent(html),
    );

    await new Promise<void>((resolve, reject) => {
      printWin.webContents.print(
        {
          silent: true,
          deviceName: printerName,
          printBackground: true,
          usePrinterDefaultPageSize: true,
          margins: {
            marginType: "none",
          },
          // footer:"By Frebbytech Solutions (+233 543 772 591)"

          // 2. Remove manual margins so the driver determines printable areas
          // pageSize: {
          //   width: options.width,
          //  height: options.height > 150000 ? 100000 : options.height,
          // },
        },
        (success: boolean, failureReason: string) => {
          // log(`Print callback triggered for printer: ${printerName}, success: ${success}, failureReason: ${failureReason}`);
          if (!success) {
            log(
              `Failed to print receipt for printer: ${printerName}, reason: ${failureReason}`,
            );
            reject(new Error(failureReason || "Unknown printing error"));
            return;
          }
          resolve();
        },
      );
    });
  } catch (error: any) {
    log(`Error printing receipt: ${error.message}`);
    throw error; // Re-throw so the calling UI knows the print failed
  } finally {
    // Add a short timeout to let the OS spooler finish handling the print stream before destroying the window
    setTimeout(() => {
      if (!printWin.isDestroyed()) {
        printWin.destroy();
        // log("Print window successfully destroyed.");
      }
    }, 2000);
  }
}

// // main/printReceipt.ts
// import { BrowserWindow } from "electron";
// import { PrintOptions } from "./types/printer";
// import ca from "zod/v4/locales/ca.cjs";
// import { log } from "./log";

// export async function printReceipt(
//   html: string,
//   printerName: string,
//   options: PrintOptions,
// ): Promise<void> {
//   const printWin = new BrowserWindow({
//     show: false,
//     webPreferences: {
//       offscreen: false,
//     },
//   });

//   try {
//      log(`print started for printer: ${printerName}`);
//      log(`width: ${options.width}, height: ${options.height}`);

//      await printWin.loadURL(
//   "data:text/html;charset=UTF-8," + encodeURIComponent("<h1>Test</h1><p>Hello</p>")
// );
//     // await printWin.loadURL(
//     //   "data:text/html;charset=UTF-8," + encodeURIComponent(html),
//     // );

//     await new Promise<void>((resolve, reject) => {
//       printWin.webContents.print(
//         {
//           silent: true,
//           deviceName: printerName,
//           printBackground: true,
//           margins: { marginType: "none" },
//           pageSize: {
//             width: options.width,
//             height: options.height,
//           },
//         },
//         (success: boolean, failureReason: string) => {
//           log(`print completed for printer: ${printerName}, success: ${success}, failureReason: ${failureReason}`);
//           if (!success) {
//             log(`Failed to print receipt for printer: ${printerName}, reason: ${failureReason}`);
//             reject(new Error(failureReason));
//             return;
//           }
//           resolve();
//         },
//       );
//     });
//   }
//   //  catch (error: any) {
//   //   log(`Error printing receipt: ${error.message}`);
//   //   // throw error;
//   // }
//    finally {
//     // always destroy, even if print failed
//     if (!printWin.isDestroyed()) {
//       printWin.destroy();
//     }
//   }
// }
