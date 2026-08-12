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

  // Track which candle buckets already have real aggressor prints.
  const hasRealPrint = new Set<number>();
  let realMin = Infinity;
  let realMax = -Infinity;

  for (const src of footprint1m) {
    const t = bucket(src.time);
    let bar = byTime.get(t);
    if (!bar) {
      // Outside candle window — keep only if near edges
      continue;
    }
    let added = false;
    for (const l of src.levels) {
      const key = Math.round(l.price / step) * step;
      if (l.buyVolume > 0 || l.sellVolume > 0) {
        mergeLevel(bar, key, l.buyVolume, l.sellVolume);
        added = true;
      }
    }
    if (added) {
      hasRealPrint.add(t);
      realMin = Math.min(realMin, t);
      realMax = Math.max(realMax, t);
    }
  }

  // Trades top up only empty buckets — footprint already accumulates live
  // aggressors, so merging every trade again would double-count density.
  for (const tr of trades) {
    const t = bucket(tradeTimeSec(tr.time));
    const bar = byTime.get(t);
    if (!bar) continue;
    realMin = Math.min(realMin, t);
    realMax = Math.max(realMax, t);
    if (hasRealPrint.has(t) || bar.levels.size > 0) continue;
    const key = Math.round(tr.price / step) * step;
    if (tr.side === 'buy') mergeLevel(bar, key, tr.size, 0);
    else mergeLevel(bar, key, 0, tr.size);
    if (bar.levels.size > 0) hasRealPrint.add(t);
  }

  const hasLiveCoverage = Number.isFinite(realMin) && Number.isFinite(realMax);

  // Coarse OHLC seed only for cold-start / history outside live coverage.
  // When tape/footprint already cover a window, leave empty bars empty so
  // 1m fidelity isn't washed out by synthetic mid/hi/lo blobs.
  for (const c of candles) {
    const bar = byTime.get(c.time);
    if (!bar || bar.levels.size > 0) continue;
    if (!(c.volume > 0)) continue;
    if (
      hasLiveCoverage &&
      c.time >= realMin - intervalSec &&
      c.time <= realMax + intervalSec
    ) {
      continue;
    }
    const buy = c.close >= c.open ? c.volume * 0.55 : c.volume * 0.45;
    const sell = c.volume - buy;
    const mid = Math.round(((c.high + c.low + c.close) / 3) / step) * step;
    const hi = Math.round(c.high / step) * step;
    const lo = Math.round(c.low / step) * step;
    // Lighter seed — just enough silhouette for empty history
    mergeLevel(bar, mid, buy * 0.4, sell * 0.4);
    if (hi !== mid) mergeLevel(bar, hi, buy * 0.15, sell * 0.15);
    if (lo !== mid) mergeLevel(bar, lo, buy * 0.15, sell * 0.15);
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

/** Minimum consecutive bars for a diagonal / stacked imbalance highlight. */
export const FOOTPRINT_STACK_MIN = 3;

export type FootprintImbSide = 'buy' | 'sell';

export interface StackedImbalanceCell {
  time: number;
  price: number;
  side: FootprintImbSide;
}

/** Same-side imbalance chain across adjacent bars (flat or ±1 step). */
export interface StackedImbalanceChain {
  side: FootprintImbSide;
  cells: StackedImbalanceCell[];
}

function inferFootprintStep(bars: FootprintBar[], fallback = 1): number {
  const prices: number[] = [];
  const seen = new Set<number>();
  for (const b of bars) {
    for (const l of b.levels) {
      if (!seen.has(l.price)) {
        seen.add(l.price);
        prices.push(l.price);
      }
    }
  }
  prices.sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < prices.length; i++) {
    const g = prices[i] - prices[i - 1];
    if (g > 0) minGap = Math.min(minGap, g);
  }
  return Number.isFinite(minGap) ? minGap : fallback;
}

function stackPriceCompatible(prev: number, next: number, step: number): boolean {
  const d = Math.abs(next - prev);
  // Same level or one tick/step away (classic diagonal stack).
  return d <= step * 1.01;
}

function stackLinkScore(
  side: FootprintImbSide,
  prevPrice: number,
  nextPrice: number,
  step: number,
): number {
  const dp = nextPrice - prevPrice;
  const adp = Math.abs(dp);
  if (adp <= step * 0.01) return 3; // flat
  if (side === 'buy' && dp > 0) return 4; // buy diagonal up
  if (side === 'sell' && dp < 0) return 4; // sell diagonal down
  return 2; // counter-step still counts as adjacent
}

/**
 * Detect MMT-style stacked / diagonal imbalances: same-side ≥3:1 cells
 * chaining across consecutive footprint bars at the same or ±1 step price.
 */
export function detectStackedImbalances(
  bars: FootprintBar[],
  opts?: { maxSide?: number; step?: number; minStack?: number; maxBarGapSec?: number },
): StackedImbalanceChain[] {
  if (bars.length < 2) return [];
  const minStack = opts?.minStack ?? FOOTPRINT_STACK_MIN;
  let maxSide = opts?.maxSide ?? 0;
  if (!(maxSide > 0)) {
    maxSide = 1;
    for (const b of bars) {
      for (const l of b.levels) {
        maxSide = Math.max(maxSide, l.buyVolume, l.sellVolume);
      }
    }
  }
  const step = opts?.step && opts.step > 0 ? opts.step : inferFootprintStep(bars);

  type Node = {
    barIdx: number;
    side: FootprintImbSide;
    price: number;
    time: number;
  };

  const nodes: Node[] = [];
  const byBarSide = new Map<string, Node[]>();

  for (let bi = 0; bi < bars.length; bi++) {
    const bar = bars[bi];
    for (const l of bar.levels) {
      const side = footprintCellImbalance(l.buyVolume, l.sellVolume, maxSide);
      if (!side) continue;
      const n: Node = { barIdx: bi, side, price: l.price, time: bar.time };
      nodes.push(n);
      const key = `${bi}:${side}`;
      const arr = byBarSide.get(key);
      if (arr) arr.push(n);
      else byBarSide.set(key, [n]);
    }
  }

  const pred = new Map<Node, Node>();
  const len = new Map<Node, number>();

  for (const n of nodes) {
    len.set(n, 1);
    if (n.barIdx <= 0) continue;
    const prevBar = bars[n.barIdx - 1];
    const curBar = bars[n.barIdx];
    if (!prevBar || prevBar.time >= curBar.time) continue;
    const gapSec = curBar.time - prevBar.time;
    if (opts?.maxBarGapSec != null && gapSec > opts.maxBarGapSec + 0.5) continue;

    const prevCandidates = byBarSide.get(`${n.barIdx - 1}:${n.side}`) ?? [];
    let best: Node | null = null;
    let bestScore = -1;
    for (const p of prevCandidates) {
      if (!stackPriceCompatible(p.price, n.price, step)) continue;
      const link = stackLinkScore(n.side, p.price, n.price, step);
      const composite = (len.get(p) ?? 1) * 10 + link;
      if (composite > bestScore) {
        bestScore = composite;
        best = p;
      }
    }
    if (best) {
      pred.set(n, best);
      len.set(n, (len.get(best) ?? 1) + 1);
    }
  }

  const hasExtendingSuccessor = new Set<Node>();
  for (const [n, p] of pred) {
    const nLen = len.get(n) ?? 1;
    const pLen = len.get(p) ?? 1;
    if (nLen === pLen + 1) hasExtendingSuccessor.add(p);
  }

  const chains: StackedImbalanceChain[] = [];
  const covered = new Set<string>();

  const endpoints = nodes
    .filter((n) => (len.get(n) ?? 1) >= minStack && !hasExtendingSuccessor.has(n))
    .sort((a, b) => (len.get(b)! - len.get(a)!) || b.barIdx - a.barIdx);

  for (const end of endpoints) {
    const cells: StackedImbalanceCell[] = [];
    let cur: Node | undefined = end;
    while (cur) {
      cells.push({ time: cur.time, price: cur.price, side: cur.side });
      cur = pred.get(cur);
    }
    cells.reverse();
    if (cells.length < minStack) continue;
    const sig = `${end.side}:${cells.map((c) => `${c.time}@${c.price}`).join('>')}`;
    if (covered.has(sig)) continue;
    covered.add(sig);
    chains.push({ side: end.side, cells });
  }

  return chains;
}

/** Lookup key for a footprint cell in a stacked chain. */
export function stackedImbalanceKey(time: number, price: number): string {
  return `${time}|${price}`;
}

export interface NakedPocMark {
  /** Origin bar time (seconds). */
  time: number;
  /** POC price level (max buy+sell volume on that bar). */
  price: number;
  /** Total volume at the POC level. */
  volume: number;
}

/** Price level with max total volume (buy+sell) on a footprint bar. */
export function footprintBarPoc(
  bar: FootprintBar,
): { price: number; volume: number } | null {
  let bestPrice = 0;
  let bestVol = -1;
  for (const l of bar.levels) {
    const vol = l.buyVolume + l.sellVolume;
    if (vol > bestVol) {
      bestVol = vol;
      bestPrice = l.price;
    }
  }
  if (!(bestVol > 0)) return null;
  return { price: bestPrice, volume: bestVol };
}

/**
 * MMT-style naked (unfinished auction) POCs: per-bar POC prices that
 * subsequent candle ranges have not traded through. Marks clear when
 * any later bar's [low, high] covers the level (simple mitigation).
 */
export function detectNakedPocs(
  bars: FootprintBar[],
  candles: { time: number; high: number; low: number }[],
  opts?: { step?: number },
): NakedPocMark[] {
  if (!bars.length) return [];
  const ordered = [...bars].sort((a, b) => a.time - b.time);
  const laterCandles = [...candles].sort((a, b) => a.time - b.time);
  const step = opts?.step && opts.step > 0 ? opts.step : 0;
  const eps = step > 0 ? step * 0.01 : 1e-9;

  const naked: NakedPocMark[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const bar = ordered[i];
    const poc = footprintBarPoc(bar);
    if (!poc) continue;

    let mitigated = false;
    for (const c of laterCandles) {
      if (c.time <= bar.time) continue;
      if (poc.price >= c.low - eps && poc.price <= c.high + eps) {
        mitigated = true;
        break;
      }
    }
    // Fallback when candle history is sparse: use later footprint level spans
    if (!mitigated && !laterCandles.some((c) => c.time > bar.time)) {
      for (let j = i + 1; j < ordered.length; j++) {
        const later = ordered[j];
        if (!later.levels.length) continue;
        let lo = Infinity;
        let hi = -Infinity;
        for (const l of later.levels) {
          lo = Math.min(lo, l.price);
          hi = Math.max(hi, l.price);
        }
        if (poc.price >= lo - eps && poc.price <= hi + eps) {
          mitigated = true;
          break;
        }
      }
    }

    if (!mitigated) {
      naked.push({ time: bar.time, price: poc.price, volume: poc.volume });
    }
  }
  return naked;
}

export function formatFootprintVol(v: number): string {
  if (!(v > 0)) return '';
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
