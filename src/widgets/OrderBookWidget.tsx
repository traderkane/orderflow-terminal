import { useTerminalStore } from '../store/useTerminalStore';

function fmt(n: number, d = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export function OrderBookWidget() {
  const book = useTerminalStore((s) => s.feed?.book);

  if (!book) {
    return <div className="p-3 text-xs text-zinc-500">Waiting for book…</div>;
  }

  const maxTotal = Math.max(
    book.bids[book.bids.length - 1]?.total ?? 1,
    book.asks[book.asks.length - 1]?.total ?? 1,
  );

  const asks = [...book.asks].slice(0, 14).reverse();
  const bids = book.bids.slice(0, 14);

  return (
    <div className="flex h-full flex-col font-mono text-[11px]">
      <div className="grid grid-cols-3 border-b border-terminal-border px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {asks.map((lvl) => (
          <Row key={`a-${lvl.price}`} {...lvl} maxTotal={maxTotal} side="ask" />
        ))}
        <div className="flex items-center justify-between border-y border-terminal-border bg-[#121722] px-2 py-1.5">
          <span className="text-zinc-400">Spread</span>
          <span className="text-zinc-100">{fmt(book.spread, 2)}</span>
          <span className="text-zinc-500">{fmt(book.mid, 2)}</span>
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
  const pct = Math.min(100, (total / maxTotal) * 100);
  const color = side === 'bid' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
  return (
    <div className="relative grid grid-cols-3 px-2 py-[3px]">
      <div
        className="absolute inset-y-0 right-0"
        style={{ width: `${pct}%`, background: color }}
      />
      <span className={`relative ${side === 'bid' ? 'text-up' : 'text-down'}`}>
        {fmt(price, 2)}
      </span>
      <span className="relative text-right text-zinc-200">{fmt(size, 3)}</span>
      <span className="relative text-right text-zinc-500">{fmt(total, 3)}</span>
    </div>
  );
}
