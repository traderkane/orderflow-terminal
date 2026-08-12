import type { FootprintBar, FootprintLevel, SymbolId } from '../types/market';

export const MAX_FOOTPRINT_BARS = 24;
export const MAX_FOOTPRINT_LEVELS = 48;

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
