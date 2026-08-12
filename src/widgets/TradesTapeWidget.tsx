import { useTerminalStore } from '../store/useTerminalStore';
import { fmtPrice, fmtSize, fmtTime } from '../lib/format';

export function TradesTapeWidget() {
  const trades = useTerminalStore((s) => s.feed?.trades) ?? [];

  return (
    <div className="flex h-full flex-col font-mono text-[10px] leading-[1.15]">
      <div className="grid grid-cols-[1fr_1.1fr_0.9fr_auto] border-b border-terminal-border/80 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-terminal-label">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="pl-1 text-right">Ex</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {trades.length === 0 && (
          <div className="p-2 text-[11px] text-terminal-muted">Waiting for trades…</div>
        )}
        {trades.map((t) => {
          const big = t.size >= 2;
          const huge = t.size >= 8;
          return (
            <div
              key={t.id}
              className={`grid grid-cols-[1fr_1.1fr_0.9fr_auto] px-1.5 py-[1px] ${
                huge
                  ? 'bg-accent/10'
                  : big
                    ? t.side === 'buy'
                      ? 'bg-up/[0.06]'
                      : 'bg-down/[0.06]'
                    : ''
              }`}
            >
              <span className="tabular-nums text-zinc-600">{fmtTime(t.time)}</span>
              <span
                className={`text-right tabular-nums ${
                  t.side === 'buy' ? 'text-up' : 'text-down'
                }`}
              >
                {fmtPrice(t.price, 2)}
              </span>
              <span
                className={`text-right tabular-nums ${
                  huge
                    ? 'font-semibold text-accent'
                    : big
                      ? 'text-zinc-100'
                      : 'text-zinc-400'
                }`}
              >
                {fmtSize(t.size)}
              </span>
              <span className="pl-1 text-right text-[9px] text-zinc-600">
                {t.exchange.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
