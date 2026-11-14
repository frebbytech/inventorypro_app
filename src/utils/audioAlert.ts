"use client";

export type SoundTone = "chime" | "bell" | "marimba" | "ping";

export interface StockAlertAudioOptions {
  volume?: number; // 0.0 to 1.0 (default: 0.5)
  tone?: SoundTone; // default: "chime"
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (err) {
    console.warn("AudioContext initialization failed:", err);
    return null;
  }
}

/**
 * Play a subtle sound alert for low stock notifications
 */
export function playStockAlertSound(options?: StockAlertAudioOptions): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const tone = options?.tone || "chime";
  const rawVolume = typeof options?.volume === "number" ? options.volume : 0.95;
  // Subtle volume scaling (max master gain ~0.35 to keep it gentle and subtle)
  const masterVolume = Math.max(0.01, Math.min(1, rawVolume)) * 0.35;

  const now = ctx.currentTime;

  try {
    if (tone === "chime") {
      // ── Preset 1: Subtle Double Chime (D5 -> A5) ──
      // Note 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);

      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(masterVolume * 0.7, now + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: A5 (880.00 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880.0, now + 0.12);

      gain2.gain.setValueAtTime(0.001, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(masterVolume, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.6);
    } else if (tone === "bell") {
      // ── Preset 2: Soft Harmonic Bell (C5 with harmonic shimmer) ──
      const fundamentalFreq = 523.25; // C5
      const harmonics = [1, 2.01, 3.02];
      const harmonicGains = [masterVolume, masterVolume * 0.35, masterVolume * 0.15];

      harmonics.forEach((ratio, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(fundamentalFreq * ratio, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(harmonicGains[i], now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.85);
      });
    } else if (tone === "marimba") {
      // ── Preset 3: Gentle Marimba Pluck (E5 -> B5) ──
      const notes = [
        { freq: 659.25, time: now }, // E5
        { freq: 987.77, time: now + 0.09 }, // B5
      ];

      notes.forEach(({ freq, time }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.001, time);
        gain.gain.exponentialRampToValueAtTime(masterVolume * 0.9, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.45);
      });
    } else if (tone === "ping") {
      // ── Preset 4: Crisp Register Ping (E6 high subtle ping) ──
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1318.5, now); // E6

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(masterVolume * 0.8, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (e) {
    console.warn("Failed to play stock alert sound:", e);
  }
}
