import type { LiquidationMap, LiquidationMapLevel, MarketStats } from '../types/market';

/** Common perpetual leverages + relative OI share (retail-skewed). */
export const LIQ_LEVERAGE_LADDER: ReadonlyArray<{ lev: number; weight: number }> = [
  { lev: 5, weight: 0.12 },
  { lev: 10, weight: 0.22 },
  { lev: 25, weight: 0.28 },
  { lev: 50, weight: 0.23 },
  { lev: 100, weight: 0.15 },
];

const DEFAULT_BINS = 48;
const ENTRY_SAMPLES = 64;

export interface LiquidationMapInput {
  mark: number;
  high24h: number;
  low24h: number;
  openInterest: number;
  volume24h: number;
  bins?: number;
  leverages?: ReadonlyArray<{ lev: number; weight: number }>;
}

/**
 * Build a modelled liquidation-density histogram around mark/last.
 *
 * Not exchange-proprietary: assumes OI is spread across recent entry prices
 * (24h range, peaked near mark) and a leverage ladder. Long liq ≈ entry*(1-1/L),
 * short liq ≈ entry*(1+1/L). Intensity scales with OI and log volume.
 */
export function buildLiquidationMap(input: LiquidationMapInput): LiquidationMap {
  const mark = input.mark;
  const empty: LiquidationMap = { mark, levels: [], maxDensity: 0 };

  if (!(mark > 0) || !Number.isFinite(mark)) return empty;

  const bins = Math.max(16, input.bins ?? DEFAULT_BINS);
  const ladder = input.leverages ?? LIQ_LEVERAGE_LADDER;

  let lo = Math.min(input.low24h || mark, mark);
  let hi = Math.max(input.high24h || mark, mark);
  if (!(hi > lo)) {
    lo = mark * 0.97;
    hi = mark * 1.03;
  }

  // Pad so 5x clusters from range extremes still land on-screen.
  const pad = Math.max((hi - lo) * 0.35, mark * 0.015);
  const viewLo = Math.min(lo - pad, mark * (1 - 1 / 5) * 0.995);
  const viewHi = Math.max(hi + pad, mark * (1 + 1 / 5) * 1.005);
  const span = viewHi - viewLo || mark * 0.02;
  const step = span / bins;

  const longDensity = new Array<number>(bins).fill(0);
  const shortDensity = new Array<number>(bins).fill(0);

  const oi = Math.max(input.openInterest, 0);
  const vol = Math.max(input.volume24h, 0);
  // Soft volume boost so quiet books still render; OI dominates.
  const intensityScale = (oi > 0 ? oi : mark * 1e4) * (1 + Math.log1p(vol) / 20);

  const entryLo = lo;
  const entryHi = hi;
  const entrySpan = Math.max(entryHi - entryLo, mark * 0.002);
  const sigma = entrySpan * 0.35;

  for (let i = 0; i < ENTRY_SAMPLES; i++) {
    const t = (i + 0.5) / ENTRY_SAMPLES;
    const entry = entryLo + t * entrySpan;
    // Gaussian peak near mark — more OI assumed around recent price.
    const dist = (entry - mark) / (sigma || 1);
    const entryWeight = Math.exp(-0.5 * dist * dist);

    for (const { lev, weight } of ladder) {
      if (lev <= 1) continue;
      const notional = intensityScale * entryWeight * weight;

      // Simplified isolated-margin approx (MMR folded into 1/L).
      const longLiq = entry * (1 - 1 / lev);
      const shortLiq = entry * (1 + 1 / lev);

      // Higher leverage → tighter cluster (narrower splat into bins).
      const splat = Math.max(1, Math.round(4 * (5 / lev)));
      accumulate(longDensity, viewLo, step, bins, longLiq, notional, splat);
      accumulate(shortDensity, viewLo, step, bins, shortLiq, notional, splat);
    }
  }

  let maxDensity = 0;
  const levels: LiquidationMapLevel[] = [];
  for (let i = 0; i < bins; i++) {
    const price = viewLo + (i + 0.5) * step;
    const long = longDensity[i];
    const short = shortDensity[i];
    maxDensity = Math.max(maxDensity, long, short);
    levels.push({ price, longDensity: long, shortDensity: short });
  }

  return { mark, levels, maxDensity };
}

/** Convenience: pull inputs from live/mock MarketStats. */
export function buildLiquidationMapFromStats(
  stats: Pick<
    MarketStats,
    'last' | 'mid' | 'high24h' | 'low24h' | 'openInterest' | 'volume24h'
  >,
  bins?: number,
): LiquidationMap {
  const mark = stats.last || stats.mid;
  return buildLiquidationMap({
    mark,
    high24h: stats.high24h,
    low24h: stats.low24h,
    openInterest: stats.openInterest,
    volume24h: stats.volume24h,
    bins,
  });
}

function accumulate(
  bins: number[],
  viewLo: number,
  step: number,
  n: number,
  price: number,
  amount: number,
  splat: number,
): void {
  const center = (price - viewLo) / step;
  const i0 = Math.floor(center);
  for (let d = -splat; d <= splat; d++) {
    const i = i0 + d;
    if (i < 0 || i >= n) continue;
    const falloff = 1 - Math.abs(d) / (splat + 1);
    bins[i] += amount * falloff;
  }
}
