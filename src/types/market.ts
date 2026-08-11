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

export type WidgetType =
  | 'chart'
  | 'orderbook'
  | 'trades'
  | 'heatmap'
  | 'cvd'
  | 'volumeProfile'
  | 'liquidations'
  | 'stats';

export interface WidgetInstance {
  id: string;
  type: WidgetType;
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
