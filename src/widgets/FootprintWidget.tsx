import { useMemo } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import type { FootprintBar } from '../types/market';

const IMBALANCE_RATIO = 3;
const MAX_BARS = 10;
const MAX_ROWS = 36;

function fmtVol(v: number): string {
  if (v <= 0) return '·';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtTime(sec: number): string {
  const d = new Date(sec * 1000);
  return d.toLocaleTimeString(undefined, {
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
  const buyA = maxSide > 0 ? 0.12 + (buy / maxSide) * 0.55 : 0.08;
  const sellA = maxSide > 0 ? 0.12 + (sell / maxSide) * 0.55 : 0.08;
  let imbalance: 'buy' | 'sell' | null = null;
  if (buy > 0 && sell > 0) {
    if (buy / sell >= IMBALANCE_RATIO) imbalance = 'buy';
    else if (sell / buy >= IMBALANCE_RATIO) imbalance = 'sell';
  } else if (buy > 0 && sell === 0 && buy > maxSide * 0.15) {
    imbalance = 'buy';
  } else if (sell > 0 && buy === 0 && sell > maxSide * 0.15) {
    imbalance = 'sell';
  }
  return {
    buyBg: `rgba(61, 214, 140, ${buyA})`,
    sellBg: `rgba(240, 113, 120, ${sellA})`,
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
      <div className="p-3 font-mono text-xs text-zinc-500">Building footprint…</div>
    );
  }

  const lookup = (bar: FootprintBar, price: number) =>
    bar.levels.find((l) => l.price === price);

  return (
    <div className="flex h-full flex-col overflow-hidden font-mono text-[10px] leading-tight">
      <div className="mb-1 flex items-center justify-between px-2 pt-1 text-[9px] uppercase tracking-wider text-zinc-500">
        <span>Clustered · ask buy / bid sell</span>
        <span className="normal-case tracking-normal text-zinc-400">
          imb ≥ {IMBALANCE_RATIO}:1
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-terminal-panel/95">
            <tr>
              <th className="px-1 py-1 text-right font-medium text-zinc-500">Px</th>
              {bars.map((bar, i) => (
                <th
                  key={bar.time}
                  className="px-0.5 py-1 text-center font-medium text-zinc-500"
                  title={new Date(bar.time * 1000).toLocaleString()}
                >
                  <div>{fmtTime(bar.time)}</div>
                  <div
                    className={
                      barDeltas[i] >= 0 ? 'text-up/80' : 'text-down/80'
                    }
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
                <tr key={price} className={near ? 'bg-white/[0.03]' : undefined}>
                  <td
                    className={`whitespace-nowrap px-1 py-[1px] text-right tabular-nums ${
                      near ? 'text-zinc-100' : 'text-zinc-500'
                    }`}
                  >
                    {price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  {bars.map((bar) => {
                    const cell = lookup(bar, price);
                    if (!cell) {
                      return (
                        <td
                          key={bar.time}
                          className="px-0.5 py-[1px] text-center text-zinc-700"
                        >
                          ·
                        </td>
                      );
                    }
                    const tone = cellTone(cell.buyVolume, cell.sellVolume, maxSide);
                    const ring =
                      tone.imbalance === 'buy'
                        ? 'inset 0 0 0 1px rgba(61,214,140,0.85)'
                        : tone.imbalance === 'sell'
                          ? 'inset 0 0 0 1px rgba(240,113,120,0.85)'
                          : undefined;
                    return (
                      <td key={bar.time} className="px-0.5 py-[1px]">
                        <div
                          className="grid grid-cols-2 gap-px overflow-hidden rounded-[2px]"
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
      <div className="flex gap-3 border-t border-terminal-border px-2 py-1 text-[9px] text-zinc-500">
        <span>
          <span className="text-down">sell</span> | <span className="text-up">buy</span>
        </span>
        <span>Δ bar header</span>
        <span className="text-zinc-400">outline = imbalance</span>
      </div>
    </div>
  );
}
