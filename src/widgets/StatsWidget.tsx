import { useTerminalStore } from '../store/useTerminalStore';
import { fmtNum, fmtPct, fmtPrice } from '../lib/format';

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
    <div className="min-w-0 rounded-[2px] border border-terminal-border/80 bg-[#080a0e] px-2 py-1">
      <div className="truncate text-[9px] uppercase tracking-[0.14em] text-terminal-label">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-[11px] tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export function StatsWidget() {
  const stats = useTerminalStore((s) => s.feed?.stats);
  const symbol = useTerminalStore((s) => s.symbol);
  const exchanges = useTerminalStore((s) => s.exchanges);
  const feedMode = useTerminalStore((s) => s.feedMode);

  if (!stats) {
    return <div className="p-2 font-mono text-[11px] text-terminal-muted">Waiting for stats…</div>;
  }

  const up = stats.change24h >= 0;

  return (
    <div className="grid h-full auto-rows-fr grid-cols-4 gap-1 overflow-auto p-1 md:grid-cols-6 xl:grid-cols-12">
      <Stat label="Symbol" value={symbol} />
      <Stat label="Last" value={fmtPrice(stats.last, 2)} />
      <Stat
        label="24h %"
        value={fmtPct(stats.changePct24h)}
        accent={up ? 'up' : 'down'}
      />
      <Stat label="High" value={fmtPrice(stats.high24h, 2)} />
      <Stat label="Low" value={fmtPrice(stats.low24h, 2)} />
      <Stat label="Volume" value={fmtNum(stats.volume24h, 1, { compact: true })} />
      <Stat
        label="Funding"
        value={`${(stats.fundingRate * 100).toFixed(4)}%`}
        accent={stats.fundingRate >= 0 ? 'up' : 'down'}
      />
      <Stat label="OI" value={fmtNum(stats.openInterest, 0, { compact: true })} />
      <Stat label="Spread" value={fmtPrice(stats.spread, 2)} />
      <Stat label="Mid" value={fmtPrice(stats.mid, 2)} />
      <Stat label="Venues" value={exchanges.map((e) => e.slice(0, 3)).join('·')} />
      <Stat
        label="Feed"
        value={feedMode === 'live' ? 'Live' : 'Mock'}
        accent={feedMode === 'live' ? 'up' : 'neutral'}
      />
    </div>
  );
}
