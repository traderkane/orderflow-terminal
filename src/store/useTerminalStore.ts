import { create } from 'zustand';
import { mockFeed } from '../data/mockFeed';
import { binanceFeed } from '../data/binanceFeed';
import type { FeedMode, FeedSnapshot } from '../data/feedTypes';
import type {
  ExchangeId,
  FeedStatus,
  LayoutItem,
  Speed,
  SymbolId,
  WidgetInstance,
  WidgetType,
} from '../types/market';

const LAYOUT_KEY = 'flow-terminal-layout-v4';
const WIDGETS_KEY = 'flow-terminal-widgets-v4';
const FEED_MODE_KEY = 'flow-terminal-feed-mode';

const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: 'chart', type: 'chart' },
  { id: 'footprint', type: 'footprint' },
  { id: 'orderbook', type: 'orderbook' },
  { id: 'trades', type: 'trades' },
  { id: 'heatmap', type: 'heatmap' },
  { id: 'cvd', type: 'cvd' },
  { id: 'volumeProfile', type: 'volumeProfile' },
  { id: 'liquidationMap', type: 'liquidationMap' },
  { id: 'liquidations', type: 'liquidations' },
  { id: 'stats', type: 'stats' },
];

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'chart', x: 0, y: 0, w: 6, h: 12, minW: 4, minH: 7 },
  { i: 'footprint', x: 6, y: 0, w: 4, h: 12, minW: 3, minH: 6 },
  { i: 'orderbook', x: 10, y: 0, w: 2, h: 6, minW: 2, minH: 4 },
  { i: 'trades', x: 10, y: 6, w: 2, h: 6, minW: 2, minH: 4 },
  { i: 'heatmap', x: 0, y: 12, w: 3, h: 6, minW: 3, minH: 4 },
  { i: 'cvd', x: 3, y: 12, w: 3, h: 6, minW: 2, minH: 4 },
  { i: 'volumeProfile', x: 6, y: 12, w: 2, h: 6, minW: 2, minH: 4 },
  { i: 'liquidationMap', x: 8, y: 12, w: 2, h: 6, minW: 2, minH: 4 },
  { i: 'liquidations', x: 10, y: 12, w: 2, h: 6, minW: 2, minH: 3 },
  { i: 'stats', x: 0, y: 18, w: 12, h: 3, minW: 4, minH: 2 },
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

function loadFeedMode(): FeedMode {
  const v = localStorage.getItem(FEED_MODE_KEY);
  if (v === 'mock' || v === 'live') return v;
  return 'live';
}

interface TerminalState {
  symbol: SymbolId;
  exchanges: ExchangeId[];
  speed: Speed;
  status: FeedStatus;
  feedMode: FeedMode;
  feed: FeedSnapshot | null;
  widgets: WidgetInstance[];
  layout: LayoutItem[];
  showVwap: boolean;
  showCvdOverlay: boolean;
  showLiqMarkers: boolean;
  launcherOpen: boolean;

  initFeed: () => () => void;
  setFeedMode: (mode: FeedMode) => void;
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

function stopAll() {
  mockFeed.stop();
  binanceFeed.stop();
}

export const useTerminalStore = create<TerminalState>((set, get) => {
  let unsubData: (() => void) | null = null;
  let unsubStatus: (() => void) | null = null;
  let fallbackArmed = false;

  const cleanupSubs = () => {
    unsubData?.();
    unsubStatus?.();
    unsubData = null;
    unsubStatus = null;
  };

  const attachMock = () => {
    cleanupSubs();
    stopAll();
    mockFeed.setSymbol(get().symbol);
    mockFeed.setExchanges(get().exchanges);
    mockFeed.setSpeed(get().speed);
    unsubData = mockFeed.subscribe((snap) => {
      set({ feed: snap, status: mockFeed.getStatus(), feedMode: 'mock' });
    });
    mockFeed.start();
    set({ status: 'live', feedMode: 'mock' });
  };

  const attachLive = () => {
    cleanupSubs();
    stopAll();
    fallbackArmed = true;
    binanceFeed.setSymbol(get().symbol);
    binanceFeed.setFallbackHandler(() => {
      if (!fallbackArmed) return;
      if (get().feedMode !== 'live') return;
      console.warn('[Flow] Live Binance feed failed — falling back to mock');
      fallbackArmed = false;
      localStorage.setItem(FEED_MODE_KEY, 'mock');
      attachMock();
    });
    unsubStatus = binanceFeed.onStatus((status) => set({ status }));
    unsubData = binanceFeed.subscribe((snap) => {
      set({ feed: snap, status: binanceFeed.getStatus() });
    });
    binanceFeed.start();
    set({ feedMode: 'live', status: 'connecting' });
  };

  return {
    symbol: 'BTC/USD',
    exchanges: ['Binance', 'Bybit', 'OKX'],
    speed: 1,
    status: 'paused',
    feedMode: loadFeedMode(),
    feed: null,
    widgets: loadJson(WIDGETS_KEY, DEFAULT_WIDGETS),
    layout: loadJson(LAYOUT_KEY, DEFAULT_LAYOUT),
    showVwap: true,
    showCvdOverlay: false,
    showLiqMarkers: true,
    launcherOpen: false,

    initFeed: () => {
      const mode = get().feedMode;
      if (mode === 'live') attachLive();
      else attachMock();
      return () => {
        fallbackArmed = false;
        binanceFeed.setFallbackHandler(null);
        cleanupSubs();
        stopAll();
      };
    },

    setFeedMode: (mode) => {
      localStorage.setItem(FEED_MODE_KEY, mode);
      set({ feedMode: mode });
      if (mode === 'live') attachLive();
      else {
        fallbackArmed = false;
        binanceFeed.setFallbackHandler(null);
        attachMock();
      }
    },

    setSymbol: (symbol) => {
      set({ symbol });
      if (get().feedMode === 'live') binanceFeed.setSymbol(symbol);
      else mockFeed.setSymbol(symbol);
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
      const { feedMode } = get();
      if (feedMode === 'live') {
        if (binanceFeed.getStatus() === 'live' || binanceFeed.getStatus() === 'connecting') {
          binanceFeed.stop();
          set({ status: 'paused' });
        } else {
          binanceFeed.start();
          set({ status: 'connecting' });
        }
      } else if (mockFeed.getStatus() === 'live') {
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
  };
});

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
  footprint: {
    title: 'Footprint',
    description: 'Clustered bid/ask volume by price',
  },
  liquidations: { title: 'Liquidations', description: 'Forced order feed' },
  liquidationMap: {
    title: 'Liq Map',
    description: 'Modelled leverage liquidation clusters',
  },
  stats: { title: 'Stats', description: 'Last, funding, OI, spread' },
};
