export type SymbolId = 'BTC/USD' | 'ETH/USD';
export type ExchangeId = 'Binance' | 'Bybit' | 'OKX';
export type FeedStatus = 'connecting' | 'live' | 'paused' | 'error';
export type Speed = 1 | 2;

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id: string;
  time: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  exchange: ExchangeId;
}

export interface BookLevel {
  price: number;
  size: number;
  total: number;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
  spread: number;
  mid: number;
}

export interface Liquidation {
  id: string;
  time: number;
  price: number;
  size: number;
  side: 'long' | 'short';
  exchange: ExchangeId;
}

export interface LiquidationMapLevel {
  price: number;
  /** Estimated long-liquidation density if price falls here */
  longDensity: number;
  /** Estimated short-liquidation density if price rises here */
  shortDensity: number;
}

/** Modelled leverage-ladder liquidation density (not exchange-proprietary). */
export interface LiquidationMap {
  mark: number;
  levels: LiquidationMapLevel[];
  maxDensity: number;
}

export interface VwapPoint {
  time: number;
  value: number;
}

export interface CvdPoint {
  time: number;
  value: number;
  delta: number;
}

export interface HeatmapFrame {
  time: number;
  /** price buckets from low to high */
  prices: number[];
  /** bid liquidity intensity 0..1 */
  bids: number[];
  /** ask liquidity intensity 0..1 */
  asks: number[];
}

export interface VolumeProfileBin {
  price: number;
  buyVolume: number;
  sellVolume: number;
  total: number;
}

/** Price-level cell inside a footprint bar (aggressor buy/sell volumes). */
export interface FootprintLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
}

/** Candle-aligned clustered volume / footprint column. */
export interface FootprintBar {
  time: number;
  levels: FootprintLevel[];
  buyVolume: number;
  sellVolume: number;
  delta: number;
}

export interface MarketStats {
  last: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  fundingRate: number;
  openInterest: number;
  spread: number;
  mid: number;
}


/** One price row in a TPO / Market Profile. */
export interface TpoLevel {
  price: number;
  letters: string[];
  count: number;
  inValueArea: boolean;
  isPoc: boolean;
}

/** Session (or rolling-window) Time Price Opportunity profile. */
export interface TpoProfile {
  levels: TpoLevel[];
  periods: { letter: string; startTime: number; endTime: number }[];
  poc: number;
  vah: number;
  val: number;
  totalPrints: number;
  periodSec: number;
  tick: number;
  startTime: number;
  endTime: number;
}

export type WidgetType =
  | 'chart'
  | 'orderbook'
  | 'trades'
  | 'heatmap'
  | 'cvd'
  | 'volumeProfile'
  | 'footprint'
  | 'liquidations'
  | 'liquidationMap'
  | 'tpo'
  | 'stats'
  /** Hosts multiple child widget types behind one chrome frame with tabs. */
  | 'tabDock';

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  /** Ordered child panels when type === 'tabDock' (never nested tabDocks). */
  tabs?: WidgetType[];
  /** Index into `tabs` for the visible child. */
  activeTab?: number;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

/** Alert condition kinds. Price is primary; funding/OI optional. */
export type AlertCondition =
  | 'price_above'
  | 'price_below'
  | 'funding_above'
  | 'funding_below'
  | 'oi_above'
  | 'oi_below';

export interface PriceAlert {
  id: string;
  symbol: SymbolId;
  condition: AlertCondition;
  threshold: number;
  enabled: boolean;
  /** Latched after a fire until user re-arms */
  triggered: boolean;
  createdAt: number;
  triggeredAt?: number;
  note?: string;
}

export interface AlertFire {
  id: string;
  alertId: string;
  symbol: SymbolId;
  condition: AlertCondition;
  threshold: number;
  value: number;
  firedAt: number;
  message: string;
}

export interface LayoutTemplate {
  id: string;
  name: string;
  builtIn?: boolean;
  widgets: WidgetInstance[];
  layout: LayoutItem[];
  createdAt: number;
}

export type PanelId = 'alerts' | 'layouts' | null;

export interface ToastItem {
  id: string;
  kind: 'alert' | 'info';
  title: string;
  body: string;
  createdAt: number;
}

/** Per-candle aggressor trade counts (pace of executions). */
export interface TradeCountPoint {
  time: number;
  buyCount: number;
  sellCount: number;
  /** True when seeded from candle volume (no tick tape). */
  estimated?: boolean;
}
