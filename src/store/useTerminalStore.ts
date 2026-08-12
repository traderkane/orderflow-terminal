import { create } from 'zustand';
import { mockFeed, type FeedSnapshot } from '../data/mockFeed';
import type {
  ExchangeId,
  FeedStatus,
  LayoutItem,
  Speed,
  SymbolId,
  WidgetInstance,
  WidgetType,
} from '../types/market';

const LAYOUT_KEY = 'flow-terminal-layout-v2';
const WIDGETS_KEY = 'flow-terminal-widgets-v2';

const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: 'chart', type: 'chart' },
  { id: 'orderbook', type: 'orderbook' },
  { id: 'trades', type: 'trades' },
  { id: 'heatmap', type: 'heatmap' },
  { id: 'cvd', type: 'cvd' },
  { id: 'volumeProfile', type: 'volumeProfile' },
  { id: 'liquidations', type: 'liquidations' },
  { id: 'stats', type: 'stats' },
];

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'chart', x: 0, y: 0, w: 7, h: 12, minW: 4, minH: 7 },
  { i: 'orderbook', x: 7, y: 0, w: 3, h: 12, minW: 2, minH: 6 },
  { i: 'trades', x: 10, y: 0, w: 2, h: 12, minW: 2, minH: 6 },
  { i: 'heatmap', x: 0, y: 12, w: 4, h: 5, minW: 3, minH: 4 },
  { i: 'cvd', x: 4, y: 12, w: 3, h: 5, minW: 2, minH: 4 },
  { i: 'volumeProfile', x: 7, y: 12, w: 3, h: 5, minW: 2, minH: 4 },
  { i: 'liquidations', x: 10, y: 12, w: 2, h: 5, minW: 2, minH: 3 },
  { i: 'stats', x: 0, y: 17, w: 12, h: 3, minW: 4, minH: 2 },
];

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface TerminalState {
  symbol: SymbolId;
  exchanges: ExchangeId[];
  speed: Speed;
  status: FeedStatus;
  feed: FeedSnapshot | null;
  widgets: WidgetInstance[];
  layout: LayoutItem[];
  showVwap: boolean;
  showCvdOverlay: boolean;
  showLiqMarkers: boolean;
  launcherOpen: boolean;

  initFeed: () => () => void;
  setSymbol: (symbol: SymbolId) => void;
  toggleExchange: (ex: ExchangeId) => void;
  setSpeed: (speed: Speed) => void;
  toggleFeed: () => void;
  setLayout: (layout: LayoutItem[]) => void;
  resetLayout: () => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  setShowVwap: (v: boolean) => void;
  setShowCvdOverlay: (v: boolean) => void;
  setShowLiqMarkers: (v: boolean) => void;
  setLauncherOpen: (v: boolean) => void;
}

function persist(widgets: WidgetInstance[], layout: LayoutItem[]) {
  localStorage.setItem(WIDGETS_KEY, JSON.stringify(widgets));
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  symbol: 'BTC/USD',
  exchanges: ['Binance', 'Bybit', 'OKX'],
  speed: 1,
  status: 'paused',
  feed: null,
  widgets: loadJson(WIDGETS_KEY, DEFAULT_WIDGETS),
  layout: loadJson(LAYOUT_KEY, DEFAULT_LAYOUT),
  showVwap: true,
  showCvdOverlay: false,
  showLiqMarkers: true,
  launcherOpen: false,

  initFeed: () => {
    const unsub = mockFeed.subscribe((snap) => {
      set({ feed: snap, status: mockFeed.getStatus() });
    });
    mockFeed.start();
    set({ status: 'live' });
    return () => {
      unsub();
      mockFeed.stop();
    };
  },

  setSymbol: (symbol) => {
    mockFeed.setSymbol(symbol);
    set({ symbol });
  },

  toggleExchange: (ex) => {
    const cur = get().exchanges;
    const next = cur.includes(ex) ? cur.filter((e) => e !== ex) : [...cur, ex];
    const exchanges = next.length ? next : cur;
    mockFeed.setExchanges(exchanges);
    set({ exchanges });
  },

  setSpeed: (speed) => {
    mockFeed.setSpeed(speed);
    set({ speed });
  },

  toggleFeed: () => {
    if (mockFeed.getStatus() === 'live') {
      mockFeed.stop();
      set({ status: 'paused' });
    } else {
      mockFeed.start();
      set({ status: 'live' });
    }
  },

  setLayout: (layout) => {
    set({ layout });
    persist(get().widgets, layout);
  },

  resetLayout: () => {
    set({ widgets: DEFAULT_WIDGETS, layout: DEFAULT_LAYOUT });
    persist(DEFAULT_WIDGETS, DEFAULT_LAYOUT);
  },

  addWidget: (type) => {
    const id = `${type}_${Date.now().toString(36)}`;
    const widgets = [...get().widgets, { id, type }];
    const layout = [
      ...get().layout,
      { i: id, x: 0, y: Infinity, w: 4, h: 6, minW: 2, minH: 3 },
    ];
    set({ widgets, layout, launcherOpen: false });
    persist(widgets, layout);
  },

  removeWidget: (id) => {
    const widgets = get().widgets.filter((w) => w.id !== id);
    const layout = get().layout.filter((l) => l.i !== id);
    set({ widgets, layout });
    persist(widgets, layout);
  },

  setShowVwap: (showVwap) => set({ showVwap }),
  setShowCvdOverlay: (showCvdOverlay) => set({ showCvdOverlay }),
  setShowLiqMarkers: (showLiqMarkers) => set({ showLiqMarkers }),
  setLauncherOpen: (launcherOpen) => set({ launcherOpen }),
}));

export const WIDGET_META: Record<
  WidgetType,
  { title: string; description: string }
> = {
  chart: { title: 'Chart', description: 'Candles, volume, VWAP / CVD / liqs' },
  orderbook: { title: 'Order Book', description: 'DOM bids/asks with depth' },
  trades: { title: 'Trades Tape', description: 'Aggressor buy/sell tape' },
  heatmap: { title: 'Book Heatmap', description: 'Time × price liquidity' },
  cvd: { title: 'CVD / Delta', description: 'Cumulative volume delta' },
  volumeProfile: { title: 'Volume Profile', description: 'VPVR-style profile' },
  liquidations: { title: 'Liquidations', description: 'Forced order feed' },
  stats: { title: 'Stats', description: 'Last, funding, OI, spread' },
};
