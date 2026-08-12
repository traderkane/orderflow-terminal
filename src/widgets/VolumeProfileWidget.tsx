import { useMemo } from 'react';
import { fmtPrice, fmtSize } from '../lib/format';
import { useTerminalStore } from '../store/useTerminalStore';
import type { VolumeProfileBin } from '../types/market';

const MAX_ROWS = 56;
const VALUE_AREA_PCT = 0.7;

function inferStep(bins: VolumeProfileBin[]): number {
  if (bins.length < 2) return 1;
  let step = Infinity;
  const sorted = bins.map((b) => b.price).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const d = Math.abs(sorted[i] - sorted[i - 1]);
    if (d > 0) step = Math.min(step, d);
  }
  return Number.isFinite(step) ? step : 1;
}

function priceDecimals(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

/** Expand from POC until ~70% of total volume is covered (classic VPVR VA). */
function computeVolumeValueArea(
  bins: VolumeProfileBin[],
  poc: number,
  totalVol: number,
  pct: number,
): { vah: number; val: number } {
  if (!bins.length || totalVol <= 0) return { vah: poc, val: poc };

  const sorted = [...bins].sort((a, b) => a.price - b.price);
  const volOf = (i: number) => sorted[i]?.total ?? 0;

  let loIdx = sorted.findIndex((b) => b.price === poc);
  if (loIdx < 0) {
    loIdx = 0;
    let best = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const d = Math.abs(sorted[i].price - poc);
      if (d < best) {
        best = d;
        loIdx = i;
      }
    }
  }
  let hiIdx = loIdx;
  let covered = volOf(loIdx);
  const target = totalVol * pct;

  while (covered < target && (loIdx > 0 || hiIdx < sorted.length - 1)) {
    const nextLo = loIdx > 0 ? volOf(loIdx - 1) : -1;
    const nextHi = hiIdx < sorted.length - 1 ? volOf(hiIdx + 1) : -1;
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

  return { val: sorted[loIdx].price, vah: sorted[hiIdx].price };
}

/**
 * MMT-style VPVR — buy/sell split histogram with POC / value-area cues.
 * Visual densify for Profile dock (parity with densified TPO).
 */
export function VolumeProfileWidget() {
  const profile = useTerminalStore((s) => s.feed?.volumeProfile) ?? [];
  const last = useTerminalStore((s) => s.feed?.stats.last) ?? 0;
  const mid = useTerminalStore((s) => s.feed?.stats.mid) ?? 0;

  const derived = useMemo(() => {
    if (!profile.length) return null;

    let maxVol = 0;
    let poc = mid || last || profile[0].price;
    let totalVol = 0;
    for (const bin of profile) {
      totalVol += bin.total;
      if (
        bin.total > maxVol ||
        (bin.total === maxVol && Math.abs(bin.price - (mid || last || poc)) < Math.abs(poc - (mid || last || poc)))
      ) {
        maxVol = bin.total;
        poc = bin.price;
      }
    }
    if (maxVol <= 0) maxVol = 1;

    const { vah, val } = computeVolumeValueArea(profile, poc, totalVol, VALUE_AREA_PCT);
    const step = inferStep(profile);
    const decimals = priceDecimals(step);

    let levels = profile.slice().sort((a, b) => b.price - a.price);
    if (levels.length > MAX_ROWS) {
      const anchor = last || poc;
      levels = levels
        .slice()
        .sort((a, b) => Math.abs(a.price - anchor) - Math.abs(b.price - anchor))
        .slice(0, MAX_ROWS)
        .sort((a, b) => b.price - a.price);
    }

    const buyVol = profile.reduce((s, b) => s + b.buyVolume, 0);
    const sellVol = profile.reduce((s, b) => s + b.sellVolume, 0);

    return { levels, maxVol, poc, vah, val, step, decimals, totalVol, buyVol, sellVol };
  }, [profile, last, mid]);

  if (!derived) {
    return <div className="p-2 font-mono text-[11px] text-terminal-muted">Accumulating profile…</div>;
  }

  const { levels, maxVol, poc, vah, val, step, decimals, totalVol, buyVol, sellVol } = derived;
  const nearTick = step * 0.51;
  const isNear = (price: number) => last > 0 && Math.abs(price - last) <= nearTick;
  const isVah = (price: number) => Math.abs(price - vah) <= nearTick;
  const isVal = (price: number) => Math.abs(price - val) <= nearTick;

  return (
    <div className="vpvr-widget flex h-full flex-col overflow-hidden font-mono text-[9px] leading-[1.05]">
      <div className="panel-colhead flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <span className="min-w-0 truncate" title="Visible range volume profile — buy/sell aggressor split">
          VPVR · tick {step}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] normal-case tracking-normal">
          <span className="font-semibold text-accent tabular-nums">POC {fmtPrice(poc, decimals)}</span>
          <span className="text-zinc-700">·</span>
          <span className="tabular-nums text-sky-300/90">
            VA {fmtPrice(val, decimals)}–{fmtPrice(vah, decimals)}
          </span>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-0.5 pb-0.5">
        <div className="vpvr-grid">
          {levels.map((bin) => {
            const near = isNear(bin.price);
            const vahEdge = isVah(bin.price);
            const valEdge = isVal(bin.price);
            const isPoc = bin.price === poc;
            const inVa = bin.price <= vah + nearTick && bin.price >= val - nearTick;
            const widthPct = Math.max(3, (bin.total / maxVol) * 100);
            const buyShare = bin.total ? (bin.buyVolume / bin.total) * 100 : 50;
            const rowClass = [
              'vpvr-row',
              isPoc ? 'vpvr-row-poc' : '',
              !isPoc && inVa ? 'vpvr-row-va' : '',
              near ? 'vpvr-row-last' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={bin.price} className={rowClass}>
                <span
                  className={`vpvr-price ${
                    isPoc
                      ? 'vpvr-price-poc'
                      : near
                        ? 'vpvr-price-last'
                        : vahEdge || valEdge
                          ? 'vpvr-price-va-edge'
                          : ''
                  }`}
                >
                  {near && <i className="vpvr-last-caret" aria-hidden />}
                  {fmtPrice(bin.price, decimals)}
                </span>

                <div className="vpvr-bar-wrap" title={`Δ ${fmtSize(bin.buyVolume - bin.sellVolume)}`}>
                  {isPoc && <div className="vpvr-poc-line" aria-hidden />}
                  <div
                    className={`vpvr-bar-track ${isPoc ? 'vpvr-bar-track-poc' : inVa ? 'vpvr-bar-track-va' : ''}`}
                    style={{ width: `${widthPct}%` }}
                  >
                    <div className="vpvr-bar-buy" style={{ width: `${buyShare}%` }} />
                    <div className="vpvr-bar-sell" style={{ width: `${100 - buyShare}%` }} />
                  </div>
                </div>

                <span className="vpvr-meta">
                  {(vahEdge || valEdge) && (
                    <span className="vpvr-edge-tag">{vahEdge ? 'VAH' : 'VAL'}</span>
                  )}
                  {isPoc && !vahEdge && !valEdge && (
                    <span className="vpvr-edge-tag vpvr-edge-poc">POC</span>
                  )}
                  <span className="vpvr-count">{fmtSize(bin.total)}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 border-t border-terminal-border/80 px-1.5 py-0.5 text-[9px] text-terminal-label">
        <span className="inline-flex items-center gap-1">
          <i className="vpvr-swatch vpvr-swatch-buy" /> buy
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="vpvr-swatch vpvr-swatch-sell" /> sell
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="vpvr-swatch vpvr-swatch-poc" /> POC
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="vpvr-swatch vpvr-swatch-va" /> VA ~70%
        </span>
        <span className="ml-auto tabular-nums text-zinc-600">
          {fmtSize(buyVol)}/{fmtSize(sellVol)} · {fmtSize(totalVol)}
        </span>
      </div>
    </div>
  );
}
