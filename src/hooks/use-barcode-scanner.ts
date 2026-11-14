"use client";

import { useEffect, useRef } from "react";

interface UseBarcodeScannerProps {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minChars?: number;
  maxIntervalMs?: number;
}

/**
 * Hook to capture USB / Bluetooth hardware barcode scanner keystroke streams.
 * Hardware scanners send character keypresses rapidly (typically < 30ms apart)
 * followed by an Enter or Tab key.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minChars = 3,
  maxIntervalMs = 50,
}: UseBarcodeScannerProps) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // Reset buffer if time between keypresses is too long (unless buffer is empty)
      if (timeDiff > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }

      if (e.key === "Enter" || e.key === "Tab") {
        if (bufferRef.current.length >= minChars) {
          const scannedCode = bufferRef.current.trim();
          bufferRef.current = "";
          if (scannedCode) {
            // Prevent default form submission if inside form
            if (isInput) {
              e.preventDefault();
            }
            onScan(scannedCode);
          }
        } else {
          bufferRef.current = "";
        }
        return;
      }

      // Collect printable ASCII characters
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onScan, enabled, minChars, maxIntervalMs]);
}

/**
 * Helper to play a short success beep sound using Web Audio API.
 */
export function playScanBeepSound() {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    // Ignore audio context errors if blocked by browser policy
  }
}
