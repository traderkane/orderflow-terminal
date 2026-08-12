import type {
  Candle,
  FootprintBar,
  FootprintLevel,
  SymbolId,
  Trade,
} from '../types/market';

export const MAX_FOOTPRINT_BARS = 180;
export const MAX_FOOTPRINT_LEVELS = 56;

export interface FootprintLevelMut {
  buy: number;
  sell: number;
}

export interface FootprintBarMut {
  time: number;
  levels: Map<number, FootprintLevelMut>;
}

export function footprintStep(symbol: SymbolId): number {
  return symbol === 'BTC/USD' ? 25 : 1;
}

/** Accumulate aggressor buy/sell volume into a candle-aligned footprint bar. */
export function bumpFootprint(
  bars: FootprintBarMut[],
  candleSec: number,
  step: number,
  timeSec: number,
  price: number,
  buy: number,
  sell: number,
): void {
  if (buy <= 0 && sell <= 0) return;
  const barTime = Math.floor(timeSec / candleSec) * candleSec;
  const key = Math.round(price / step) * step;

  let bar = bars.length ? bars[bars.length - 1] : null;
  if (!bar || bar.time < barTime) {
    bar = { time: barTime, levels: new Map() };
    bars.push(bar);
    while (bars.length > MAX_FOOTPRINT_BARS) bars.shift();
  } else if (bar.time > barTime) {
    const existing = bars.find((b) => b.time === barTime);
    if (!existing) return;
    bar = existing;
  }

  const prev = bar.levels.get(key) ?? { buy: 0, sell: 0 };
  prev.buy += buy;
  prev.sell += sell;
  bar.levels.set(key, prev);

  if (bar.levels.size > MAX_FOOTPRINT_LEVELS * 2) {
    pruneLevels(bar, key, MAX_FOOTPRINT_LEVELS);
  }
}

function pruneLevels(bar: FootprintBarMut, anchor: number, keep: number): void {
  if (bar.levels.size <= keep) return;
  const ranked = [...bar.levels.keys()].sort(
    (a, b) => Math.abs(a - anchor) - Math.abs(b - anchor),
  );
  const keepSet = new Set(ranked.slice(0, keep));
  for (const price of bar.levels.keys()) {
    if (!keepSet.has(price)) bar.levels.delete(price);
  }
}

export function serializeFootprint(
  bars: FootprintBarMut[],
  anchorPrice?: number,
): FootprintBar[] {
  return bars.map((bar) => {
    let entries = [...bar.levels.entries()];
    if (entries.length > MAX_FOOTPRINT_LEVELS && anchorPrice != null) {
      entries.sort(
        (a, b) => Math.abs(a[0] - anchorPrice) - Math.abs(b[0] - anchorPrice),
      );
      entries = entries.slice(0, MAX_FOOTPRINT_LEVELS);
    }
    entries.sort((a, b) => b[0] - a[0]);

    const levels: FootprintLevel[] = entries.map(([price, v]) => ({
      price,
      buyVolume: v.buy,
      sellVolume: v.sell,
      delta: v.buy - v.sell,
    }));

    let buyVolume = 0;
    let sellVolume = 0;
    for (const l of levels) {
      buyVolume += l.buyVolume;
      sellVolume += l.sellVolume;
    }
    return {
      time: bar.time,
      levels,
      buyVolume,
      sellVolume,
      delta: buyVolume - sellVolume,
    };
  });
}

function emptyMut(time: number): FootprintBarMut {
  return { time, levels: new Map() };
}

function mergeLevel(
  bar: FootprintBarMut,
  price: number,
  buy: number,
  sell: number,
): void {
  if (buy <= 0 && sell <= 0) return;
  const prev = bar.levels.get(price) ?? { buy: 0, sell: 0 };
  prev.buy += buy;
  prev.sell += sell;
  bar.levels.set(price, prev);
}

function tradeTimeSec(t: number): number {
  return t > 1e12 ? t / 1000 : t;
}

/**
 * Align 1m footprint (+ recent trades) onto chart candle times.
 * Higher TFs aggregate 1m clusters; sparse history gets a coarse OHLC seed
 * so footprint mode still paints something readable.
 */
export function footprintBarsForChart(
  candles: Candle[],
  footprint1m: FootprintBar[],
  trades: Trade[],
  intervalSec: number,
  step: number,
): FootprintBar[] {
  if (!candles.length) return [];

  const byTime = new Map<number, FootprintBarMut>();
  for (const c of candles) byTime.set(c.time, emptyMut(c.time));

  const bucket = (sec: number) => Math.floor(sec / intervalSec) * intervalSec;

  for (const src of footprint1m) {
    const t = bucket(src.time);
    let bar = byTime.get(t);
    if (!bar) {
      // Outside candle window — keep only if near edges
      continue;
    }
    for (const l of src.levels) {
      const key = Math.round(l.price / step) * step;
      mergeLevel(bar, key, l.buyVolume, l.sellVolume);
    }
  }

  for (const tr of trades) {
    const t = bucket(tradeTimeSec(tr.time));
    const bar = byTime.get(t);
    if (!bar) continue;
    const key = Math.round(tr.price / step) * step;
    if (tr.side === 'buy') mergeLevel(bar, key, tr.size, 0);
    else mergeLevel(bar, key, 0, tr.size);
  }

  // Coarse seed for empty candles so higher TFs / cold start aren't blank.
  for (const c of candles) {
    const bar = byTime.get(c.time);
    if (!bar || bar.levels.size > 0) continue;
    if (!(c.volume > 0)) continue;
    const buy = c.close >= c.open ? c.volume * 0.55 : c.volume * 0.45;
    const sell = c.volume - buy;
    const mid = Math.round(((c.high + c.low + c.close) / 3) / step) * step;
    const hi = Math.round(c.high / step) * step;
    const lo = Math.round(c.low / step) * step;
    mergeLevel(bar, mid, buy * 0.55, sell * 0.55);
    mergeLevel(bar, hi, buy * 0.22, sell * 0.22);
    mergeLevel(bar, lo, buy * 0.23, sell * 0.23);
  }

  const out: FootprintBar[] = [];
  for (const c of candles) {
    const bar = byTime.get(c.time);
    if (!bar || !bar.levels.size) continue;
    // Trim to levels inside candle range (+1 step pad) for readability.
    const pad = step * 1.5;
    let entries = [...bar.levels.entries()].filter(
      ([p]) => p >= c.low - pad && p <= c.high + pad,
    );
    if (!entries.length) entries = [...bar.levels.entries()];
    if (entries.length > MAX_FOOTPRINT_LEVELS) {
      const mid = (c.high + c.low) / 2;
      entries.sort((a, b) => Math.abs(a[0] - mid) - Math.abs(b[0] - mid));
      entries = entries.slice(0, MAX_FOOTPRINT_LEVELS);
    }
    entries.sort((a, b) => b[0] - a[0]);
    const levels: FootprintLevel[] = entries.map(([price, v]) => ({
      price,
      buyVolume: v.buy,
      sellVolume: v.sell,
      delta: v.buy - v.sell,
    }));
    let buyVolume = 0;
    let sellVolume = 0;
    for (const l of levels) {
      buyVolume += l.buyVolume;
      sellVolume += l.sellVolume;
    }
    out.push({
      time: c.time,
      levels,
      buyVolume,
      sellVolume,
      delta: buyVolume - sellVolume,
    });
  }
  return out;
}

export const FOOTPRINT_IMBALANCE_RATIO = 3;

export function footprintCellImbalance(
  buy: number,
  sell: number,
  maxSide: number,
): 'buy' | 'sell' | null {
  if (buy > 0 && sell > 0) {
    if (buy / sell >= FOOTPRINT_IMBALANCE_RATIO) return 'buy';
    if (sell / buy >= FOOTPRINT_IMBALANCE_RATIO) return 'sell';
  } else if (buy > 0 && sell === 0 && buy > maxSide * 0.12) {
    return 'buy';
  } else if (sell > 0 && buy === 0 && sell > maxSide * 0.12) {
    return 'sell';
  }
  return null;
}

export function formatFootprintVol(v: number): string {
  if (!(v > 0)) return '';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
