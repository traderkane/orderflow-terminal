import type { Candle, Trade, TradeCountPoint } from '../types/market';

export type VolumePaneMode = 'volume' | 'count';

export const VOLUME_PANE_MODE_KEY = 'flow-terminal-volume-pane-v1';

export function isVolumePaneMode(v: unknown): v is VolumePaneMode {
  return v === 'volume' || v === 'count';
}

export function loadVolumePaneMode(): VolumePaneMode {
  try {
    const raw = localStorage.getItem(VOLUME_PANE_MODE_KEY);
    if (isVolumePaneMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'volume';
}

export function persistVolumePaneMode(mode: VolumePaneMode) {
  try {
    localStorage.setItem(VOLUME_PANE_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Estimate trade counts for REST/synthetic candle seeds (no tick tape). */
export function estimateTradeCountsFromCandle(
  c: Candle,
  avgTradeSize: number,
): TradeCountPoint {
  const avg = Math.max(avgTradeSize, 1e-9);
  const est = Math.max(1, Math.round(c.volume / avg));
  const buyShare = c.close >= c.open ? 0.55 : 0.45;
  const buyCount = Math.max(0, Math.round(est * buyShare));
  const sellCount = Math.max(0, est - buyCount);
  return { time: c.time, buyCount, sellCount, estimated: true };
}

export function avgTradeSizeForSymbol(symbol: string): number {
  return symbol.startsWith('BTC') ? 0.05 : 0.4;
}

/**
 * Derive per-candle buy/sell trade counts from aggressor trades (chart TF buckets).
 * Used as a chart-side fallback when the feed snapshot omits tradeCounts.
 */
export function tradeCountsFromTrades(
  trades: Trade[],
  candles: Candle[],
  intervalSec: number,
): TradeCountPoint[] {
  if (!candles.length) return [];
  const sec = Math.max(1, intervalSec);
  const byTime = new Map<number, TradeCountPoint>();
  for (const c of candles) {
    byTime.set(c.time, { time: c.time, buyCount: 0, sellCount: 0 });
  }
  for (const t of trades) {
    const ts = t.time > 1e12 ? Math.floor(t.time / 1000) : Math.floor(t.time);
    const bucket = Math.floor(ts / sec) * sec;
    let row = byTime.get(bucket);
    if (!row) {
      // Only accumulate into known candle buckets
      continue;
    }
    if (t.side === 'buy') row.buyCount += 1;
    else row.sellCount += 1;
  }
  return candles.map((c) => byTime.get(c.time) ?? { time: c.time, buyCount: 0, sellCount: 0 });
}
