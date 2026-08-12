import type {
  Candle,
  CvdPoint,
  VwapPoint,
  FootprintBar,
  HeatmapFrame,
  Liquidation,
  MarketStats,
  OrderBook,
  SymbolId,
  Trade,
  VolumeProfileBin,
  TradeCountPoint,
} from '../types/market';

export interface FeedSnapshot {
  symbol: SymbolId;
  candles: Candle[];
  trades: Trade[];
  book: OrderBook;
  cvd: CvdPoint[];
  tradeCounts: TradeCountPoint[];
  liquidations: Liquidation[];
  heatmap: HeatmapFrame[];
  volumeProfile: VolumeProfileBin[];
  footprint: FootprintBar[];
  stats: MarketStats;
  vwap: number;
  vwapSeries: VwapPoint[];
}

export type FeedListener = (snap: FeedSnapshot) => void;
export type FeedMode = 'live' | 'mock';
