import { create } from 'zustand';
import { mockFeed } from '../data/mockFeed';
import { liveFeed } from '../data/liveFeed';
import type { FeedMode, FeedSnapshot } from '../data/feedTypes';
import type {
  AlertFire,
  AlertCondition,
  ExchangeId,
  FeedStatus,
  LayoutItem,
  LayoutTemplate,
  PanelId,
  PriceAlert,
  Speed,
  SymbolId,
  ToastItem,
  WidgetInstance,
  WidgetType,
} from '../types/market';
import {
  alertMessage,
  crossedThreshold,
  notifyBrowser,
  readMetric,
} from '../lib/alerts';
import { BUILTIN_TEMPLATES } from '../lib/layoutPresets';
import {
  loadChartInterval,
  persistChartInterval,
  type ChartInterval,
} from '../lib/chartIntervals';
import {
  loadChartMode,
  persistChartMode,
  type ChartMode,
} from '../lib/chartMode';
import {
  loadVwapAnchors,
  persistVwapAnchors,
  type VwapAnchor,
} from '../lib/vwap';
import {
  loadBarStatsMetric,
  loadShowBarStats,
  persistBarStatsMetric,
  persistShowBarStats,
  type BarStatsMetric,
} from '../lib/barStats';
import {
  loadVolumePaneMode,
  persistVolumePaneMode,
  type VolumePaneMode,
} from '../lib/tradeCount';
import {
  loadChartLayers,
  persistChartLayers,
} from '../lib/chartLayers';

const LAYOUT_KEY = 'flow-terminal-layout-v6';
const WIDGETS_KEY = 'flow-terminal-widgets-v6';
const FEED_MODE_KEY = 'flow-terminal-feed-mode';
const ALERTS_KEY = 'flow-terminal-alerts-v1';
const ALERT_HISTORY_KEY = 'flow-terminal-alert-history-v1';
const TEMPLATES_KEY = 'flow-terminal-templates-v1';

const MAX_ALERT_HISTORY = 40;
const MAX_TOASTS = 5;

/** Default = Scalp-like: chart-first workspace, DOM+tape tight right, secondary strip. */
const DEFAULT_WIDGETS: WidgetInstance[] = [
  { id: 'chart', type: 'chart' },
  { id: 'orderbook', type: 'orderbook' },
  { id: 'trades', type: 'trades' },
  { id: 'heatmap', type: 'heatmap' },
  { id: 'cvd', type: 'cvd' },
  { id: 'liquidations', type: 'liquidations' },
  { id: 'stats', type: 'stats' },
];

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'chart', x: 0, y: 0, w: 8, h: 18, minW: 5, minH: 8 },
  { i: 'orderbook', x: 8, y: 0, w: 2, h: 18, minW: 2, minH: 6 },
  { i: 'trades', x: 10, y: 0, w: 2, h: 18, minW: 2, minH: 6 },
  { i: 'heatmap', x: 0, y: 18, w: 4, h: 5, minW: 3, minH: 4 },
  { i: 'cvd', x: 4, y: 18, w: 3, h: 5, minW: 2, minH: 4 },
  { i: 'liquidations', x: 7, y: 18, w: 3, h: 5, minW: 2, minH: 3 },
  { i: 'stats', x: 10, y: 18, w: 2, h: 5, minW: 2, minH: 2 },
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

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

interface TerminalState {
  symbol: SymbolId;
  exchanges: ExchangeId[];
  speed: Speed;
  status: FeedStatus;
  venueStatus: Record<ExchangeId, FeedStatus>;
  feedMode: FeedMode;
  chartInterval: ChartInterval;
  chartMode: ChartMode;
  feed: FeedSnapshot | null;
  widgets: WidgetInstance[];
  layout: LayoutItem[];
  showVwap: boolean;
  vwapAnchors: VwapAnchor[];
  showBarStats: boolean;
  barStatsMetric: BarStatsMetric;
  volumePaneMode: VolumePaneMode;
  showCvdOverlay: boolean;
  showLiqMarkers: boolean;
  showHeatmap: boolean;
  showProfile: boolean;
  showBubbles: boolean;
  chartMaximized: boolean;
  launcherOpen: boolean;
  openPanel: PanelId;

  /** Shared chart↔DOM hover price (null when not hovering). */
  hoverPrice: number | null;
  /** Who last set hoverPrice — chart draws a sync line only for 'dom'. */
  hoverSource: 'chart' | 'dom' | null;
  setHoverPrice: (price: number | null, source?: 'chart' | 'dom' | null) => void;

  alerts: PriceAlert[];
  alertHistory: AlertFire[];
  userTemplates: LayoutTemplate[];
  toasts: ToastItem[];

  initFeed: () => () => void;
  setFeedMode: (mode: FeedMode) => void;
  setChartInterval: (interval: ChartInterval) => void;
  setChartMode: (mode: ChartMode) => void;
  setSymbol: (symbol: SymbolId) => void;
  toggleExchange: (ex: ExchangeId) => void;
  setSpeed: (speed: Speed) => void;
  toggleFeed: () => void;
  setLayout: (layout: LayoutItem[]) => void;
  resetLayout: () => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  setShowVwap: (v: boolean) => void;
  setVwapAnchors: (anchors: VwapAnchor[]) => void;
  setShowBarStats: (v: boolean) => void;
  setBarStatsMetric: (m: BarStatsMetric) => void;
  setVolumePaneMode: (m: VolumePaneMode) => void;
  setShowCvdOverlay: (v: boolean) => void;
  setShowLiqMarkers: (v: boolean) => void;
  setShowHeatmap: (v: boolean) => void;
  setShowProfile: (v: boolean) => void;
  setShowBubbles: (v: boolean) => void;
  setChartMaximized: (v: boolean) => void;
  toggleChartMaximized: () => void;
  setLauncherOpen: (v: boolean) => void;
  setOpenPanel: (panel: PanelId) => void;

  addAlert: (input: {
    symbol: SymbolId;
    condition: AlertCondition;
    threshold: number;
    note?: string;
  }) => void;
  deleteAlert: (id: string) => void;
  toggleAlertEnabled: (id: string) => void;
  rearmAlert: (id: string) => void;
  clearAlertHistory: () => void;
  evaluateAlerts: (snap: FeedSnapshot) => void;

  saveTemplate: (name: string) => void;
  loadTemplate: (id: string) => void;
  deleteTemplate: (id: string) => void;
  getAllTemplates: () => LayoutTemplate[];

  pushToast: (toast: Omit<ToastItem, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;
}

function persist(widgets: WidgetInstance[], layout: LayoutItem[]) {
  localStorage.setItem(WIDGETS_KEY, JSON.stringify(widgets));
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function persistAlerts(alerts: PriceAlert[]) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

function persistHistory(history: AlertFire[]) {
  localStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(history));
}

function persistTemplates(templates: LayoutTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

function stopAll() {
  mockFeed.stop();
  liveFeed.stop();
}

/** Prior metric samples for cross detection, keyed by alert id. */
const prevMetrics = new Map<string, number>();

const initialLayers = loadChartLayers();

export const useTerminalStore = create<TerminalState>((set, get) => {
  let unsubData: (() => void) | null = null;
  let unsubStatus: (() => void) | null = null;
  let unsubVenueStatus: (() => void) | null = null;
  let fallbackArmed = false;

  const cleanupSubs = () => {
    unsubData?.();
    unsubStatus?.();
    unsubVenueStatus?.();
    unsubData = null;
    unsubStatus = null;
    unsubVenueStatus = null;
  };

  const onSnap = (snap: FeedSnapshot, extras?: Partial<TerminalState>) => {
    set({ feed: snap, ...extras });
    get().evaluateAlerts(snap);
  };

  const attachMock = () => {
    cleanupSubs();
    stopAll();
    mockFeed.setSymbol(get().symbol);
    mockFeed.setExchanges(get().exchanges);
    mockFeed.setSpeed(get().speed);
    mockFeed.setChartInterval(get().chartInterval);
    unsubData = mockFeed.subscribe((snap) => {
      onSnap(snap, { status: mockFeed.getStatus(), feedMode: 'mock' });
    });
    mockFeed.start();
    set({
      status: 'live',
      feedMode: 'mock',
      venueStatus: { Binance: 'paused', Bybit: 'paused', OKX: 'paused' },
    });
  };

  const attachLive = () => {
    cleanupSubs();
    stopAll();
    fallbackArmed = true;
    liveFeed.setChartInterval(get().chartInterval);
    liveFeed.setSymbol(get().symbol);
    liveFeed.setFallbackHandler(() => {
      if (!fallbackArmed) return;
      if (get().feedMode !== 'live') return;
      console.warn('[Flow] Live multi-venue feed failed — falling back to mock');
      fallbackArmed = false;
      localStorage.setItem(FEED_MODE_KEY, 'mock');
      attachMock();
    });
    liveFeed.setExchanges(get().exchanges);
    unsubStatus = liveFeed.onStatus((status) => set({ status }));
    unsubVenueStatus = liveFeed.onVenueStatus((venueStatus) => set({ venueStatus }));
    unsubData = liveFeed.subscribe((snap) => {
      onSnap(snap, { status: liveFeed.getStatus() });
    });
    liveFeed.start();
    set({ feedMode: 'live', status: 'connecting' });
  };

  return {
    symbol: 'BTC/USD',
    exchanges: ['Binance', 'Bybit', 'OKX'],
    speed: 1,
    status: 'paused',
    venueStatus: { Binance: 'paused', Bybit: 'paused', OKX: 'paused' },
    feedMode: loadFeedMode(),
    chartInterval: loadChartInterval(),
    chartMode: loadChartMode(),
    feed: null,
    widgets: loadJson(WIDGETS_KEY, DEFAULT_WIDGETS),
    layout: loadJson(LAYOUT_KEY, DEFAULT_LAYOUT),
    showVwap: initialLayers.vwap,
    vwapAnchors: loadVwapAnchors(),
    showBarStats: loadShowBarStats(),
    barStatsMetric: loadBarStatsMetric(),
    volumePaneMode: loadVolumePaneMode(),
    showCvdOverlay: initialLayers.cvd,
    showLiqMarkers: initialLayers.liqs,
    showHeatmap: initialLayers.heatmap,
    showProfile: initialLayers.profile,
    showBubbles: initialLayers.bubbles,
    chartMaximized: false,
    launcherOpen: false,
    openPanel: null,

    hoverPrice: null,
    hoverSource: null,

    alerts: loadJson<PriceAlert[]>(ALERTS_KEY, []),
    alertHistory: loadJson<AlertFire[]>(ALERT_HISTORY_KEY, []),
    userTemplates: loadJson<LayoutTemplate[]>(TEMPLATES_KEY, []),
    toasts: [],

    initFeed: () => {
      const mode = get().feedMode;
      if (mode === 'live') attachLive();
      else attachMock();
      return () => {
        fallbackArmed = false;
        liveFeed.setFallbackHandler(null);
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
        liveFeed.setFallbackHandler(null);
        attachMock();
      }
    },

    setChartInterval: (interval) => {
      persistChartInterval(interval);
      set({ chartInterval: interval });
      if (get().feedMode === 'live') liveFeed.setChartInterval(interval);
      else mockFeed.setChartInterval(interval);
    },

    setChartMode: (mode) => {
      persistChartMode(mode);
      set({ chartMode: mode });
    },

    setSymbol: (symbol) => {
      set({ symbol, hoverPrice: null, hoverSource: null });
      prevMetrics.clear();
      if (get().feedMode === 'live') liveFeed.setSymbol(symbol);
      else mockFeed.setSymbol(symbol);
    },

    toggleExchange: (ex) => {
      const cur = get().exchanges;
      const next = cur.includes(ex) ? cur.filter((e) => e !== ex) : [...cur, ex];
      const exchanges = next.length ? next : cur;
      mockFeed.setExchanges(exchanges);
      if (get().feedMode === 'live') liveFeed.setExchanges(exchanges);
      set({ exchanges });
    },

    setSpeed: (speed) => {
      mockFeed.setSpeed(speed);
      set({ speed });
    },

    toggleFeed: () => {
      const { feedMode } = get();
      if (feedMode === 'live') {
        if (liveFeed.getStatus() === 'live' || liveFeed.getStatus() === 'connecting') {
          liveFeed.stop();
          set({ status: 'paused' });
        } else {
          liveFeed.start();
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

    setShowVwap: (showVwap) => {
      persistChartLayers({ ...loadChartLayers(), vwap: showVwap });
      set({ showVwap });
    },
    setVwapAnchors: (vwapAnchors) => {
      persistVwapAnchors(vwapAnchors);
      set({ vwapAnchors });
    },
    setShowBarStats: (showBarStats) => {
      persistShowBarStats(showBarStats);
      set({ showBarStats });
    },
    setBarStatsMetric: (barStatsMetric) => {
      persistBarStatsMetric(barStatsMetric);
      set({ barStatsMetric });
    },
    setVolumePaneMode: (volumePaneMode) => {
      persistVolumePaneMode(volumePaneMode);
      set({ volumePaneMode });
    },
    setShowCvdOverlay: (showCvdOverlay) => {
      persistChartLayers({ ...loadChartLayers(), cvd: showCvdOverlay });
      set({ showCvdOverlay });
    },
    setShowLiqMarkers: (showLiqMarkers) => {
      persistChartLayers({ ...loadChartLayers(), liqs: showLiqMarkers });
      set({ showLiqMarkers });
    },
    setShowHeatmap: (showHeatmap) => {
      persistChartLayers({ ...loadChartLayers(), heatmap: showHeatmap });
      set({ showHeatmap });
    },
    setShowProfile: (showProfile) => {
      persistChartLayers({ ...loadChartLayers(), profile: showProfile });
      set({ showProfile });
    },
    setShowBubbles: (showBubbles) => {
      persistChartLayers({ ...loadChartLayers(), bubbles: showBubbles });
      set({ showBubbles });
    },
    setChartMaximized: (chartMaximized) => set({ chartMaximized }),
    toggleChartMaximized: () =>
      set((s) => ({ chartMaximized: !s.chartMaximized })),
    setLauncherOpen: (launcherOpen) => set({ launcherOpen, openPanel: launcherOpen ? null : get().openPanel }),
    setOpenPanel: (openPanel) =>
      set({ openPanel, launcherOpen: openPanel ? false : get().launcherOpen }),

    setHoverPrice: (price, source = null) => {
      const cur = get();
      const nextSource = price == null ? null : (source ?? cur.hoverSource ?? 'chart');
      if (price == null) {
        if (cur.hoverPrice == null && cur.hoverSource == null) return;
        set({ hoverPrice: null, hoverSource: null });
        return;
      }
      if (
        cur.hoverSource === nextSource &&
        cur.hoverPrice != null &&
        Math.abs(cur.hoverPrice - price) < 1e-10
      ) {
        return;
      }
      set({ hoverPrice: price, hoverSource: nextSource });
    },

    addAlert: ({ symbol, condition, threshold, note }) => {
      const alert: PriceAlert = {
        id: uid('alert'),
        symbol,
        condition,
        threshold,
        enabled: true,
        triggered: false,
        createdAt: Date.now(),
        note: note?.trim() || undefined,
      };
      const alerts = [alert, ...get().alerts];
      set({ alerts });
      persistAlerts(alerts);
    },

    deleteAlert: (id) => {
      const alerts = get().alerts.filter((a) => a.id !== id);
      prevMetrics.delete(id);
      set({ alerts });
      persistAlerts(alerts);
    },

    toggleAlertEnabled: (id) => {
      const alerts = get().alerts.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a,
      );
      set({ alerts });
      persistAlerts(alerts);
    },

    rearmAlert: (id) => {
      const alerts = get().alerts.map((a) =>
        a.id === id
          ? { ...a, enabled: true, triggered: false, triggeredAt: undefined }
          : a,
      );
      prevMetrics.delete(id);
      set({ alerts });
      persistAlerts(alerts);
    },

    clearAlertHistory: () => {
      set({ alertHistory: [] });
      persistHistory([]);
    },

    evaluateAlerts: (snap) => {
      const stats = snap.stats;
      if (!stats) return;
      const active = get().alerts.filter(
        (a) => a.enabled && !a.triggered && a.symbol === snap.symbol,
      );
      if (!active.length) return;

      let alerts = get().alerts;
      let history = get().alertHistory;
      let fired = false;

      for (const alert of active) {
        const curr = readMetric(stats, alert.condition);
        const prev = prevMetrics.has(alert.id) ? prevMetrics.get(alert.id)! : null;
        prevMetrics.set(alert.id, curr);

        if (!crossedThreshold(alert.condition, prev, curr, alert.threshold)) continue;

        const now = Date.now();
        const message = alertMessage(alert, curr);
        const fire: AlertFire = {
          id: uid('fire'),
          alertId: alert.id,
          symbol: alert.symbol,
          condition: alert.condition,
          threshold: alert.threshold,
          value: curr,
          firedAt: now,
          message,
        };

        alerts = alerts.map((a) =>
          a.id === alert.id ? { ...a, triggered: true, triggeredAt: now, enabled: false } : a,
        );
        history = [fire, ...history].slice(0, MAX_ALERT_HISTORY);
        fired = true;

        get().pushToast({
          kind: 'alert',
          title: 'Alert triggered',
          body: message,
        });
        notifyBrowser('Flow Terminal', message);
      }

      if (fired) {
        set({ alerts, alertHistory: history });
        persistAlerts(alerts);
        persistHistory(history);
      }
    },

    saveTemplate: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const tpl: LayoutTemplate = {
        id: uid('tpl'),
        name: trimmed,
        builtIn: false,
        widgets: structuredClone(get().widgets),
        layout: structuredClone(get().layout),
        createdAt: Date.now(),
      };
      const userTemplates = [tpl, ...get().userTemplates];
      set({ userTemplates });
      persistTemplates(userTemplates);
      get().pushToast({ kind: 'info', title: 'Layout saved', body: `"${trimmed}" stored locally` });
    },

    loadTemplate: (id) => {
      const tpl =
        BUILTIN_TEMPLATES.find((t) => t.id === id) ??
        get().userTemplates.find((t) => t.id === id);
      if (!tpl) return;
      const widgets = structuredClone(tpl.widgets);
      const layout = structuredClone(tpl.layout);
      set({ widgets, layout });
      persist(widgets, layout);
      get().pushToast({ kind: 'info', title: 'Layout loaded', body: `"${tpl.name}" applied` });
    },

    deleteTemplate: (id) => {
      if (id.startsWith('builtin-')) return;
      const userTemplates = get().userTemplates.filter((t) => t.id !== id);
      set({ userTemplates });
      persistTemplates(userTemplates);
    },

    getAllTemplates: () => [...BUILTIN_TEMPLATES, ...get().userTemplates],

    pushToast: (toast) => {
      const item: ToastItem = {
        ...toast,
        id: uid('toast'),
        createdAt: Date.now(),
      };
      set({ toasts: [item, ...get().toasts].slice(0, MAX_TOASTS) });
    },

    dismissToast: (id) => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
  };
});

export const WIDGET_META: Record<
  WidgetType,
  { title: string; description: string }
> = {
  chart: { title: 'Chart', description: 'Workspace chart — drawings, heatmap, VPVR, bubbles, session VWAP, bar stats, CVD / liqs' },
  orderbook: { title: 'Order Book', description: 'DOM ladder with cumulative depth' },
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
  tpo: {
    title: 'TPO / Profile',
    description: 'Time Price Opportunity market profile',
  },
  stats: { title: 'Stats', description: 'Last, funding, OI, spread' },
};
