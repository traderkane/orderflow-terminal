import { useEffect, useMemo, useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmtPrice, fmtSize, fmtTime } from '../lib/format';
import {
  loadTapePrefs,
  persistTapePrefs,
  tapeDisplaySize,
  tapeSizeTiers,
  type TapePrefs,
  type TapeSizeUnit,
} from '../lib/tapePrefs';

export function TradesTapeWidget() {
  const trades = useTerminalStore((s) => s.feed?.trades) ?? [];
  const setHoverPrice = useTerminalStore((s) => s.setHoverPrice);
  const pulseFocusPrice = useTerminalStore((s) => s.pulseFocusPrice);

  const [prefs, setPrefs] = useState<TapePrefs>(() => loadTapePrefs());
  const { sizeUnit, minSize } = prefs;

  useEffect(() => {
    persistTapePrefs(prefs);
  }, [prefs]);

  const patch = (partial: Partial<TapePrefs>) => {
    setPrefs((prev) => ({ ...prev, ...partial }));
  };

  const setSizeUnit = (unit: TapeSizeUnit) => patch({ sizeUnit: unit });

  const onTapeLeave = () => {
    // Only clear if tape owns the hover — chart/DOM may still be driving it.
    const src = useTerminalStore.getState().hoverSource;
    if (src === 'tape') setHoverPrice(null, null);
  };

  const tiers = tapeSizeTiers(sizeUnit);

  const visible = useMemo(() => {
    if (!(minSize > 0)) return trades;
    return trades.filter(
      (t) => tapeDisplaySize(t.size, t.price, sizeUnit) >= minSize,
    );
  }, [trades, minSize, sizeUnit]);

  return (
    <div
      className="flex h-full flex-col font-mono text-[10px] leading-[1.05]"
      onMouseLeave={onTapeLeave}
    >
      <div className="dom-toolbar flex shrink-0 flex-wrap items-center gap-1 border-b border-terminal-border/80 px-1 py-0.5">
        <div className="dom-seg" role="group" aria-label="Size unit">
          <button
            type="button"
            className="dom-seg-btn"
            data-active={sizeUnit === 'usd' ? 'true' : 'false'}
            title="Show size as USD notional"
            onClick={() => setSizeUnit('usd')}
          >
            USD
          </button>
          <button
            type="button"
            className="dom-seg-btn"
            data-active={sizeUnit === 'coin' ? 'true' : 'false'}
            title="Show size in coin quantity"
            onClick={() => setSizeUnit('coin')}
          >
            COIN
          </button>
        </div>

        <label
          className="tape-min flex items-center gap-1 rounded-[2px] border border-white/[0.06] bg-[#0c0f14] px-1.5 py-0.5"
          title={`Hide prints below this ${sizeUnit === 'usd' ? 'USD' : 'coin'} size`}
        >
          <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-zinc-600">
            Min
          </span>
          <input
            type="number"
            min={0}
            step={sizeUnit === 'usd' ? 1000 : 0.1}
            value={minSize > 0 ? minSize : ''}
            placeholder="0"
            className="tape-min-input w-14 bg-transparent text-right font-mono text-[9px] tabular-nums text-zinc-300 outline-none placeholder:text-zinc-700"
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                patch({ minSize: 0 });
                return;
              }
              const n = Number(v);
              if (Number.isFinite(n) && n >= 0) patch({ minSize: n });
            }}
          />
        </label>

        <span className="ml-auto text-[8px] uppercase tracking-[0.1em] text-zinc-600">
          {visible.length}
          {minSize > 0 ? `/${trades.length}` : ''} · {sizeUnit}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_1.1fr_0.9fr_auto] border-b border-terminal-border/80 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-terminal-label">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">
          Size{sizeUnit === 'usd' ? ' $' : ''}
        </span>
        <span className="pl-1 text-right">Ex</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {trades.length === 0 && (
          <div className="p-2 text-[11px] text-terminal-muted">Waiting for trades…</div>
        )}
        {trades.length > 0 && visible.length === 0 && (
          <div className="p-2 text-[11px] text-terminal-muted">
            No prints ≥ {fmtSize(minSize)} {sizeUnit === 'usd' ? 'USD' : 'COIN'}
          </div>
        )}
        {visible.map((t) => {
          const disp = tapeDisplaySize(t.size, t.price, sizeUnit);
          const big = disp >= tiers.big;
          const huge = disp >= tiers.huge;
          const bubble = Math.min(8, 2 + Math.sqrt(Math.max(0, disp / (sizeUnit === 'usd' ? 5000 : 1))) * 1.4);
          return (
            <div
              key={t.id}
              className={`tape-row grid cursor-pointer grid-cols-[1fr_1.1fr_0.9fr_auto] items-center px-1.5 py-px ${
                huge
                  ? 'bg-accent/10'
                  : big
                    ? t.side === 'buy'
                      ? 'bg-up/[0.06]'
                      : 'bg-down/[0.06]'
                    : ''
              }`}
              onMouseEnter={() => setHoverPrice(t.price, 'tape')}
              onClick={() => pulseFocusPrice(t.price)}
            >
              <span className="flex items-center gap-1 tabular-nums text-zinc-600">
                {(big || huge) && (
                  <span
                    className="inline-block shrink-0 rounded-full"
                    style={{
                      width: bubble,
                      height: bubble,
                      background:
                        t.side === 'buy'
                          ? 'rgba(14,203,129,0.75)'
                          : 'rgba(246,70,93,0.75)',
                      boxShadow: huge
                        ? `0 0 6px ${
                            t.side === 'buy'
                              ? 'rgba(14,203,129,0.55)'
                              : 'rgba(246,70,93,0.55)'
                          }`
                        : undefined,
                    }}
                    aria-hidden
                  />
                )}
                {fmtTime(t.time)}
              </span>
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
                {fmtSize(disp)}
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
