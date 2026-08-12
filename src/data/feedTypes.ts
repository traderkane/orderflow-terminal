import type {
  Candle,
  CvdPoint,
  VwapPoint,
  HeatmapFrame,
  Liquidation,
  MarketStats,
  OrderBook,
  SymbolId,
  Trade,
  VolumeProfileBin,
} from '../types/market';

export interface FeedSnapshot {
  symbol: SymbolId;
  candles: Candle[];
  trades: Trade[];
  book: OrderBook;
  cvd: CvdPoint[];
  liquidations: Liquidation[];
  heatmap: HeatmapFrame[];
  volumeProfile: VolumeProfileBin[];
  stats: MarketStats;
  vwap: number;
  vwapSeries: VwapPoint[];
}

export type FeedListener = (snap: FeedSnapshot) => void;
export type FeedMode = 'live' | 'mock';
