import type { Candle, CvdPoint } from '../types/market';

export type BarStatsMetric = 'volume' | 'delta';

export const BAR_STATS_KEY = 'flow-terminal-bar-stats-v1';
export const BAR_STATS_METRIC_KEY = 'flow-terminal-bar-stats-metric-v1';

const LOOKBACK = 20;

export function isBarStatsMetric(v: unknown): v is BarStatsMetric {
  return v === 'volume' || v === 'delta';
}

export function loadShowBarStats(): boolean {
  try {
    return localStorage.getItem(BAR_STATS_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistShowBarStats(on: boolean) {
  try {
    localStorage.setItem(BAR_STATS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadBarStatsMetric(): BarStatsMetric {
  try {
    const raw = localStorage.getItem(BAR_STATS_METRIC_KEY);
    if (isBarStatsMetric(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'volume';
}

export function persistBarStatsMetric(metric: BarStatsMetric) {
  try {
    localStorage.setItem(BAR_STATS_METRIC_KEY, metric);
  } catch {
    /* ignore */
  }
}

export type BarStatColors = {
  color: string;
  borderColor: string;
  wickColor: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

/** Map ratio vs recent average → subtle body/wick alpha (MMT bar-stats lite). */
function intensityAlpha(ratio: number): number {
  // 0.35× avg → ~0.22, 1× → ~0.55, 2×+ → ~0.95
  return clamp(0.18 + ratio * 0.38, 0.2, 0.95);
}

function colorsFor(up: boolean, alpha: number): BarStatColors {
  const body = up ? rgba(14, 203, 129, alpha) : rgba(246, 70, 93, alpha);
  const wick = up
    ? rgba(14, 203, 129, clamp(alpha + 0.08, 0.25, 1))
    : rgba(246, 70, 93, clamp(alpha + 0.08, 0.25, 1));
  return { color: body, borderColor: body, wickColor: wick };
}

/**
 * Grade each candle by volume or |delta| vs a trailing average.
 * Direction stays green/red; intensity encodes the metric.
 */
export function computeBarStatColors(
  candles: Candle[],
  cvd: CvdPoint[],
  metric: BarStatsMetric,
): BarStatColors[] {
  const deltaByTime = new Map<number, number>();
  for (const p of cvd) deltaByTime.set(p.time, p.delta);

  const values: number[] = candles.map((c) => {
    if (metric === 'volume') return Math.max(0, c.volume);
    const d = deltaByTime.get(c.time);
    if (d != null) return Math.abs(d);
    // Candle tick-approx delta when CVD bucket missing
    return c.volume * 0.55;
  });

  return candles.map((c, i) => {
    const up = c.close >= c.open;
    let sum = 0;
    let n = 0;
    const from = Math.max(0, i - LOOKBACK);
    for (let j = from; j < i; j++) {
      sum += values[j];
      n += 1;
    }
    const avg = n > 0 ? sum / n : values[i] || 1;
    const ratio = avg > 0 ? values[i] / avg : 1;

    if (metric === 'delta') {
      const raw = deltaByTime.get(c.time);
      const bull =
        raw != null ? raw >= 0 : c.close >= c.open;
      return colorsFor(bull, intensityAlpha(ratio));
    }
    return colorsFor(up, intensityAlpha(ratio));
  });
}
