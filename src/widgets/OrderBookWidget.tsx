import { useTerminalStore } from '../store/useTerminalStore';
import { fmtPrice, fmtSize } from '../lib/format';

export function OrderBookWidget() {
  const book = useTerminalStore((s) => s.feed?.book);

  if (!book) {
    return <div className="p-2 font-mono text-[11px] text-terminal-muted">Waiting for book…</div>;
  }

  const maxTotal = Math.max(
    book.bids[book.bids.length - 1]?.total ?? 1,
    book.asks[book.asks.length - 1]?.total ?? 1,
    1,
  );

  const asks = [...book.asks].slice(0, 18).reverse();
  const bids = book.bids.slice(0, 18);
  const spreadUp = book.spread >= 0;

  return (
    <div className="flex h-full flex-col font-mono text-[10px] leading-[1.15]">
      <div className="grid grid-cols-3 border-b border-terminal-border/80 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-terminal-label">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {asks.map((lvl) => (
          <Row key={`a-${lvl.price}`} {...lvl} maxTotal={maxTotal} side="ask" />
        ))}
        <div className="flex items-center justify-between border-y border-terminal-border bg-[#0f131a] px-1.5 py-[3px]">
          <span className="text-[9px] uppercase tracking-[0.14em] text-terminal-label">Spr</span>
          <span className={`tabular-nums ${spreadUp ? 'text-zinc-200' : 'text-down'}`}>
            {fmtPrice(book.spread, book.spread < 1 ? 2 : 1)}
          </span>
          <span className="tabular-nums text-zinc-100">{fmtPrice(book.mid, 2)}</span>
        </div>
        {bids.map((lvl) => (
          <Row key={`b-${lvl.price}`} {...lvl} maxTotal={maxTotal} side="bid" />
        ))}
      </div>
    </div>
  );
}

function Row({
  price,
  size,
  total,
  maxTotal,
  side,
}: {
  price: number;
  size: number;
  total: number;
  maxTotal: number;
  side: 'bid' | 'ask';
}) {
  const safeTotal = Number.isFinite(total) ? total : 0;
  const safeSize = Number.isFinite(size) ? size : 0;
  const pct = Math.min(100, (safeTotal / maxTotal) * 100);
  const color = side === 'bid' ? 'rgba(14,203,129,0.14)' : 'rgba(246,70,93,0.14)';
  return (
    <div className="depth-row relative grid grid-cols-3 px-1.5 py-[1px]">
      <div
        className="absolute inset-y-0 right-0"
        style={{ width: `${pct}%`, background: color }}
      />
      <span className={`relative tabular-nums ${side === 'bid' ? 'text-up' : 'text-down'}`}>
        {fmtPrice(price, 2)}
      </span>
      <span className="relative text-right tabular-nums text-zinc-200">{fmtSize(safeSize)}</span>
      <span className="relative text-right tabular-nums text-zinc-500">{fmtSize(safeTotal)}</span>
    </div>
  );
}
