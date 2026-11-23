import { Platform } from "react-native";
import * as Print from "expo-print";
import type {
  BluetoothPrinterDevice,
  PaperSize,
  SaleReceiptDetail,
  ThermalPrinterConfig,
} from "@/types/domain";
import {
  encodeReceiptToEscPosBytes,
  encodeTestTicketToEscPosBytes,
  uint8ArrayToBase64,
} from "./escPosReceipt";
import { buildReceiptHtml, printReceipt } from "./receiptExport";

interface TcpSocketClient {
  write: (data: unknown, encoding?: string, cb?: () => void) => boolean;
  end: () => void;
  destroy: () => void;
  setTimeout?: (timeoutMs: number, cb?: () => void) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface TcpSocketModule {
  createConnection: (
    opts: { host: string; port: number; tls?: boolean },
    connectListener?: () => void,
  ) => TcpSocketClient;
}

interface BluetoothDeviceHandle {
  name?: string;
  address?: string;
  id?: string;
  isConnected?: () => Promise<boolean>;
  connect?: () => Promise<boolean>;
  write?: (data: string, encoding?: string) => Promise<boolean>;
}

interface BluetoothClassicModule {
  isBluetoothEnabled?: () => Promise<boolean>;
  getBondedDevices?: () => Promise<BluetoothDeviceHandle[]>;
  connectToDevice?: (address: string) => Promise<BluetoothDeviceHandle>;
  writeToDevice?: (
    address: string,
    message: string,
    encoding?: string,
  ) => Promise<boolean>;
}

function getTcpSocketModule(): TcpSocketModule | null {
  try {
    // Dynamically resolved only in native EAS Dev Client / production binaries
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-tcp-socket") as
      | Partial<TcpSocketModule>
      | { default?: Partial<TcpSocketModule> };
    const resolved: Partial<TcpSocketModule> =
      mod && typeof mod === "object" && "default" in mod && mod.default
        ? mod.default
        : (mod as Partial<TcpSocketModule>);
    if (resolved && typeof resolved.createConnection === "function") {
      return resolved as TcpSocketModule;
    }
    return null;
  } catch {
    return null;
  }
}

function getBluetoothClassicModule(): BluetoothClassicModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-bluetooth-classic") as
      | Partial<BluetoothClassicModule>
      | { default?: Partial<BluetoothClassicModule> };
    const resolved: Partial<BluetoothClassicModule> =
      mod && typeof mod === "object" && "default" in mod && mod.default
        ? mod.default
        : (mod as Partial<BluetoothClassicModule>);
    if (
      resolved &&
      (typeof resolved.getBondedDevices === "function" ||
        typeof resolved.connectToDevice === "function")
    ) {
      return resolved as BluetoothClassicModule;
    }
    return null;
  } catch {
    return null;
  }
}

export function validateTcpPrinterEndpoint(host: string, port: number): string | null {
  const cleanHost = host.trim();
  if (!cleanHost) {
    return "Enter the thermal printer IP address or hostname (e.g. 192.168.1.100).";
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(cleanHost)) {
    return "Printer host must be a valid IPv4 address or local hostname.";
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "Printer TCP port must be between 1 and 65535 (standard ESC/POS port is 9100).";
  }
  return null;
}

export async function sendEscPosOverTcp(
  host: string,
  port: number,
  bytes: Uint8Array,
  timeoutMs = 5000,
): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error(
      "Direct LAN TCP printing requires the Android/iOS mobile binary. Use System Print in web preview.",
    );
  }

  const endpointErr = validateTcpPrinterEndpoint(host, port);
  if (endpointErr) {
    throw new Error(endpointErr);
  }

  const tcp = getTcpSocketModule();
  if (!tcp) {
    throw new Error(
      "Direct TCP ESC/POS socket requires an EAS Dev Client or Production native build. Switch to System Print or build with `eas build`.",
    );
  }

  const cleanHost = host.trim();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let client: TcpSocketClient | null = null;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        client?.destroy();
      } catch {
        // ignore cleanup error
      }
      reject(
        new Error(
          `Timed out connecting to ESC/POS printer at ${cleanHost}:${port}. Verify Wi-Fi and printer power.`,
        ),
      );
    }, timeoutMs);

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        try {
          client?.destroy();
        } catch {
          // ignore
        }
        reject(err);
      } else {
        resolve();
      }
    };

    try {
      client = tcp.createConnection({ host: cleanHost, port, tls: false }, () => {
        try {
          const maybeBuffer = (
            globalThis as { Buffer?: { from: (arr: Uint8Array) => unknown } }
          ).Buffer;
          const payload = maybeBuffer
            ? maybeBuffer.from(bytes)
            : uint8ArrayToBase64(bytes);
          const encoding = maybeBuffer ? undefined : "base64";
          client?.write(payload, encoding, () => {
            try {
              client?.end();
            } catch {
              // ignore
            }
            finish();
          });
        } catch (writeErr) {
          finish(
            writeErr instanceof Error
              ? writeErr
              : new Error("Failed writing ESC/POS bytes to TCP printer."),
          );
        }
      });

      client.on("error", (errArg: unknown) => {
        const message =
          errArg instanceof Error
            ? errArg.message
            : `Unable to reach thermal printer at ${cleanHost}:${port}.`;
        finish(new Error(message));
      });
    } catch (connectErr) {
      finish(
        connectErr instanceof Error
          ? connectErr
          : new Error(`Failed opening socket to ${cleanHost}:${port}.`),
      );
    }
  });
}

export async function listPairedBluetoothPrinters(): Promise<{
  devices: BluetoothPrinterDevice[];
  nativeSupported: boolean;
}> {
  if (Platform.OS === "web") {
    return { devices: [], nativeSupported: false };
  }
  const bt = getBluetoothClassicModule();
  if (!bt || typeof bt.getBondedDevices !== "function") {
    return { devices: [], nativeSupported: false };
  }
  const bonded = await bt.getBondedDevices();
  const devices: BluetoothPrinterDevice[] = (bonded || [])
    .map((d) => ({
      name: String(d.name || "Thermal Printer").trim(),
      address: String(d.address || d.id || "").trim(),
    }))
    .filter((d) => d.address.length > 0);
  return { devices, nativeSupported: true };
}

export async function sendEscPosOverBluetooth(
  address: string,
  bytes: Uint8Array,
): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error(
      "Direct Bluetooth thermal printing is only available on iOS and Android devices.",
    );
  }
  const cleanAddress = address.trim();
  if (!cleanAddress) {
    throw new Error("Select or enter a paired Bluetooth printer address first.");
  }

  const bt = getBluetoothClassicModule();
  if (!bt) {
    throw new Error(
      "Direct Bluetooth ESC/POS transport requires an EAS Dev Client or Production native build. Switch to System Print or build with `eas build`.",
    );
  }

  if (typeof bt.isBluetoothEnabled === "function") {
    const enabled = await bt.isBluetoothEnabled();
    if (!enabled) {
      throw new Error("Bluetooth is turned off on this device.");
    }
  }

  const base64Payload = uint8ArrayToBase64(bytes);
  if (typeof bt.connectToDevice === "function") {
    const device = await bt.connectToDevice(cleanAddress);
    if (typeof device?.write === "function") {
      await device.write(base64Payload, "base64");
      return;
    }
  }

  if (typeof bt.writeToDevice === "function") {
    await bt.writeToDevice(cleanAddress, base64Payload, "base64");
    return;
  }

  throw new Error("Paired Bluetooth printer does not expose a serial write channel.");
}

export interface HardwarePrintResult {
  channel: "tcp" | "bluetooth" | "system";
  summary: string;
}

export async function printReceiptWithHardware(
  receipt: SaleReceiptDetail,
  paperSize: PaperSize,
  config: ThermalPrinterConfig,
): Promise<HardwarePrintResult> {
  if (paperSize === "a4" || config.transport === "system") {
    await printReceipt(receipt, paperSize);
    return {
      channel: "system",
      summary: "Sent receipt to OS print dialog.",
    };
  }

  const escPosBytes = encodeReceiptToEscPosBytes(receipt, {
    paperSize,
    autoCut: config.autoCut,
    openCashDrawer: config.openCashDrawer,
  });

  if (config.transport === "tcp") {
    await sendEscPosOverTcp(config.host, config.port, escPosBytes);
    return {
      channel: "tcp",
      summary: `Printed ESC/POS receipt to ${config.host}:${config.port}.`,
    };
  }

  await sendEscPosOverBluetooth(config.bluetoothAddress, escPosBytes);
  return {
    channel: "bluetooth",
    summary: `Printed ESC/POS receipt to ${config.bluetoothName || config.bluetoothAddress}.`,
  };
}

export async function printThermalTestTicket(
  storeName: string,
  paperSize: PaperSize,
  config: ThermalPrinterConfig,
): Promise<HardwarePrintResult> {
  const effectivePaper: PaperSize =
    paperSize === "a4" ? "thermal_80mm" : paperSize;

  if (config.transport === "system") {
    const sampleReceipt: SaleReceiptDetail = {
      id: "test-ticket",
      receiptNo: "TEST-0001",
      customerName: "Printer Calibration",
      saleDate: new Date().toISOString(),
      subtotal: 25,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 25,
      amountPaid: 25,
      paymentMode: "cash",
      status: "completed",
      attendantName: "System Check",
      notes: "Thermal formatting & margin test",
      storeName: storeName || "Inventory Pro",
      storeAddress: "POS Counter Calibration",
      storePhone: "",
      storeEmail: "",
      currency: "GHS",
      items: [
        {
          id: "test-1",
          productId: "test-prd",
          productName: "Sample Thermal Line Item",
          quantity: 1,
          unitPrice: 25,
          subtotal: 25,
        },
      ],
    };
    const html = buildReceiptHtml(sampleReceipt, effectivePaper);
    await Print.printAsync({ html });
    return {
      channel: "system",
      summary: "Opened OS print spooler for thermal test ticket.",
    };
  }

  const bytes = encodeTestTicketToEscPosBytes(storeName, {
    paperSize: effectivePaper,
    autoCut: config.autoCut,
    openCashDrawer: config.openCashDrawer,
  });

  if (config.transport === "tcp") {
    await sendEscPosOverTcp(config.host, config.port, bytes);
    return {
      channel: "tcp",
      summary: `Test ticket sent to LAN printer ${config.host}:${config.port}.`,
    };
  }

  await sendEscPosOverBluetooth(config.bluetoothAddress, bytes);
  return {
    channel: "bluetooth",
    summary: `Test ticket sent to Bluetooth printer ${config.bluetoothName || config.bluetoothAddress}.`,
  };
}
