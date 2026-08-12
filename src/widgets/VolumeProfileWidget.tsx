import { useMemo } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmtPrice } from '../lib/format';

export function VolumeProfileWidget() {
  const profile = useTerminalStore((s) => s.feed?.volumeProfile) ?? [];
  const mid = useTerminalStore((s) => s.feed?.stats.mid) ?? 0;

  const { max, poc } = useMemo(() => {
    let maxVol = 1;
    let pocPrice = mid;
    for (const bin of profile) {
      if (bin.total > maxVol) {
        maxVol = bin.total;
        pocPrice = bin.price;
      }
    }
    return { max: maxVol, poc: pocPrice };
  }, [profile, mid]);

  if (!profile.length) {
    return <div className="p-2 font-mono text-[11px] text-terminal-muted">Accumulating profile…</div>;
  }

  const view = profile.slice(-40);

  return (
    <div className="flex h-full flex-col px-1.5 py-1">
      <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.12em] text-terminal-label">
        <span>VPVR</span>
        <span className="font-mono tabular-nums normal-case tracking-normal text-accent">
          POC {fmtPrice(poc, 2)}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-px overflow-hidden">
        {view.map((bin) => {
          const width = (bin.total / max) * 100;
          const buyShare = bin.total ? (bin.buyVolume / bin.total) * 100 : 50;
          const isPoc = bin.price === poc;
          return (
            <div key={bin.price} className="flex items-center gap-1.5">
              <span
                className={`w-14 shrink-0 text-right font-mono text-[10px] tabular-nums ${
                  isPoc ? 'text-accent' : 'text-zinc-600'
                }`}
              >
                {fmtPrice(bin.price, 2)}
              </span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-[1px] bg-[#080a0e]">
                <div className="absolute inset-y-0 left-0 flex" style={{ width: `${width}%` }}>
                  <div className="h-full bg-up/65" style={{ width: `${buyShare}%` }} />
                  <div className="h-full bg-down/65" style={{ width: `${100 - buyShare}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-3 text-[9px] text-terminal-label">
        <span className="flex items-center gap-1">
          <i className="inline-block h-1.5 w-1.5 rounded-[1px] bg-up/70" /> buy
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-1.5 w-1.5 rounded-[1px] bg-down/70" /> sell
        </span>
      </div>
    </div>
  );
}
