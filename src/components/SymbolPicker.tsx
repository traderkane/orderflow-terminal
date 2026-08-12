import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { UI_SYMBOLS } from '../data/venues/symbols';
import { fmtPrice } from '../lib/format';
import { useTerminalStore } from '../store/useTerminalStore';
import type { SymbolId } from '../types/market';

function matchesQuery(symbol: SymbolId, q: string) {
  if (!q) return true;
  const n = q.trim().toLowerCase().replace(/\s+/g, '');
  const s = symbol.toLowerCase().replace('/', '');
  return s.includes(n.replace('/', '')) || symbol.toLowerCase().includes(q.trim().toLowerCase());
}

export function SymbolPicker() {
  const symbol = useTerminalStore((s) => s.symbol);
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const lastPrices = useTerminalStore((s) => s.lastPrices);
  const statsLast = useTerminalStore((s) => s.feed?.stats?.last);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => UI_SYMBOLS.filter((s) => matchesQuery(s, query)),
    [query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = Math.max(0, UI_SYMBOLS.indexOf(symbol));
    setHighlight(idx);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, symbol]);

  useEffect(() => {
    setHighlight((h) => (filtered.length ? Math.min(h, filtered.length - 1) : 0));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pick = (s: SymbolId) => {
    setSymbol(s);
    setOpen(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (filtered.length ? (h + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) =>
        filtered.length ? (h - 1 + filtered.length) % filtered.length : 0,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = filtered[highlight];
      if (s) pick(s);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const priceFor = (s: SymbolId) => {
    if (s === symbol && statsLast != null) return statsLast;
    return lastPrices[s];
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="chrome-focus flex h-5 max-w-[7.5rem] items-center gap-1 rounded-[2px] border-0 bg-transparent py-0 pl-0.5 pr-1 font-mono text-[12px] font-semibold tracking-wide text-zinc-100 outline-none hover:bg-white/[0.03] focus:bg-accent/[0.08]"
        aria-label="Symbol"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{symbol}</span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path fill="currentColor" d="M1.5 2.5L4 5.5L6.5 2.5" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-[60] w-[220px] overflow-hidden rounded-[3px] border border-terminal-border bg-[#0a0c10] shadow-2xl shadow-black/50"
          role="listbox"
          aria-label="Symbols"
        >
          <div className="border-b border-terminal-border p-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search symbol…"
              className="chrome-input h-6 w-full rounded-[2px] border border-terminal-border bg-terminal-elevated px-2 font-mono text-[11px] text-zinc-100 outline-none placeholder:text-terminal-muted"
            />
          </div>
          <ul className="max-h-52 overflow-auto py-0.5">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-[11px] text-terminal-muted">No matches</li>
            ) : (
              filtered.map((s, i) => {
                const active = s === symbol;
                const hi = i === highlight;
                const px = priceFor(s);
                return (
                  <li key={s}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(s)}
                      className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors ${
                        hi ? 'bg-white/[0.05]' : ''
                      } ${active ? 'text-zinc-50' : 'text-zinc-300'}`}
                    >
                      <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wide">
                        {active && (
                          <span className="h-1 w-1 rounded-full bg-accent" aria-hidden />
                        )}
                        {!active && <span className="w-1" aria-hidden />}
                        {s}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-terminal-muted">
                        {px != null ? fmtPrice(px, 2) : '—'}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="border-t border-terminal-border px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-terminal-label">
            ↑↓ nav · enter select
          </div>
        </div>
      )}
    </div>
  );
}
