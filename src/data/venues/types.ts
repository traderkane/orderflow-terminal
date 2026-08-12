import type {
  Candle,
  ExchangeId,
  FeedStatus,
  Liquidation,
  SymbolId,
  Trade,
} from '../../types/market';

export interface VenueLevel {
  price: number;
  size: number;
}

export interface VenueDepth {
  exchange: ExchangeId;
  bids: VenueLevel[];
  asks: VenueLevel[];
  ts: number;
}

export interface VenueHandlers {
  onTrade: (trade: Trade) => void;
  onDepth: (depth: VenueDepth) => void;
  onLiquidation?: (liq: Liquidation) => void;
  onCandle?: (candle: Candle) => void;
  /** Full REST history bootstrap (replaces candle series). */
  onHistory?: (candles: Candle[]) => void;
  onFunding?: (rate: number) => void;
  onOpenInterest?: (notional: number) => void;
  onStatus: (exchange: ExchangeId, status: FeedStatus) => void;
  onTicker24h?: (t: {
    last: number;
    high: number;
    low: number;
    volume: number;
    change: number;
    changePct: number;
  }) => void;
}

export interface VenueClient {
  readonly exchange: ExchangeId;
  start(symbol: SymbolId, handlers: VenueHandlers): void;
  stop(): void;
  setSymbol(symbol: SymbolId): void;
}
