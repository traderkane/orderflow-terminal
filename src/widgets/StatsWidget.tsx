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
    <div className="min-w-0 rounded-sm border border-terminal-border bg-[#0a0e15] px-2.5 py-1.5">
      <div className="truncate text-[9px] uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-xs ${color}`}>{value}</div>
    </div>
  );
}

export function StatsWidget() {
  const stats = useTerminalStore((s) => s.feed?.stats);
  const symbol = useTerminalStore((s) => s.symbol);
  const exchanges = useTerminalStore((s) => s.exchanges);

  if (!stats) {
    return <div className="p-2 text-[11px] text-zinc-500">Waiting for stats…</div>;
  }

  const up = stats.change24h >= 0;

  return (
    <div className="grid h-full auto-rows-fr grid-cols-4 gap-1.5 overflow-auto p-1.5 md:grid-cols-6 xl:grid-cols-12">
      <Stat label="Symbol" value={symbol} />
      <Stat
        label="Last"
        value={stats.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      />
      <Stat
        label="24h %"
        value={`${up ? '+' : ''}${stats.changePct24h.toFixed(2)}%`}
        accent={up ? 'up' : 'down'}
      />
      <Stat
        label="High"
        value={stats.high24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      />
      <Stat
        label="Low"
        value={stats.low24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      />
      <Stat label="Volume" value={stats.volume24h.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
      <Stat
        label="Funding"
        value={`${(stats.fundingRate * 100).toFixed(4)}%`}
        accent={stats.fundingRate >= 0 ? 'up' : 'down'}
      />
      <Stat
        label="OI"
        value={stats.openInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      />
      <Stat label="Spread" value={stats.spread.toFixed(2)} />
      <Stat label="Mid" value={stats.mid.toFixed(2)} />
      <Stat label="Venues" value={exchanges.map((e) => e.slice(0, 3)).join('·')} />
      <Stat label="Feed" value="Mock" />
    </div>
  );
}
