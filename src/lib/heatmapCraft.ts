/** Chart heatmap craft controls + colormap pack (live/rolling visual — not HD archive). */

export type HeatmapBinMode = 'hd' | 'sd';
export type HeatmapStyle = 'classic' | 'splat';
export type HeatmapColormapId =
  | 'classic'
  | 'thermal'
  | 'viridis'
  | 'ocean'
  | 'magma'
  | 'neon';

export interface HeatmapCraftPrefs {
  /** Floor — hide soft liquidity below this (0..1). */
  lowIntensity: number;
  /** Peak — how hard walls saturate (0..1). Higher = only top liquidity glows. */
  peakIntensity: number;
  /** HD = finer price bins; SD = coarser aggregated bins (render-side). */
  binMode: HeatmapBinMode;
  /** When true, trail stretches / updates at the live right edge. */
  extendLive: boolean;
  style: HeatmapStyle;
  colormap: HeatmapColormapId;
}

export const HEATMAP_CRAFT_KEY = 'flow-terminal-heatmap-craft-v1';
export const HEATMAP_CRAFT_EVENT = 'flow-terminal-heatmap-craft';

export const DEFAULT_HEATMAP_CRAFT: HeatmapCraftPrefs = {
  lowIntensity: 0.02,
  peakIntensity: 0.55,
  binMode: 'hd',
  extendLive: true,
  style: 'classic',
  colormap: 'classic',
};

export const HEATMAP_COLORMAPS: {
  id: HeatmapColormapId;
  label: string;
  hint: string;
}[] = [
  { id: 'classic', label: 'Classic', hint: 'Bid green / ask red' },
  { id: 'thermal', label: 'Thermal', hint: 'Purple → orange → yellow' },
  { id: 'viridis', label: 'Viridis', hint: 'Blue → teal → yellow' },
  { id: 'ocean', label: 'Ocean', hint: 'Deep blue → cyan' },
  { id: 'magma', label: 'Magma', hint: 'Black → pink → cream' },
  { id: 'neon', label: 'Neon', hint: 'Electric magenta / cyan' },
];

type Rgb = readonly [number, number, number];

/** Intensity ramps (t 0..1 → RGB). Classic uses fixed bid/ask instead. */
const RAMPS: Record<Exclude<HeatmapColormapId, 'classic'>, Rgb[]> = {
  thermal: [
    [20, 8, 40],
    [90, 20, 120],
    [200, 60, 40],
    [255, 160, 40],
    [255, 240, 140],
  ],
  viridis: [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ],
  ocean: [
    [8, 18, 48],
    [20, 60, 120],
    [20, 130, 180],
    [40, 200, 220],
    [180, 250, 255],
  ],
  magma: [
    [8, 4, 16],
    [80, 18, 70],
    [180, 40, 90],
    [250, 120, 80],
    [252, 240, 200],
  ],
  neon: [
    [10, 0, 30],
    [180, 0, 200],
    [255, 40, 160],
    [40, 255, 220],
    [220, 255, 255],
  ],
};

const CLASSIC_BID: Rgb = [14, 203, 129];
const CLASSIC_ASK: Rgb = [246, 70, 93];

function isBinMode(v: unknown): v is HeatmapBinMode {
  return v === 'hd' || v === 'sd';
}

function isStyle(v: unknown): v is HeatmapStyle {
  return v === 'classic' || v === 'splat';
}

function isColormap(v: unknown): v is HeatmapColormapId {
  return (
    v === 'classic' ||
    v === 'thermal' ||
    v === 'viridis' ||
    v === 'ocean' ||
    v === 'magma' ||
    v === 'neon'
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sampleRamp(stops: Rgb[], t: number): Rgb {
  const u = clamp01(t);
  if (stops.length === 1) return stops[0];
  const x = u * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export function loadHeatmapCraft(): HeatmapCraftPrefs {
  try {
    const raw = localStorage.getItem(HEATMAP_CRAFT_KEY);
    if (!raw) return { ...DEFAULT_HEATMAP_CRAFT };
    const parsed = JSON.parse(raw) as Partial<HeatmapCraftPrefs>;
    return {
      lowIntensity: clamp01(
        typeof parsed.lowIntensity === 'number'
          ? parsed.lowIntensity
          : DEFAULT_HEATMAP_CRAFT.lowIntensity,
      ),
      peakIntensity: clamp01(
        typeof parsed.peakIntensity === 'number'
          ? parsed.peakIntensity
          : DEFAULT_HEATMAP_CRAFT.peakIntensity,
      ),
      binMode: isBinMode(parsed.binMode) ? parsed.binMode : DEFAULT_HEATMAP_CRAFT.binMode,
      extendLive:
        typeof parsed.extendLive === 'boolean'
          ? parsed.extendLive
          : DEFAULT_HEATMAP_CRAFT.extendLive,
      style: isStyle(parsed.style) ? parsed.style : DEFAULT_HEATMAP_CRAFT.style,
      colormap: isColormap(parsed.colormap)
        ? parsed.colormap
        : DEFAULT_HEATMAP_CRAFT.colormap,
    };
  } catch {
    return { ...DEFAULT_HEATMAP_CRAFT };
  }
}

export function persistHeatmapCraft(prefs: HeatmapCraftPrefs) {
  try {
    localStorage.setItem(HEATMAP_CRAFT_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(HEATMAP_CRAFT_EVENT, { detail: prefs }),
    );
  } catch {
    /* ignore */
  }
}

export function patchHeatmapCraft(
  partial: Partial<HeatmapCraftPrefs>,
): HeatmapCraftPrefs {
  const base = loadHeatmapCraft();
  const merged: HeatmapCraftPrefs = {
    lowIntensity: clamp01(
      partial.lowIntensity !== undefined ? partial.lowIntensity : base.lowIntensity,
    ),
    peakIntensity: clamp01(
      partial.peakIntensity !== undefined
        ? partial.peakIntensity
        : base.peakIntensity,
    ),
    binMode: isBinMode(partial.binMode) ? partial.binMode : base.binMode,
    extendLive:
      typeof partial.extendLive === 'boolean' ? partial.extendLive : base.extendLive,
    style: isStyle(partial.style) ? partial.style : base.style,
    colormap: isColormap(partial.colormap) ? partial.colormap : base.colormap,
  };
  persistHeatmapCraft(merged);
  return merged;
}

/** Map peak slider → sample percentile used as soft peak (p70..p99). */
export function peakPercentile(peakIntensity: number): number {
  return 0.7 + clamp01(peakIntensity) * 0.29;
}

/** Aggregate price levels for SD (coarser) vs HD (native). */
export function rebinHeatLevels(
  prices: number[],
  bids: number[],
  asks: number[],
  mode: HeatmapBinMode,
): { prices: number[]; bids: number[]; asks: number[] } {
  const n = prices.length;
  if (n < 2) return { prices, bids, asks };
  const stride = mode === 'sd' ? 3 : 1;
  if (stride === 1) return { prices, bids, asks };

  const outP: number[] = [];
  const outB: number[] = [];
  const outA: number[] = [];
  for (let i = 0; i < n; i += stride) {
    const end = Math.min(n, i + stride);
    let b = 0;
    let a = 0;
    let pSum = 0;
    let c = 0;
    for (let j = i; j < end; j++) {
      b = Math.max(b, bids[j] ?? 0);
      a = Math.max(a, asks[j] ?? 0);
      pSum += prices[j];
      c++;
    }
    outP.push(pSum / Math.max(1, c));
    outB.push(b);
    outA.push(a);
  }
  return { prices: outP, bids: outB, asks: outA };
}

export function heatmapCellColor(
  colormap: HeatmapColormapId,
  side: 'bid' | 'ask',
  intensity: number,
  alpha: number,
): string {
  const t = clamp01(intensity);
  const a = clamp01(alpha);
  if (colormap === 'classic') {
    const [r, g, b] = side === 'bid' ? CLASSIC_BID : CLASSIC_ASK;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const rgb = sampleRamp(RAMPS[colormap], t);
  // Slight side bias so bid/ask walls stay distinguishable on intensity ramps.
  if (side === 'bid') {
    return `rgba(${Math.max(0, rgb[0] - 12)}, ${Math.min(255, rgb[1] + 18)}, ${Math.max(0, rgb[2] - 8)}, ${a})`;
  }
  return `rgba(${Math.min(255, rgb[0] + 22)}, ${Math.max(0, rgb[1] - 10)}, ${Math.max(0, rgb[2] - 6)}, ${a})`;
}

/** Soft kernel weights for splat style (center + neighbors). */
export function splatBlend(
  center: number,
  prev: number,
  next: number,
  prev2: number,
  next2: number,
): number {
  return (
    center * 0.34 +
    prev * 0.22 +
    next * 0.22 +
    prev2 * 0.11 +
    next2 * 0.11
  );
}
