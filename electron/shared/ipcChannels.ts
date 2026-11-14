// shared/ipcChannels.ts
export const IPC_CHANNELS = {
  printer: {
    getPrinters: "printer:get-printers",
    printReceipt: "printer:print-receipt",
  },
} as const;
