import { useMemo } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import type { FootprintBar } from '../types/market';
import { fmtPrice } from '../lib/format';

const IMBALANCE_RATIO = 3;
const MAX_BARS = 12;
const MAX_ROWS = 42;

function fmtVol(v: number): string {
  if (!(v > 0)) return '·';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtTime(sec: number): string {
  const d = new Date(sec * 1000);
  return d.toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cellTone(
  buy: number,
  sell: number,
  maxSide: number,
): { buyBg: string; sellBg: string; imbalance: 'buy' | 'sell' | null } {
  const buyA = maxSide > 0 ? 0.1 + (buy / maxSide) * 0.62 : 0.06;
  const sellA = maxSide > 0 ? 0.1 + (sell / maxSide) * 0.62 : 0.06;
  let imbalance: 'buy' | 'sell' | null = null;
  if (buy > 0 && sell > 0) {
    if (buy / sell >= IMBALANCE_RATIO) imbalance = 'buy';
    else if (sell / buy >= IMBALANCE_RATIO) imbalance = 'sell';
  } else if (buy > 0 && sell === 0 && buy > maxSide * 0.12) {
    imbalance = 'buy';
  } else if (sell > 0 && buy === 0 && sell > maxSide * 0.12) {
    imbalance = 'sell';
  }
  return {
    buyBg: `rgba(14, 203, 129, ${buyA})`,
    sellBg: `rgba(246, 70, 93, ${sellA})`,
    imbalance,
  };
}

export function FootprintWidget() {
  const footprint = useTerminalStore((s) => s.feed?.footprint) ?? [];
  const last = useTerminalStore((s) => s.feed?.stats.last) ?? 0;

  const { bars, prices, maxSide, barDeltas } = useMemo(() => {
    const bars = footprint.slice(-MAX_BARS);
    const priceSet = new Set<number>();
    let maxSide = 1;
    for (const bar of bars) {
      for (const l of bar.levels) {
        priceSet.add(l.price);
        maxSide = Math.max(maxSide, l.buyVolume, l.sellVolume);
      }
    }
    let prices = [...priceSet].sort((a, b) => b - a);
    if (prices.length > MAX_ROWS && last) {
      prices = prices
        .slice()
        .sort((a, b) => Math.abs(a - last) - Math.abs(b - last))
        .slice(0, MAX_ROWS)
        .sort((a, b) => b - a);
    } else if (prices.length > MAX_ROWS) {
      const mid = Math.floor(prices.length / 2);
      const half = Math.floor(MAX_ROWS / 2);
      prices = prices.slice(Math.max(0, mid - half), mid - half + MAX_ROWS);
    }
    const barDeltas = bars.map((b) => b.delta);
    return { bars, prices, maxSide, barDeltas };
  }, [footprint, last]);

  if (!bars.length || !prices.length) {
    return (
      <div className="p-2 font-mono text-[11px] text-terminal-muted">Building footprint…</div>
    );
  }

  const lookup = (bar: FootprintBar, price: number) =>
    bar.levels.find((l) => l.price === price);

  return (
    <div className="flex h-full flex-col overflow-hidden font-mono text-[9px] leading-[1.05]">
      <div className="flex items-center justify-between border-b border-terminal-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-terminal-label">
        <span>Detail · sell | buy · 1m</span>
        <span className="normal-case tracking-normal text-zinc-500" title="Side table stays on 1m; use Chart → Footprint mode for TF-aligned clusters">
          imb ≥ {IMBALANCE_RATIO}:1 · chart has FP mode
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-0.5 pb-0.5">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-terminal-panel/95 backdrop-blur-[1px]">
            <tr>
              <th className="px-1 py-0.5 text-right font-medium text-terminal-label">Px</th>
              {bars.map((bar, i) => (
                <th
                  key={bar.time}
                  className="px-0.5 py-0.5 text-center font-medium text-terminal-label"
                  title={new Date(bar.time * 1000).toLocaleString()}
                >
                  <div className="tabular-nums">{fmtTime(bar.time)}</div>
                  <div
                    className={`tabular-nums ${
                      barDeltas[i] >= 0 ? 'text-up/80' : 'text-down/80'
                    }`}
                  >
                    {barDeltas[i] >= 0 ? '+' : ''}
                    {fmtVol(Math.abs(barDeltas[i]))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prices.map((price) => {
              const near = last > 0 && Math.abs(price - last) / last < 0.00005;
              return (
                <tr key={price} className={near ? 'bg-white/[0.035]' : undefined}>
                  <td
                    className={`whitespace-nowrap px-1 py-px text-right tabular-nums ${
                      near ? 'text-zinc-100' : 'text-zinc-600'
                    }`}
                  >
                    {fmtPrice(price, 2)}
                  </td>
                  {bars.map((bar) => {
                    const cell = lookup(bar, price);
                    if (!cell) {
                      return (
                        <td
                          key={bar.time}
                          className="px-0.5 py-px text-center text-zinc-800"
                        >
                          ·
                        </td>
                      );
                    }
                    const tone = cellTone(cell.buyVolume, cell.sellVolume, maxSide);
                    const ring =
                      tone.imbalance === 'buy'
                        ? 'inset 0 0 0 1px rgba(14,203,129,0.9)'
                        : tone.imbalance === 'sell'
                          ? 'inset 0 0 0 1px rgba(246,70,93,0.9)'
                          : undefined;
                    return (
                      <td key={bar.time} className="px-0.5 py-px">
                        <div
                          className="grid grid-cols-2 gap-px overflow-hidden rounded-[1px]"
                          style={ring ? { boxShadow: ring } : undefined}
                        >
                          <span
                            className="px-0.5 text-right tabular-nums text-down"
                            style={{ background: tone.sellBg }}
                          >
                            {fmtVol(cell.sellVolume)}
                          </span>
                          <span
                            className="px-0.5 text-left tabular-nums text-up"
                            style={{ background: tone.buyBg }}
                          >
                            {fmtVol(cell.buyVolume)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 border-t border-terminal-border/80 px-1.5 py-0.5 text-[9px] text-terminal-label">
        <span>
          <span className="text-down">sell</span> | <span className="text-up">buy</span>
        </span>
        <span className="text-zinc-500">outline = imbalance</span>
      </div>
    </div>
  );
}
