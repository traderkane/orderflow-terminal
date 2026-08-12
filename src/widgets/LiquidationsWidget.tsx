import { useTerminalStore } from '../store/useTerminalStore';

export function LiquidationsWidget() {
  const liqs = useTerminalStore((s) => s.feed?.liquidations) ?? [];

  return (
    <div className="flex h-full flex-col font-mono text-[10px] leading-tight">
      <div className="grid grid-cols-[1fr_0.7fr_1fr_1fr] border-b border-terminal-border px-1.5 py-1 text-[9px] uppercase tracking-wider text-zinc-500">
        <span>Time</span>
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {liqs.length === 0 && (
          <div className="p-3 text-xs text-zinc-500">No liquidations yet — feed is live.</div>
        )}
        {liqs.map((l) => (
          <div
            key={l.id}
            className={`grid grid-cols-[1fr_0.7fr_1fr_1fr] px-1.5 py-[2px] ${
              l.size > 40 ? 'bg-amber-500/10' : ''
            }`}
          >
            <span className="text-zinc-500">
              {new Date(l.time).toLocaleTimeString(undefined, { hour12: false })}
            </span>
            <span className={l.side === 'long' ? 'text-down' : 'text-up'}>
              {l.side.toUpperCase()}
            </span>
            <span className="text-right text-zinc-200">
              {l.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className="text-right text-zinc-100">{l.size.toFixed(2)}</span>
            </div>
        ))}
      </div>
    </div>
  );
}
