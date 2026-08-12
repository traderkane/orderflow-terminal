import { useTerminalStore } from '../store/useTerminalStore';
import { fmtPrice, fmtSize, fmtTime } from '../lib/format';

export function LiquidationsWidget() {
  const liqs = useTerminalStore((s) => s.feed?.liquidations) ?? [];

  return (
    <div className="flex h-full flex-col font-mono text-[10px] leading-[1.15]">
      <div className="grid grid-cols-[1fr_0.7fr_1fr_1fr] border-b border-terminal-border/80 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-terminal-label">
        <span>Time</span>
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {liqs.length === 0 && (
          <div className="p-2 text-[11px] text-terminal-muted">No liquidations yet — feed is live.</div>
        )}
        {liqs.map((l) => (
          <div
            key={l.id}
            className={`grid grid-cols-[1fr_0.7fr_1fr_1fr] px-1.5 py-[1px] ${
              l.size > 40 ? 'bg-accent/10' : ''
            }`}
          >
            <span className="tabular-nums text-zinc-600">{fmtTime(l.time)}</span>
            <span className={l.side === 'long' ? 'text-down' : 'text-up'}>
              {l.side.toUpperCase()}
            </span>
            <span className="text-right tabular-nums text-zinc-200">
              {fmtPrice(l.price, 2)}
            </span>
            <span className="text-right tabular-nums text-zinc-100">{fmtSize(l.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
