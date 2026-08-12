import { useTerminalStore } from '../store/useTerminalStore';

export function TradesTapeWidget() {
  const trades = useTerminalStore((s) => s.feed?.trades) ?? [];

  return (
    <div className="flex h-full flex-col font-mono text-[10px] leading-tight">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] border-b border-terminal-border px-1.5 py-1 text-[9px] uppercase tracking-wider text-zinc-500">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="pl-1.5 text-right">Ex</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {trades.map((t) => {
          const big = t.size >= 2;
          const huge = t.size >= 8;
          return (
            <div
              key={t.id}
              className={`grid grid-cols-[1fr_1fr_1fr_auto] px-1.5 py-[2px] ${
                huge ? 'bg-amber-500/10' : big ? 'bg-white/[0.03]' : ''
              }`}
            >
              <span className="text-zinc-500">
                {new Date(t.time).toLocaleTimeString(undefined, {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <span className={`text-right ${t.side === 'buy' ? 'text-up' : 'text-down'}`}>
                {t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span
                className={`text-right ${
                  huge ? 'font-semibold text-amber-300' : big ? 'text-zinc-100' : 'text-zinc-300'
                }`}
              >
                {t.size.toFixed(3)}
              </span>
              <span className="pl-1.5 text-right text-[9px] text-zinc-500">{t.exchange.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
