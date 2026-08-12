import { useMemo } from 'react';
import {
  buildTpoFromCandles,
  formatPeriodLabel,
  mergeTradesIntoTpo,
  tpoTick,
} from '../data/tpo';
import { intervalToSec } from '../lib/chartIntervals';
import { useTerminalStore } from '../store/useTerminalStore';

const MAX_ROWS = 48;
const MAX_CANDLES = 180;

function fmtPrice(p: number, tick: number): string {
  if (tick >= 1) return p.toFixed(0);
  if (tick >= 0.1) return p.toFixed(1);
  return p.toFixed(2);
}

/**
 * MMT-style TPO / Market Profile — letters show time spent at each price.
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

  return (
    <div className="flex h-full flex-col overflow-hidden font-mono text-[10px] leading-[1.1]">
      <div className="mb-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-terminal-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-terminal-label">
        <span title="No separate TPO timeframe — uses chart candles. Footprint stays 1m.">
          TPO · chart TF · {formatPeriodLabel(profile.periodSec)} brackets · tick{' '}
          {profile.tick}
        </span>
        <span className="normal-case tracking-normal text-zinc-400">
          <span className="text-amber-300">POC {fmtPrice(profile.poc, profile.tick)}</span>
          <span className="mx-1.5 text-zinc-600">|</span>
          VA {fmtPrice(profile.val, profile.tick)}–{fmtPrice(profile.vah, profile.tick)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1 pb-1">
        <div className="space-y-px">
          {view.levels.map((lvl) => {
            const near =
              last > 0 && Math.abs(lvl.price - last) <= profile.tick * 0.51;
            const widthPct = (lvl.count / view.maxCount) * 100;
            return (
              <div
                key={lvl.price}
                className={`flex items-center gap-1 rounded-[2px] px-0.5 ${
                  lvl.isPoc
                    ? 'bg-amber-400/10'
                    : lvl.inValueArea
                      ? 'bg-white/[0.03]'
                      : ''
                } ${near ? 'ring-1 ring-inset ring-white/10' : ''}`}
              >
                <span
                  className={`w-[4.5rem] shrink-0 text-right tabular-nums ${
                    lvl.isPoc
                      ? 'font-semibold text-amber-300'
                      : near
                        ? 'text-zinc-100'
                        : 'text-zinc-500'
                  }`}
                >
                  {fmtPrice(lvl.price, profile.tick)}
                </span>
                <div className="relative min-w-0 flex-1">
                  <div
                    className="absolute inset-y-0 left-0 rounded-[2px] bg-sky-400/10"
                    style={{ width: `${widthPct}%` }}
                  />
                  <div className="relative flex flex-wrap gap-[1px] py-[1px] pl-0.5">
                    {lvl.letters.map((ch) => {
                      const ib = ibLetters.has(ch);
                      return (
                        <span
                          key={`${lvl.price}-${ch}`}
                          className={`inline-flex h-[14px] min-w-[12px] items-center justify-center rounded-[2px] px-[2px] text-[10px] font-semibold ${
                            lvl.isPoc
                              ? 'bg-amber-400/25 text-amber-200'
                              : ib
                                ? 'bg-violet-400/20 text-violet-200'
                                : lvl.inValueArea
                                  ? 'bg-sky-400/15 text-sky-100/90'
                                  : 'bg-zinc-800/80 text-zinc-400'
                          }`}
                          title={`Period ${ch}`}
                        >
                          {ch}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <span className="w-5 shrink-0 text-right tabular-nums text-zinc-600">
                  {lvl.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-terminal-border/80 px-1.5 py-0.5 text-[9px] text-terminal-label">
        <span>
          <span className="text-amber-300">POC</span> max time
        </span>
        <span>
          <span className="text-sky-300">VA</span> ~70%
        </span>
        <span>
          <span className="text-violet-300">A–B</span> initial balance
        </span>
        <span className="text-zinc-600">
          {profile.periods.length} periods · {profile.totalPrints} prints
        </span>
      </div>
    </div>
  );
}
