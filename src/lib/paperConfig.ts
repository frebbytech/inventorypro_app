// lib/paperConfig.ts
import { PaperConfig, PaperSizeValue } from "../types/receipt";

export const PAPER_CONFIG: Record<PaperSizeValue, PaperConfig> = {
  a4: {
    label: "A4 (210 × 297 mm)",
    widthMm: 210,
    heightMm: 297,
    layout: "sheet",
    micronsWidth: 210000,
    micronsHeight: 297000,
  },
  a5: {
    label: "A5 (148 × 210 mm)",
    widthMm: 148,
    heightMm: 210,
    layout: "sheet",
    micronsWidth: 148000,
    micronsHeight: 210000,
  },
  a6: {
    label: "A6 (105 × 148 mm)",
    widthMm: 105,
    heightMm: 148,
    layout: "sheet_compact",
    micronsWidth: 105000,
    micronsHeight: 148000,
  },
  thermal_80mm: {
    label: "Thermal 80mm (80 × 200 mm)",
    widthMm: 80,
    heightMm: 200,
    layout: "thermal",
    micronsWidth: 80000,
    micronsHeight: 200000,
  },
  thermal_58mm: {
    label: "Thermal 58mm (58 × 200 mm)",
    widthMm: 58,
    heightMm: 200,
    layout: "thermal",
    micronsWidth: 58000,
    micronsHeight: 200000,
  },
};

export function getPaperConfig(paperSize: PaperSizeValue): PaperConfig {
  const config = PAPER_CONFIG[paperSize];
  if (!config) throw new Error(`Unknown paper size: ${paperSize}`);
  return config;
}

// Derived, for your <Select> options — single source of truth
export const PAPER_SIZES: { value: PaperSizeValue; label: string }[] =
  (Object.keys(PAPER_CONFIG) as PaperSizeValue[]).map((value) => ({
    value,
    label: PAPER_CONFIG[value].label,
  }));