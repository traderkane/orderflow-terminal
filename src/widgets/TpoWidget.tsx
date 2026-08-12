import { useMemo } from 'react';
import {
  buildTpoFromCandles,
  formatPeriodLabel,
  mergeTradesIntoTpo,
  tpoTick,
} from '../data/tpo';
import { intervalToSec } from '../lib/chartIntervals';
import { useTerminalStore } from '../store/useTerminalStore';

const MAX_ROWS = 56;
const MAX_CANDLES = 180;

function fmtPrice(p: number, tick: number): string {
  if (tick >= 1) return p.toFixed(0);
  if (tick >= 0.1) return p.toFixed(1);
  return p.toFixed(2);
}

/**
 * MMT-style TPO / Market Profile — letters show time spent at each price.
 * Visual-only: denser letter blocks, clear POC/VA/IB, price axis + last marker.
 */
export function TpoWidget() {
  const candles = useTerminalStore((s) => s.feed?.candles) ?? [];
  const trades = useTerminalStore((s) => s.feed?.trades) ?? [];
  const symbol = useTerminalStore((s) => s.symbol);
  const last = useTerminalStore((s) => s.feed?.stats.last) ?? 0;
  const chartInterval = useTerminalStore((s) => s.chartInterval);

  const profile = useMemo(() => {
    const tick = tpoTick(symbol);
    // No separate TPO TF — builds from chart candles at the active chart interval.
    const base = buildTpoFromCandles(candles, {
      symbol,
      candleSec: intervalToSec(chartInterval),
      maxCandles: MAX_CANDLES,
      tick,
    });
    // Trades densify prints inside known period brackets (live + mock).
    const tradePts = trades.map((t) => ({ time: t.time, price: t.price }));
    return mergeTradesIntoTpo(base, tradePts, tick);
  }, [candles, trades, symbol, chartInterval]);

  const view = useMemo(() => {
    let levels = profile.levels;
    if (levels.length > MAX_ROWS) {
      const anchor = last || profile.poc;
      levels = levels
        .slice()
        .sort((a, b) => Math.abs(a.price - anchor) - Math.abs(b.price - anchor))
        .slice(0, MAX_ROWS)
        .sort((a, b) => b.price - a.price);
    }
    const maxCount = levels.reduce((m, l) => Math.max(m, l.count), 1);
    return { levels, maxCount };
  }, [profile, last]);

  if (!profile.levels.length) {
    return (
      <div className="p-2 font-mono text-[11px] text-terminal-muted">Building TPO…</div>
    );
  }

  const ibLetters = new Set(
    profile.periods.slice(0, Math.min(2, profile.periods.length)).map((p) => p.letter),
  );

  const nearTick = profile.tick * 0.51;
  const isNear = (price: number) => last > 0 && Math.abs(price - last) <= nearTick;
  const isVah = (price: number) => Math.abs(price - profile.vah) <= nearTick;
  const isVal = (price: number) => Math.abs(price - profile.val) <= nearTick;

  return (
    <div className="tpo-widget flex h-full flex-col overflow-hidden font-mono text-[9px] leading-[1.05]">
      <div className="panel-colhead flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <span
          className="min-w-0 truncate"
          title="No separate TPO timeframe — uses chart candles. Footprint stays 1m."
        >
          TPO · {formatPeriodLabel(profile.periodSec)} · tick {profile.tick}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] normal-case tracking-normal">
          <span className="font-semibold text-accent tabular-nums">
            POC {fmtPrice(profile.poc, profile.tick)}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="tabular-nums text-sky-300/90">
            VA {fmtPrice(profile.val, profile.tick)}–{fmtPrice(profile.vah, profile.tick)}
          </span>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-0.5 pb-0.5">
        <div className="tpo-grid">
          {view.levels.map((lvl) => {
            const near = isNear(lvl.price);
            const vah = isVah(lvl.price);
            const val = isVal(lvl.price);
            const widthPct = Math.max(4, (lvl.count / view.maxCount) * 100);
            const rowClass = [
              'tpo-row',
              lvl.isPoc ? 'tpo-row-poc' : '',
              !lvl.isPoc && lvl.inValueArea ? 'tpo-row-va' : '',
              near ? 'tpo-row-last' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={lvl.price} className={rowClass}>
                <span
                  className={`tpo-price ${
                    lvl.isPoc
                      ? 'tpo-price-poc'
                      : near
                        ? 'tpo-price-last'
                        : vah || val
                          ? 'tpo-price-va-edge'
                          : ''
                  }`}
                >
                  {near && <i className="tpo-last-caret" aria-hidden />}
                  {fmtPrice(lvl.price, profile.tick)}
                </span>

                <div className="tpo-letters-wrap">
                  <div
                    className={`tpo-hist ${lvl.isPoc ? 'tpo-hist-poc' : lvl.inValueArea ? 'tpo-hist-va' : ''}`}
                    style={{ width: `${widthPct}%` }}
                  />
                  <div className="tpo-letters">
                    {lvl.letters.map((ch) => {
                      const ib = ibLetters.has(ch);
                      const letterClass = [
                        'tpo-letter',
                        lvl.isPoc ? 'tpo-letter-poc' : '',
                        !lvl.isPoc && ib ? 'tpo-letter-ib' : '',
                        !lvl.isPoc && !ib && lvl.inValueArea ? 'tpo-letter-va' : '',
                        !lvl.isPoc && !ib && !lvl.inValueArea ? 'tpo-letter-out' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <span
                          key={`${lvl.price}-${ch}`}
                          className={letterClass}
                          title={`Period ${ch}${ib ? ' · IB' : ''}${lvl.isPoc ? ' · POC' : ''}`}
                        >
                          {ch}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <span className="tpo-meta">
                  {(vah || val) && (
                    <span className="tpo-edge-tag">{vah ? 'VAH' : 'VAL'}</span>
                  )}
                  {lvl.isPoc && !vah && !val && <span className="tpo-edge-tag tpo-edge-poc">POC</span>}
                  <span className="tpo-count">{lvl.count}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 border-t border-terminal-border/80 px-1.5 py-0.5 text-[9px] text-terminal-label">
        <span className="inline-flex items-center gap-1">
          <i className="tpo-swatch tpo-swatch-poc" /> POC
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="tpo-swatch tpo-swatch-va" /> VA ~70%
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="tpo-swatch tpo-swatch-ib" /> IB A–B
        </span>
        <span className="ml-auto tabular-nums text-zinc-600">
          {profile.periods.length}p · {profile.totalPrints} prints
        </span>
      </div>
    </div>
  );
}
