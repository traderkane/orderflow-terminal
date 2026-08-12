import { useEffect, useMemo, useRef, useState } from 'react';
import { UI_SYMBOLS } from '../data/venues/symbols';
import { fmtPct, fmtPrice } from '../lib/format';
import { useTerminalStore } from '../store/useTerminalStore';
import type { SymbolId } from '../types/market';

function matchesQuery(symbol: SymbolId, q: string) {
  if (!q) return true;
  const n = q.trim().toLowerCase().replace(/\s+/g, '');
  const s = symbol.toLowerCase().replace('/', '');
  return s.includes(n.replace('/', '')) || symbol.toLowerCase().includes(q.trim().toLowerCase());
}

export function WatchlistStrip() {
  const symbol = useTerminalStore((s) => s.symbol);
  const watchlist = useTerminalStore((s) => s.watchlist);
  const lastQuotes = useTerminalStore((s) => s.lastQuotes);
  const feedStats = useTerminalStore((s) => s.feed?.stats);
  const feedSymbol = useTerminalStore((s) => s.feed?.symbol);
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const addWatchlistSymbol = useTerminalStore((s) => s.addWatchlistSymbol);
  const removeWatchlistSymbol = useTerminalStore((s) => s.removeWatchlistSymbol);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const addRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const available = useMemo(
    () => UI_SYMBOLS.filter((s) => !watchlist.includes(s) && matchesQuery(s, query)),
    [watchlist, query],
  );

  useEffect(() => {
    if (!adding) return;
    setQuery('');
    setHighlight(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [adding]);

  useEffect(() => {
    setHighlight((h) => (available.length ? Math.min(h, available.length - 1) : 0));
  }, [available.length]);

  useEffect(() => {
    if (!adding) return;
    const onDoc = (e: MouseEvent) => {
      if (!addRef.current?.contains(e.target as Node)) setAdding(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAdding(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [adding]);

  const quoteFor = (s: SymbolId) => {
    if (s === symbol && feedStats && (feedSymbol == null || feedSymbol === s)) {
      return {
        last: feedStats.last,
        changePct24h: feedStats.changePct24h,
      };
    }
    return lastQuotes[s] ?? null;
  };

  const pickAdd = (s: SymbolId) => {
    addWatchlistSymbol(s);
    setAdding(false);
  };

  return (
    <div className="watchlist-strip flex h-6 shrink-0 items-center gap-0.5 border-b border-terminal-border bg-terminal-chrome px-2">
      <div className="mr-1 hidden font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-terminal-label sm:block">
        Watch
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {watchlist.map((s) => {
          const active = s === symbol;
          const q = quoteFor(s);
          const up = (q?.changePct24h ?? 0) >= 0;
          return (
            <div
              key={s}
              className={`group relative flex h-5 shrink-0 items-stretch overflow-hidden rounded-[2px] transition-colors ${
                active
                  ? 'bg-white/[0.08]'
                  : 'hover:bg-white/[0.03]'
              }`}
            >
              <button
                type="button"
                onClick={() => setSymbol(s)}
                title={active ? `${s} (active)` : `Switch to ${s}`}
                className={`flex items-center gap-1.5 px-1.5 ${
                  watchlist.length > 1 ? 'pr-5' : ''
                }`}
              >
                <span
                  className={`font-mono text-[10px] font-semibold tracking-wide ${
                    active ? 'text-zinc-50' : 'text-zinc-400 group-hover:text-zinc-200'
                  }`}
                >
                  {s}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-zinc-300">
                  {q ? fmtPrice(q.last, 2) : '—'}
                </span>
                <span
                  className={`font-mono text-[9px] tabular-nums ${
                    q ? (up ? 'text-up' : 'text-down') : 'text-terminal-muted'
                  }`}
                >
                  {q ? fmtPct(q.changePct24h) : '—'}
                </span>
              </button>
              {watchlist.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWatchlistSymbol(s);
                  }}
                  title={`Remove ${s} from watchlist`}
                  className="absolute right-0 top-0 flex h-full w-4 items-center justify-center text-[10px] text-terminal-muted opacity-0 transition-opacity hover:text-zinc-200 group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        <div ref={addRef} className="relative ml-0.5">
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            disabled={watchlist.length >= UI_SYMBOLS.length && !adding}
            title={
              watchlist.length >= UI_SYMBOLS.length
                ? 'All symbols already on watchlist'
                : 'Add symbol to watchlist'
            }
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] text-[12px] leading-none text-terminal-muted transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
          >
            +
          </button>

          {adding && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-[60] w-[200px] overflow-hidden rounded-[3px] border border-terminal-border bg-[#0a0c10] shadow-2xl shadow-black/50">
              <div className="border-b border-terminal-border p-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlight((h) =>
                        available.length ? (h + 1) % available.length : 0,
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlight((h) =>
                        available.length
                          ? (h - 1 + available.length) % available.length
                          : 0,
                      );
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const s = available[highlight];
                      if (s) pickAdd(s);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setAdding(false);
                    }
                  }}
                  placeholder="Add symbol…"
                  className="h-6 w-full rounded-[2px] border border-terminal-border bg-terminal-elevated px-2 font-mono text-[11px] text-zinc-100 outline-none placeholder:text-terminal-muted focus:border-up/35"
                />
              </div>
              <ul className="max-h-40 overflow-auto py-0.5">
                {available.length === 0 ? (
                  <li className="px-2.5 py-2 text-[11px] text-terminal-muted">
                    {watchlist.length >= UI_SYMBOLS.length
                      ? 'All symbols added'
                      : 'No matches'}
                  </li>
                ) : (
                  available.map((s, i) => {
                    const q = lastQuotes[s];
                    const hi = i === highlight;
                    return (
                      <li key={s}>
                        <button
                          type="button"
                          onMouseEnter={() => setHighlight(i)}
                          onClick={() => pickAdd(s)}
                          className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors ${
                            hi ? 'bg-white/[0.05]' : ''
                          } text-zinc-300`}
                        >
                          <span className="font-mono text-[11px] font-semibold tracking-wide">
                            {s}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-terminal-muted">
                            {q ? fmtPrice(q.last, 2) : '—'}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
