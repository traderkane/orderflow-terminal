import { useMemo } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';

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
    return <div className="p-3 text-xs text-zinc-500">Accumulating profile…</div>;
  }

  const view = profile.slice(-36);

  return (
    <div className="flex h-full flex-col p-2">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>VPVR</span>
        <span className="font-mono text-zinc-300">POC {poc.toFixed(2)}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-[2px] overflow-hidden">
        {view.map((bin) => {
          const width = (bin.total / max) * 100;
          const buyShare = bin.total ? (bin.buyVolume / bin.total) * 100 : 50;
          const isPoc = bin.price === poc;
          return (
            <div key={bin.price} className="flex items-center gap-2">
              <span
                className={`w-16 shrink-0 text-right font-mono text-[10px] ${
                  isPoc ? 'text-amber-300' : 'text-zinc-500'
                }`}
              >
                {bin.price.toFixed(2)}
              </span>
              <div className="relative h-3 flex-1 rounded-sm bg-zinc-900">
                <div className="absolute inset-y-0 left-0 flex" style={{ width: `${width}%` }}>
                  <div className="h-full bg-up/70" style={{ width: `${buyShare}%` }} />
                  <div className="h-full bg-down/70" style={{ width: `${100 - buyShare}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-sm bg-up/70" /> buy
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-sm bg-down/70" /> sell
        </span>
      </div>
    </div>
  );
}
