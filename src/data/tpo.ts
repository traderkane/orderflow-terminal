import type { Candle, SymbolId, TpoLevel, TpoProfile } from '../types/market';

/** Letters for successive TPO periods (A–Z then a–z). */
export const TPO_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export type { TpoLevel, TpoProfile };

export interface TpoPeriod {
  letter: string;
  startTime: number;
  endTime: number;
}

export function tpoTick(symbol: SymbolId): number {
  return symbol === 'BTC/USD' ? 25 : 1;
}

/**
 * Choose a TPO bracket length from the candle span.
 * Targets ~12–24 letters so the profile stays readable on ~2–4h of 1m data.
 */
export function choosePeriodSec(candleSec: number, candleCount: number): number {
  const span = Math.max(1, candleCount) * Math.max(1, candleSec);
  const targets = [60, 120, 180, 300, 600, 900, 1800, 3600];
  for (const p of targets) {
    if (p < candleSec) continue;
    const letters = Math.ceil(span / p);
    if (letters <= 24) return p;
  }
  return 3600;
}

export interface BuildTpoOptions {
  symbol: SymbolId;
  /** Candle interval seconds (feeds use 60). */
  candleSec?: number;
  /** Override bracket length; otherwise auto. */
  periodSec?: number;
  /** Rolling window: use only the last N candles (default all). */
  maxCandles?: number;
  /** Price step; defaults from symbol. */
  tick?: number;
  /** Value-area coverage of total prints (default 0.7). */
  valueAreaPct?: number;
}

/**
 * Classic Market Profile / TPO from OHLC candles.
 *
 * For each time bracket (letter), every price from candle.low→high
 * at `tick` resolution gets that letter once per period (union of
 * touched prices across candles in the bracket). POC = max prints;
 * value area expands from POC until ~70% of prints are covered.
 */
export function buildTpoFromCandles(
  candles: Candle[],
  opts: BuildTpoOptions,
): TpoProfile {
  const empty: TpoProfile = {
    levels: [],
    periods: [],
    poc: 0,
    vah: 0,
    val: 0,
    totalPrints: 0,
    periodSec: opts.periodSec ?? 300,
    tick: opts.tick ?? tpoTick(opts.symbol),
    startTime: 0,
    endTime: 0,
  };

  if (!candles.length) return empty;

  const maxCandles = opts.maxCandles ?? candles.length;
  const window = candles.slice(-Math.max(1, maxCandles));
  const candleSec = opts.candleSec ?? 60;
  const tick = opts.tick ?? tpoTick(opts.symbol);
  const periodSec =
    opts.periodSec ?? choosePeriodSec(candleSec, window.length);
  const valueAreaPct = opts.valueAreaPct ?? 0.7;

  // price → ordered unique letters
  const atPrice = new Map<number, string[]>();
  const periods: TpoPeriod[] = [];
  const letterByBucket = new Map<number, string>();

  const startTime = window[0].time;
  const endTime = window[window.length - 1].time + candleSec;

  for (const c of window) {
    if (!(c.high >= c.low) || !Number.isFinite(c.high)) continue;
    const bucket = Math.floor(c.time / periodSec) * periodSec;
    let letter = letterByBucket.get(bucket);
    if (!letter) {
      if (periods.length >= TPO_ALPHABET.length) continue;
      letter = TPO_ALPHABET[periods.length];
      letterByBucket.set(bucket, letter);
      periods.push({
        letter,
        startTime: bucket,
        endTime: bucket + periodSec,
      });
    }

    const lo = Math.floor(c.low / tick) * tick;
    const hi = Math.ceil(c.high / tick) * tick;
    // Guard runaway ranges (bad ticks)
    const maxSteps = 400;
    const steps = Math.round((hi - lo) / tick);
    if (steps < 0 || steps > maxSteps) {
      const mid = Math.round(((c.high + c.low) / 2) / tick) * tick;
      addLetter(atPrice, mid, letter);
      continue;
    }
    for (let p = lo; p <= hi + tick * 0.25; p = +(p + tick).toFixed(8)) {
      addLetter(atPrice, +p.toFixed(8), letter);
    }
  }

  if (!atPrice.size) return { ...empty, periodSec, tick, startTime, endTime, periods };

  let totalPrints = 0;
  let poc = 0;
  let pocCount = -1;
  for (const [price, letters] of atPrice) {
    totalPrints += letters.length;
    if (
      letters.length > pocCount ||
      (letters.length === pocCount && (poc === 0 || Math.abs(price) < Math.abs(poc)))
    ) {
      // Prefer closer-to-mid on ties later; for now take highest count, then first seen mid-ish
      if (letters.length > pocCount) {
        pocCount = letters.length;
        poc = price;
      }
    }
  }

  // Tie-break POC toward session mid
  const mid =
    window.reduce((s, c) => s + (c.high + c.low) / 2, 0) / window.length;
  for (const [price, letters] of atPrice) {
    if (letters.length === pocCount && Math.abs(price - mid) < Math.abs(poc - mid)) {
      poc = price;
    }
  }

  const va = computeValueArea(atPrice, poc, totalPrints, valueAreaPct);

  const prices = [...atPrice.keys()].sort((a, b) => b - a);
  const levels: TpoLevel[] = prices.map((price) => {
    const letters = atPrice.get(price)!;
    return {
      price,
      letters,
      count: letters.length,
      inValueArea: price <= va.vah + tick * 0.25 && price >= va.val - tick * 0.25,
      isPoc: price === poc,
    };
  });

  return {
    levels,
    periods,
    poc,
    vah: va.vah,
    val: va.val,
    totalPrints,
    periodSec,
    tick,
    startTime,
    endTime,
  };
}

/**
 * Optionally densify TPO using individual trade prints (unique price per period).
 * Merges into an existing candle-built profile's period boundaries.
 */
export function mergeTradesIntoTpo(
  profile: TpoProfile,
  trades: { time: number; price: number }[],
  tick: number,
): TpoProfile {
  if (!profile.periods.length || !trades.length) return profile;

  const atPrice = new Map<number, string[]>();
  for (const lvl of profile.levels) {
    atPrice.set(lvl.price, [...lvl.letters]);
  }

  const periodSec = profile.periodSec;
  const letterByBucket = new Map(
    profile.periods.map((p) => [p.startTime, p.letter] as const),
  );

  for (const t of trades) {
    // Feeds mix ms (live aggTrade / mock tape) and sec (candles).
    const timeSec = t.time > 1e12 ? Math.floor(t.time / 1000) : t.time;
    const bucket = Math.floor(timeSec / periodSec) * periodSec;
    const letter = letterByBucket.get(bucket);
    if (!letter) continue;
    const key = Math.round(t.price / tick) * tick;
    addLetter(atPrice, +key.toFixed(8), letter);
  }

  // Rebuild POC / VA from merged map
  let totalPrints = 0;
  let poc = profile.poc;
  let pocCount = -1;
  for (const [, letters] of atPrice) {
    totalPrints += letters.length;
  }
  const mid = profile.poc;
  for (const [price, letters] of atPrice) {
    if (
      letters.length > pocCount ||
      (letters.length === pocCount && Math.abs(price - mid) < Math.abs(poc - mid))
    ) {
      pocCount = letters.length;
      poc = price;
    }
  }
  const va = computeValueArea(atPrice, poc, totalPrints, 0.7);
  const prices = [...atPrice.keys()].sort((a, b) => b - a);
  return {
    ...profile,
    poc,
    vah: va.vah,
    val: va.val,
    totalPrints,
    levels: prices.map((price) => {
      const letters = atPrice.get(price)!;
      return {
        price,
        letters,
        count: letters.length,
        inValueArea: price <= va.vah + tick * 0.25 && price >= va.val - tick * 0.25,
        isPoc: price === poc,
      };
    }),
  };
}

function addLetter(map: Map<number, string[]>, price: number, letter: string) {
  const list = map.get(price);
  if (!list) {
    map.set(price, [letter]);
    return;
  }
  if (!list.includes(letter)) list.push(letter);
}

function computeValueArea(
  atPrice: Map<number, string[]>,
  poc: number,
  totalPrints: number,
  pct: number,
): { vah: number; val: number } {
  if (!atPrice.size || totalPrints <= 0) return { vah: poc, val: poc };

  const sorted = [...atPrice.keys()].sort((a, b) => a - b);
  const countOf = (p: number) => atPrice.get(p)?.length ?? 0;

  let loIdx = sorted.indexOf(poc);
  if (loIdx < 0) {
    // snap to nearest
    loIdx = 0;
    let best = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const d = Math.abs(sorted[i] - poc);
      if (d < best) {
        best = d;
        loIdx = i;
      }
    }
  }
  let hiIdx = loIdx;
  let covered = countOf(sorted[loIdx]);
  const target = totalPrints * pct;

  while (covered < target && (loIdx > 0 || hiIdx < sorted.length - 1)) {
    const nextLo = loIdx > 0 ? countOf(sorted[loIdx - 1]) : -1;
    const nextHi = hiIdx < sorted.length - 1 ? countOf(sorted[hiIdx + 1]) : -1;
    if (nextHi > nextLo) {
      hiIdx += 1;
      covered += nextHi;
    } else if (nextLo >= 0) {
      loIdx -= 1;
      covered += nextLo;
    } else if (nextHi >= 0) {
      hiIdx += 1;
      covered += nextHi;
    } else {
      break;
    }
  }

  return { val: sorted[loIdx], vah: sorted[hiIdx] };
}

/** Format period length for UI. */
export function formatPeriodLabel(periodSec: number): string {
  if (periodSec < 60) return `${periodSec}s`;
  if (periodSec < 3600) return `${Math.round(periodSec / 60)}m`;
  return `${(periodSec / 3600).toFixed(periodSec % 3600 ? 1 : 0)}h`;
}
