import { useEffect, useMemo, useRef, useState } from 'react';
import type { SymbolId } from '../types/market';
import { fuzzyFilter } from '../lib/fuzzy';
import {
  LAYOUT_TAB_DEFAULT_ID,
  LAYOUT_TAB_PROFILE_ID,
  LAYOUT_TAB_SCALP_ID,
  useTerminalStore,
  LAUNCHABLE_WIDGET_TYPES,
  WIDGET_META,
} from '../store/useTerminalStore';

type Category =
  | 'Symbol'
  | 'Layout'
  | 'Panel'
  | 'Widget'
  | 'Chart'
  | 'Layer'
  | 'Workspace';

interface PaletteAction {
  id: string;
  category: Category;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

const WIDGET_TYPES = LAUNCHABLE_WIDGET_TYPES;
const SYMBOLS: SymbolId[] = ['BTC/USD', 'ETH/USD'];

const CATEGORY_ORDER: Category[] = [
  'Symbol',
  'Layout',
  'Panel',
  'Widget',
  'Chart',
  'Layer',
  'Workspace',
];

function layerHint(on: boolean) {
  return on ? 'On — click to hide' : 'Off — click to show';
}

export function CommandPalette() {
  const open = useTerminalStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useTerminalStore((s) => s.setCommandPaletteOpen);
  const symbol = useTerminalStore((s) => s.symbol);
  const chartMode = useTerminalStore((s) => s.chartMode);
  const showVwap = useTerminalStore((s) => s.showVwap);
  const showCvdOverlay = useTerminalStore((s) => s.showCvdOverlay);
  const showLiqMarkers = useTerminalStore((s) => s.showLiqMarkers);
  const showHeatmap = useTerminalStore((s) => s.showHeatmap);
  const showProfile = useTerminalStore((s) => s.showProfile);
  const showBubbles = useTerminalStore((s) => s.showBubbles);
  const userTemplates = useTerminalStore((s) => s.userTemplates);
  const activeLayoutId = useTerminalStore((s) => s.activeLayoutId);

  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const applyLayoutTab = useTerminalStore((s) => s.applyLayoutTab);
  const setOpenPanel = useTerminalStore((s) => s.setOpenPanel);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);
  const addWidget = useTerminalStore((s) => s.addWidget);
  const setChartMode = useTerminalStore((s) => s.setChartMode);
  const setShowVwap = useTerminalStore((s) => s.setShowVwap);
  const setShowCvdOverlay = useTerminalStore((s) => s.setShowCvdOverlay);
  const setShowLiqMarkers = useTerminalStore((s) => s.setShowLiqMarkers);
  const setShowHeatmap = useTerminalStore((s) => s.setShowHeatmap);
  const setShowProfile = useTerminalStore((s) => s.setShowProfile);
  const setShowBubbles = useTerminalStore((s) => s.setShowBubbles);
  const resetLayout = useTerminalStore((s) => s.resetLayout);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const actions = useMemo<PaletteAction[]>(() => {
    const close = () => setCommandPaletteOpen(false);
    const list: PaletteAction[] = [];

    for (const sym of SYMBOLS) {
      list.push({
        id: `symbol:${sym}`,
        category: 'Symbol',
        label: `Switch to ${sym}`,
        hint: symbol === sym ? 'Active' : undefined,
        keywords: `symbol pair ${sym}`,
        run: () => {
          setSymbol(sym);
          close();
        },
      });
    }

    const layouts: { id: string; name: string }[] = [
      { id: LAYOUT_TAB_SCALP_ID, name: 'Scalp' },
      { id: LAYOUT_TAB_PROFILE_ID, name: 'Profile' },
      { id: LAYOUT_TAB_DEFAULT_ID, name: 'Default' },
      ...userTemplates.map((t) => ({ id: t.id, name: t.name })),
    ];
    for (const layout of layouts) {
      list.push({
        id: `layout:${layout.id}`,
        category: 'Layout',
        label: `Load ${layout.name}`,
        hint: activeLayoutId === layout.id ? 'Active' : 'Layout',
        keywords: `layout template workspace ${layout.name}`,
        run: () => {
          applyLayoutTab(layout.id);
          close();
        },
      });
    }

    list.push(
      {
        id: 'panel:alerts',
        category: 'Panel',
        label: 'Open Alerts',
        hint: 'Drawer',
        keywords: 'alerts notifications panel drawer',
        run: () => {
          setOpenPanel('alerts');
          close();
        },
      },
      {
        id: 'panel:layouts',
        category: 'Panel',
        label: 'Open Layouts',
        hint: 'Drawer',
        keywords: 'layouts templates panel drawer',
        run: () => {
          setOpenPanel('layouts');
          close();
        },
      },
      {
        id: 'panel:launcher',
        category: 'Panel',
        label: 'Open widget launcher',
        hint: 'Add panel',
        keywords: 'add widget launcher',
        run: () => {
          setLauncherOpen(true);
          close();
        },
      },
    );

    for (const type of WIDGET_TYPES) {
      const meta = WIDGET_META[type];
      list.push({
        id: `widget:${type}`,
        category: 'Widget',
        label: `Add ${meta.title}`,
        hint: meta.description,
        keywords: `widget add ${type} ${meta.title} ${meta.description}`,
        run: () => {
          addWidget(type);
          close();
        },
      });
    }

    list.push(
      {
        id: 'chart:candles',
        category: 'Chart',
        label: 'Chart mode: Candles',
        hint: chartMode === 'candles' ? 'Active' : 'Switch',
        keywords: 'chart mode candles ohlc',
        run: () => {
          setChartMode('candles');
          close();
        },
      },
      {
        id: 'chart:footprint',
        category: 'Chart',
        label: 'Chart mode: Footprint',
        hint: chartMode === 'footprint' ? 'Active' : 'Switch',
        keywords: 'chart mode footprint cluster',
        run: () => {
          setChartMode('footprint');
          close();
        },
      },
    );

    list.push(
      {
        id: 'layer:vwap',
        category: 'Layer',
        label: 'Toggle VWAP',
        hint: layerHint(showVwap),
        keywords: 'layer vwap overlay',
        run: () => {
          setShowVwap(!showVwap);
          close();
        },
      },
      {
        id: 'layer:cvd',
        category: 'Layer',
        label: 'Toggle CVD overlay',
        hint: layerHint(showCvdOverlay),
        keywords: 'layer cvd delta overlay',
        run: () => {
          setShowCvdOverlay(!showCvdOverlay);
          close();
        },
      },
      {
        id: 'layer:liqs',
        category: 'Layer',
        label: 'Toggle liq markers',
        hint: layerHint(showLiqMarkers),
        keywords: 'layer liquidations markers',
        run: () => {
          setShowLiqMarkers(!showLiqMarkers);
          close();
        },
      },
      {
        id: 'layer:heatmap',
        category: 'Layer',
        label: 'Toggle heatmap',
        hint: layerHint(showHeatmap),
        keywords: 'layer heatmap book',
        run: () => {
          setShowHeatmap(!showHeatmap);
          close();
        },
      },
      {
        id: 'layer:profile',
        category: 'Layer',
        label: 'Toggle volume profile',
        hint: layerHint(showProfile),
        keywords: 'layer profile vpvr volume',
        run: () => {
          setShowProfile(!showProfile);
          close();
        },
      },
      {
        id: 'layer:bubbles',
        category: 'Layer',
        label: 'Toggle bubbles',
        hint: layerHint(showBubbles),
        keywords: 'layer bubbles trades',
        run: () => {
          setShowBubbles(!showBubbles);
          close();
        },
      },
    );

    list.push({
      id: 'workspace:reset',
      category: 'Workspace',
      label: 'Reset layout',
      hint: 'Default workspace',
      keywords: 'reset layout default workspace',
      run: () => {
        resetLayout();
        close();
      },
    });

    return list;
  }, [
    symbol,
    chartMode,
    showVwap,
    showCvdOverlay,
    showLiqMarkers,
    showHeatmap,
    showProfile,
    showBubbles,
    userTemplates,
    activeLayoutId,
    setCommandPaletteOpen,
    setSymbol,
    applyLayoutTab,
    setOpenPanel,
    setLauncherOpen,
    addWidget,
    setChartMode,
    setShowVwap,
    setShowCvdOverlay,
    setShowLiqMarkers,
    setShowHeatmap,
    setShowProfile,
    setShowBubbles,
    resetLayout,
  ]);

  const filtered = useMemo(() => {
    const hits = fuzzyFilter(
      actions,
      query,
      (a) => `${a.label} ${a.hint ?? ''} ${a.keywords ?? ''} ${a.category}`,
    );
    // Keep category order stable among equal-ish empty-query results.
    if (!query.trim()) {
      return [...hits].sort(
        (a, b) =>
          CATEGORY_ORDER.indexOf(a.item.category) -
            CATEGORY_ORDER.indexOf(b.item.category) ||
          a.item.label.localeCompare(b.item.label),
      );
    }
    return hits;
  }, [actions, query]);

  const items = filtered.map((h) => h.item);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, open, items.length]);

  if (!open) return null;

  const runSelected = () => {
    const action = items[selected];
    if (!action) return;
    action.run();
  };

  let lastCategory: Category | null = null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-3 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setCommandPaletteOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-[2px] border border-terminal-border bg-terminal-chrome shadow-2xl"
      >
        <div className="flex h-9 items-center gap-2 border-b border-terminal-border px-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-terminal-label">
            ⌘K
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((i) => (items.length ? (i + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((i) =>
                  items.length ? (i - 1 + items.length) % items.length : 0,
                );
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runSelected();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setCommandPaletteOpen(false);
              }
            }}
            placeholder="Search symbols, layouts, widgets, layers…"
            className="h-7 min-w-0 flex-1 bg-transparent font-mono text-[12px] text-zinc-100 outline-none placeholder:text-terminal-label"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded-[2px] border border-terminal-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-terminal-muted sm:inline">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[min(52vh,28rem)] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center font-mono text-[11px] text-terminal-muted">
              No matching commands
            </div>
          ) : (
            items.map((action, idx) => {
              const showCat = action.category !== lastCategory;
              lastCategory = action.category;
              const active = idx === selected;
              return (
                <div key={action.id}>
                  {showCat && (
                    <div className="px-2.5 pb-0.5 pt-2 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-terminal-label">
                      {action.category}
                    </div>
                  )}
                  <button
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => action.run()}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
                      active
                        ? 'bg-up/[0.1] text-zinc-50'
                        : 'text-zinc-300 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                      {action.label}
                    </span>
                    {action.hint && (
                      <span
                        className={`max-w-[45%] shrink-0 truncate font-mono text-[10px] ${
                          active ? 'text-up/80' : 'text-terminal-muted'
                        }`}
                      >
                        {action.hint}
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex h-6 items-center gap-3 border-t border-terminal-border px-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-terminal-label">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
