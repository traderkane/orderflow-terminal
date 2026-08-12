import { useEffect, useMemo, useRef, useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmtPrice, fmtSize } from '../lib/format';
import type { BookLevel, Trade } from '../types/market';

const ROW_H = 16;

export function OrderBookWidget() {
  const book = useTerminalStore((s) => s.feed?.book);
  const trades = useTerminalStore((s) => s.feed?.trades);
  const last = useTerminalStore((s) => s.feed?.stats.last);
  const hoverPrice = useTerminalStore((s) => s.hoverPrice);
  const setHoverPrice = useTerminalStore((s) => s.setHoverPrice);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [levelsEach, setLevelsEach] = useState(14);

  // Flash tracking — re-fire animation when a new tape print hits a level.
  const [flash, setFlash] = useState<{
    price: number;
    side: 'buy' | 'sell';
    key: string;
  } | null>(null);
  const seenTradeId = useRef<string | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Header + imbalance + spread ~ 54px; rest split into ask/bid rows.
      const h = el.clientHeight;
      const each = Math.max(6, Math.floor((h - 2) / 2 / ROW_H));
      setLevelsEach(each);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = trades?.[0];
    if (!t || !book) return;
    if (seenTradeId.current === t.id) return;
    seenTradeId.current = t.id;
    const hit = nearestLevel(t, book.bids, book.asks);
    if (!hit) return;
    setFlash({ price: hit.price, side: t.side, key: t.id });
  }, [trades, book]);

  const model = useMemo(() => {
    if (!book) return null;
    const asks = [...book.asks].slice(0, levelsEach).reverse();
    const bids = book.bids.slice(0, levelsEach);

    const askDepth = book.asks.slice(0, levelsEach).reduce((s, l) => s + (l.size || 0), 0);
    const bidDepth = book.bids.slice(0, levelsEach).reduce((s, l) => s + (l.size || 0), 0);
    const depthSum = askDepth + bidDepth || 1;
    const bidPct = (bidDepth / depthSum) * 100;

    const maxSize = Math.max(
      1,
      ...asks.map((l) => l.size || 0),
      ...bids.map((l) => l.size || 0),
    );
    const maxTotal = Math.max(
      1,
      asks[0]?.total ?? 0, // farthest ask in reversed list
      bids[bids.length - 1]?.total ?? 0,
      book.bids[levelsEach - 1]?.total ?? 0,
      book.asks[levelsEach - 1]?.total ?? 0,
    );

    const tick = inferTick(book.bids, book.asks);
    return { asks, bids, askDepth, bidDepth, bidPct, maxSize, maxTotal, tick };
  }, [book, levelsEach]);

  if (!book || !model) {
    return <div className="p-2 font-mono text-[11px] text-terminal-muted">Waiting for book…</div>;
  }

  const { asks, bids, bidPct, maxSize, maxTotal, tick, bidDepth, askDepth } = model;
  const mid = book.mid;
  const lastPx = last ?? mid;
  const spreadPct = mid > 0 ? (book.spread / mid) * 100 : 0;

  const syncPrice = (() => {
    if (hoverPrice == null) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (const lvl of asks) {
      const d = Math.abs(lvl.price - hoverPrice);
      if (d < bestDist) {
        bestDist = d;
        best = lvl.price;
      }
    }
    for (const lvl of bids) {
      const d = Math.abs(lvl.price - hoverPrice);
      if (d < bestDist) {
        bestDist = d;
        best = lvl.price;
      }
    }
    return best;
  })();

  const onRowEnter = (price: number) => setHoverPrice(price, 'dom');
  const onBookLeave = () => {
    // Only clear if DOM owns the hover — chart may still be driving it.
    const src = useTerminalStore.getState().hoverSource;
    if (src === 'dom') setHoverPrice(null, null);
  };

  return (
    <div
      className="flex h-full flex-col font-mono text-[10px] leading-none"
      onMouseLeave={onBookLeave}
    >
      {/* Imbalance bar */}
      <div className="border-b border-terminal-border/80 px-1.5 py-1">
        <div className="mb-0.5 flex items-center justify-between text-[9px] uppercase tracking-[0.12em] text-terminal-label">
          <span className="text-up">Bid {fmtSize(bidDepth)}</span>
          <span>Imbalance</span>
          <span className="text-down">Ask {fmtSize(askDepth)}</span>
        </div>
        <div className="flex h-[5px] overflow-hidden rounded-[1px] bg-[#12161e]">
          <div className="bg-up/70 transition-[width] duration-150" style={{ width: `${bidPct}%` }} />
          <div
            className="bg-down/70 transition-[width] duration-150"
            style={{ width: `${100 - bidPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1.15fr_1fr_1fr] border-b border-terminal-border/80 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-terminal-label">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Cum</span>
      </div>

      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        {/* Asks — grow from bottom toward spread */}
        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
          {asks.map((lvl) => {
            const hit =
              flash && approxEq(flash.price, lvl.price, tick)
                ? { side: flash.side, key: flash.key }
                : null;
            return (
              <LadderRow
                key={hit ? `a-${lvl.price}-${hit.key}` : `a-${lvl.price}`}
                level={lvl}
                side="ask"
                maxSize={maxSize}
                maxTotal={maxTotal}
                flash={hit}
                synced={syncPrice != null && approxEq(syncPrice, lvl.price, tick)}
                onHoverPrice={onRowEnter}
              />
            );
          })}
        </div>

        {/* Centered spread / last */}
        <div className="flex shrink-0 items-center justify-between gap-1 border-y border-terminal-border-strong bg-[#0f131a] px-1.5 py-[5px]">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.14em] text-terminal-label">Spread</div>
            <div className="tabular-nums text-[11px] text-zinc-200">
              {fmtPrice(book.spread, book.spread < 1 ? 2 : 1)}
              <span className="ml-1 text-[9px] text-zinc-600">{spreadPct.toFixed(3)}%</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.14em] text-terminal-label">Last</div>
            <div
              className={`tabular-nums text-[11px] font-semibold ${
                lastPx >= mid ? 'text-up' : 'text-down'
              }`}
            >
              {fmtPrice(lastPx, 2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.14em] text-terminal-label">Mid</div>
            <div className="tabular-nums text-[11px] text-zinc-100">{fmtPrice(mid, 2)}</div>
          </div>
        </div>

        {/* Bids */}
        <div className="flex min-h-0 flex-1 flex-col justify-start overflow-hidden">
          {bids.map((lvl) => {
            const hit =
              flash && approxEq(flash.price, lvl.price, tick)
                ? { side: flash.side, key: flash.key }
                : null;
            return (
              <LadderRow
                key={hit ? `b-${lvl.price}-${hit.key}` : `b-${lvl.price}`}
                level={lvl}
                side="bid"
                maxSize={maxSize}
                maxTotal={maxTotal}
                flash={hit}
                synced={syncPrice != null && approxEq(syncPrice, lvl.price, tick)}
                onHoverPrice={onRowEnter}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LadderRow({
  level,
  side,
  maxSize,
  maxTotal,
  flash,
  synced,
  onHoverPrice,
}: {
  level: BookLevel;
  side: 'bid' | 'ask';
  maxSize: number;
  maxTotal: number;
  flash: { side: 'buy' | 'sell'; key: string } | null;
  synced: boolean;
  onHoverPrice: (price: number) => void;
}) {
  const safeTotal = Number.isFinite(level.total) ? level.total : 0;
  const safeSize = Number.isFinite(level.size) ? level.size : 0;
  const cumPct = Math.min(100, (safeTotal / maxTotal) * 100);
  const sizePct = Math.min(100, (safeSize / maxSize) * 100);
  const cumColor = side === 'bid' ? 'rgba(14,203,129,0.16)' : 'rgba(246,70,93,0.16)';
  const sizeColor = side === 'bid' ? 'rgba(14,203,129,0.28)' : 'rgba(246,70,93,0.28)';
  const flashClass =
    flash == null
      ? ''
      : flash.side === 'buy'
        ? 'dom-flash-buy'
        : 'dom-flash-sell';
  const syncClass = synced ? 'dom-row-sync' : '';

  return (
    <div
      className={`depth-row dom-row relative grid grid-cols-[1.15fr_1fr_1fr] items-center px-1.5 ${flashClass} ${syncClass}`}
      style={{ height: ROW_H }}
      onMouseEnter={() => onHoverPrice(level.price)}
    >
      {/* Cumulative depth (full-row wash) */}
      <div
        className="absolute inset-y-0 right-0"
        style={{ width: `${cumPct}%`, background: cumColor }}
      />
      {/* Size bar (shorter, stronger) */}
      <div
        className="absolute inset-y-[3px] right-0 rounded-[1px]"
        style={{ width: `${sizePct}%`, background: sizeColor }}
      />
      <span
        className={`relative tabular-nums text-[10px] font-medium ${
          side === 'bid' ? 'text-up' : 'text-down'
        }`}
      >
        {fmtPrice(level.price, 2)}
      </span>
      <span className="relative text-right tabular-nums text-zinc-100">{fmtSize(safeSize)}</span>
      <span className="relative text-right tabular-nums text-zinc-500">{fmtSize(safeTotal)}</span>
    </div>
  );
}

function inferTick(bids: BookLevel[], asks: BookLevel[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(bids.length, 6); i++) {
    const d = Math.abs(bids[i - 1].price - bids[i].price);
    if (d > 0) gaps.push(d);
  }
  for (let i = 1; i < Math.min(asks.length, 6); i++) {
    const d = Math.abs(asks[i].price - asks[i - 1].price);
    if (d > 0) gaps.push(d);
  }
  if (!gaps.length) return 0.5;
  gaps.sort((a, b) => a - b);
  return gaps[0];
}

function approxEq(a: number, b: number, tick: number): boolean {
  return Math.abs(a - b) <= Math.max(tick * 0.51, 1e-8);
}

function nearestLevel(
  trade: Trade,
  bids: BookLevel[],
  asks: BookLevel[],
): BookLevel | null {
  const tick = inferTick(bids, asks);
  let best: BookLevel | null = null;
  let bestDist = Infinity;
  for (const lvl of bids) {
    const d = Math.abs(lvl.price - trade.price);
    if (d < bestDist) {
      bestDist = d;
      best = lvl;
    }
  }
  for (const lvl of asks) {
    const d = Math.abs(lvl.price - trade.price);
    if (d < bestDist) {
      bestDist = d;
      best = lvl;
    }
  }
  if (!best || bestDist > tick * 1.01) return null;
  return best;
}
