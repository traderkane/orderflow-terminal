import { useTerminalStore } from '../store/useTerminalStore';

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'up' | 'down' | 'neutral';
}) {
  const color =
    accent === 'up' ? 'text-up' : accent === 'down' ? 'text-down' : 'text-zinc-100';
  return (
    <div className="rounded border border-terminal-border bg-[#0d1118] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-sm ${color}`}>{value}</div>
    </div>
  );
}

export function StatsWidget() {
  const stats = useTerminalStore((s) => s.feed?.stats);
  const symbol = useTerminalStore((s) => s.symbol);
  const exchanges = useTerminalStore((s) => s.exchanges);

  if (!stats) {
    return <div className="p-3 text-xs text-zinc-500">Waiting for stats…</div>;
  }

  const up = stats.change24h >= 0;

  return (
    <div className="grid h-full grid-cols-2 gap-2 overflow-auto p-2 md:grid-cols-3">
      <Stat label="Symbol" value={symbol} />
      <Stat
        label="Last"
        value={stats.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      />
      <Stat
        label="24h Change"
        value={`${up ? '+' : ''}${stats.changePct24h.toFixed(2)}%`}
        accent={up ? 'up' : 'down'}
      />
      <Stat
        label="24h High"
        value={stats.high24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      />
      <Stat
        label="24h Low"
        value={stats.low24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      />
      <Stat label="Volume" value={stats.volume24h.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
      <Stat
        label="Funding"
        value={`${(stats.fundingRate * 100).toFixed(4)}%`}
        accent={stats.fundingRate >= 0 ? 'up' : 'down'}
      />
      <Stat
        label="Open Interest"
        value={stats.openInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      />
      <Stat label="Spread" value={stats.spread.toFixed(2)} />
      <Stat label="Mid" value={stats.mid.toFixed(2)} />
      <Stat label="Venues" value={exchanges.join(' · ')} />
      <Stat label="Feed" value="Mock / Replay" />
    </div>
  );
}
