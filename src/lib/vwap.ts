import type { Candle, VwapPoint } from '../types/market';

/** Session-anchored VWAP modes (crypto UTC). */
export type VwapAnchor = 'session' | 'week' | 'rolling24h';

export const VWAP_ANCHORS: VwapAnchor[] = ['session', 'week', 'rolling24h'];

export const VWAP_ANCHOR_KEY = 'flow-terminal-vwap-anchors-v1';

export const VWAP_ANCHOR_LABEL: Record<VwapAnchor, string> = {
  session: 'Session',
  week: 'Week',
  rolling24h: '24h',
};

export const VWAP_ANCHOR_TITLE: Record<VwapAnchor, string> = {
  session: 'Session / Day VWAP (UTC midnight reset)',
  week: 'Week VWAP (UTC Monday reset)',
  rolling24h: 'Rolling 24h VWAP',
};

export const VWAP_ANCHOR_COLOR: Record<VwapAnchor, string> = {
  session: '#f0b90b',
  week: '#a78bfa',
  rolling24h: '#22d3ee',
};

const DEFAULT_ANCHORS: VwapAnchor[] = ['session'];

export function isVwapAnchor(v: unknown): v is VwapAnchor {
  return v === 'session' || v === 'week' || v === 'rolling24h';
}

export function loadVwapAnchors(): VwapAnchor[] {
  try {
    const raw = localStorage.getItem(VWAP_ANCHOR_KEY);
    if (!raw) return [...DEFAULT_ANCHORS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_ANCHORS];
    const next = parsed.filter(isVwapAnchor);
    return next.length ? uniqueAnchors(next) : [...DEFAULT_ANCHORS];
  } catch {
    return [...DEFAULT_ANCHORS];
  }
}

export function persistVwapAnchors(anchors: VwapAnchor[]) {
  try {
    const next = uniqueAnchors(anchors);
    localStorage.setItem(
      VWAP_ANCHOR_KEY,
      JSON.stringify(next.length ? next : DEFAULT_ANCHORS),
    );
  } catch {
    /* ignore */
  }
}

function uniqueAnchors(anchors: VwapAnchor[]): VwapAnchor[] {
  const out: VwapAnchor[] = [];
  for (const a of VWAP_ANCHORS) {
    if (anchors.includes(a)) out.push(a);
  }
  return out;
}

export function toggleVwapAnchor(
  current: VwapAnchor[],
  anchor: VwapAnchor,
): VwapAnchor[] {
  if (current.includes(anchor)) {
    const next = current.filter((a) => a !== anchor);
    return next.length ? next : current; // keep at least one
  }
  return uniqueAnchors([...current, anchor]);
}

/** UTC calendar-day start (seconds). */
export function sessionStartUtc(timeSec: number): number {
  const d = new Date(timeSec * 1000);
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000,
  );
}

/** UTC ISO-week start Monday 00:00 (seconds). */
export function weekStartUtc(timeSec: number): number {
  const dayStart = sessionStartUtc(timeSec);
  const day = new Date(timeSec * 1000).getUTCDay(); // 0=Sun
  const mondayOffset = day === 0 ? 6 : day - 1;
  return dayStart - mondayOffset * 86400;
}

function typicalPrice(c: Candle): number {
  return (c.high + c.low + c.close) / 3;
}

/** Anchored cumulative VWAP from candles (typical price × volume). */
export function computeAnchoredVwap(
  candles: Candle[],
  anchorOf: (timeSec: number) => number,
): VwapPoint[] {
  let runPv = 0;
  let runVv = 0;
  let curAnchor = Number.NaN;
  const out: VwapPoint[] = [];
  for (const c of candles) {
    const a = anchorOf(c.time);
    if (a !== curAnchor) {
      runPv = 0;
      runVv = 0;
      curAnchor = a;
    }
    const tp = typicalPrice(c);
    runPv += tp * c.volume;
    runVv += c.volume;
    out.push({ time: c.time, value: runVv > 0 ? runPv / runVv : c.close });
  }
  return out;
}

/** Rolling-window VWAP ending at each bar (typical × volume). */
export function computeRollingVwap(
  candles: Candle[],
  windowSec: number,
): VwapPoint[] {
  const out: VwapPoint[] = [];
  let lo = 0;
  let runPv = 0;
  let runVv = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tp = typicalPrice(c);
    runPv += tp * c.volume;
    runVv += c.volume;
    const minT = c.time - windowSec + 1;
    while (lo <= i && candles[lo].time < minT) {
      const old = candles[lo];
      const otp = typicalPrice(old);
      runPv -= otp * old.volume;
      runVv -= old.volume;
      lo += 1;
    }
    out.push({ time: c.time, value: runVv > 0 ? runPv / runVv : c.close });
  }
  return out;
}

/** Tick-approx VWAP series for an anchor (HLC/3 × volume from candles). */
export function computeVwapSeriesForAnchor(
  candles: Candle[],
  anchor: VwapAnchor,
): VwapPoint[] {
  switch (anchor) {
    case 'session':
      return computeAnchoredVwap(candles, sessionStartUtc);
    case 'week':
      return computeAnchoredVwap(candles, weekStartUtc);
    case 'rolling24h':
      return computeRollingVwap(candles, 86400);
  }
}
