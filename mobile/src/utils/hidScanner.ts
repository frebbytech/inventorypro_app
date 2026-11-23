/**
 * Pure TypeScript Bluetooth / USB HID keyboard-wedge scanner buffer & parser.
 * Supports high-speed barcode bursts with or without CR/LF suffixes.
 */

export function normalizeScannedBarcode(raw: string): string {
  return raw
    // Strip ASCII control characters (STX/ETX/CR/LF/TAB/etc.)
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
}

export function isValidScannedBarcode(raw: string, minLength = 3): boolean {
  const clean = normalizeScannedBarcode(raw);
  return clean.length >= minLength && clean.length <= 128;
}

export interface HidBurstStepResult {
  committedBarcode: string | null;
  pendingBuffer: string;
}

export class HidScannerBuffer {
  private buffer = "";
  private lastInputAt = 0;

  constructor(
    private readonly options: {
      maxInterKeyMs?: number;
      minLength?: number;
    } = {},
  ) {}

  private get maxInterKeyMs(): number {
    return this.options.maxInterKeyMs ?? 250;
  }

  private get minLength(): number {
    return this.options.minLength ?? 3;
  }

  reset(): void {
    this.buffer = "";
    this.lastInputAt = 0;
  }

  getPending(): string {
    return this.buffer;
  }

  /**
   * Process an updated text snapshot from a controlled HID capture input.
   * Returns a committed barcode immediately if CR/LF terminator is present.
   */
  ingestTextChange(nextValue: string, nowMs = Date.now()): HidBurstStepResult {
    if (!nextValue) {
      this.reset();
      return { committedBarcode: null, pendingBuffer: "" };
    }

    const hasTerminator = /[\r\n]/.test(nextValue);

    // If a slow pause occurred since the previous character and buffer grew by 1 char,
    // discard stale partial prefix so new scans start clean.
    if (
      this.lastInputAt > 0 &&
      nowMs - this.lastInputAt > this.maxInterKeyMs &&
      nextValue.length > this.buffer.length
    ) {
      const freshTail = nextValue.slice(this.buffer.length);
      this.buffer = normalizeScannedBarcode(freshTail);
    } else {
      this.buffer = normalizeScannedBarcode(nextValue);
    }

    this.lastInputAt = nowMs;

    if (hasTerminator) {
      return this.commit();
    }

    return { committedBarcode: null, pendingBuffer: this.buffer };
  }

  commit(): HidBurstStepResult {
    const clean = normalizeScannedBarcode(this.buffer);
    this.reset();
    if (clean.length >= this.minLength && clean.length <= 128) {
      return { committedBarcode: clean, pendingBuffer: "" };
    }
    return { committedBarcode: null, pendingBuffer: "" };
  }
}
