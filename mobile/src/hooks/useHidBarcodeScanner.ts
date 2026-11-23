import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, TextInput, type TextInputProps } from "react-native";
import { HidScannerBuffer } from "@/utils/hidScanner";

export type HidCaptureInputHandle = ComponentRef<typeof TextInput>;

export interface UseHidBarcodeScannerOptions {
  enabled: boolean;
  /** Suspend capture while a modal or manual search input is active */
  suspended?: boolean;
  /** Delay before auto-committing scans from scanners without CR/LF suffix */
  idleCommitMs?: number;
  minLength?: number;
  onScan: (barcode: string) => void;
}

export interface UseHidBarcodeScannerResult {
  inputRef: React.RefObject<HidCaptureInputHandle | null>;
  inputProps: Partial<TextInputProps>;
  isArmed: boolean;
  lastScan: string | null;
  lastScanAt: number | null;
  rearm: () => void;
}

export function useHidBarcodeScanner({
  enabled,
  suspended = false,
  idleCommitMs = 190,
  minLength = 3,
  onScan,
}: UseHidBarcodeScannerOptions): UseHidBarcodeScannerResult {
  const inputRef = useRef<HidCaptureInputHandle | null>(null);
  const bufferRef = useRef(new HidScannerBuffer({ minLength }));
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [captureValue, setCaptureValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const commitScan = useCallback(
    (barcode: string) => {
      clearIdleTimer();
      setCaptureValue("");
      setLastScan(barcode);
      setLastScanAt(Date.now());
      onScanRef.current(barcode);
    },
    [clearIdleTimer],
  );

  const rearm = useCallback(() => {
    if (!enabled || suspended || Platform.OS === "web") return;
    setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
  }, [enabled, suspended]);

  useEffect(() => {
    if (!enabled || suspended) {
      clearIdleTimer();
      bufferRef.current.reset();
      setCaptureValue("");
      if (suspended) {
        inputRef.current?.blur();
      }
      return;
    }

    if (Platform.OS !== "web") {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [enabled, suspended, clearIdleTimer]);

  useEffect(() => {
    return () => {
      clearIdleTimer();
    };
  }, [clearIdleTimer]);

  const handleChangeText = useCallback(
    (text: string) => {
      if (!enabled || suspended) {
        setCaptureValue("");
        return;
      }

      clearIdleTimer();
      const step = bufferRef.current.ingestTextChange(text);
      if (step.committedBarcode) {
        commitScan(step.committedBarcode);
        return;
      }

      setCaptureValue(step.pendingBuffer);

      if (step.pendingBuffer.length >= Math.max(4, minLength)) {
        idleTimerRef.current = setTimeout(() => {
          const committed = bufferRef.current.commit();
          if (committed.committedBarcode) {
            commitScan(committed.committedBarcode);
          } else {
            setCaptureValue("");
          }
        }, idleCommitMs);
      }
    },
    [enabled, suspended, clearIdleTimer, commitScan, idleCommitMs, minLength],
  );

  const handleSubmitEditing = useCallback(() => {
    if (!enabled || suspended) return;
    const committed = bufferRef.current.commit();
    if (committed.committedBarcode) {
      commitScan(committed.committedBarcode);
    } else {
      setCaptureValue("");
    }
  }, [enabled, suspended, commitScan]);

  return {
    inputRef,
    isArmed: enabled && !suspended && isFocused,
    lastScan,
    lastScanAt,
    rearm,
    inputProps: {
      value: captureValue,
      onChangeText: handleChangeText,
      onSubmitEditing: handleSubmitEditing,
      onFocus: () => setIsFocused(true),
      onBlur: () => setIsFocused(false),
      showSoftInputOnFocus: false,
      autoCorrect: false,
      autoCapitalize: "none",
      spellCheck: false,
      blurOnSubmit: false,
      returnKeyType: "done",
      caretHidden: true,
      contextMenuHidden: true,
      accessible: false,
    },
  };
}
