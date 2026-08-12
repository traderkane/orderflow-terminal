import type { ExchangeId, SymbolId } from '../../types/market';

/** Unified UI symbol → each venue's USDT perpetual / swap instrument id. */
export const VENUE_SYMBOLS: Record<ExchangeId, Record<SymbolId, string>> = {
  Binance: {
    'BTC/USD': 'btcusdt',
    'ETH/USD': 'ethusdt',
  },
  Bybit: {
    'BTC/USD': 'BTCUSDT',
    'ETH/USD': 'ETHUSDT',
  },
  OKX: {
    'BTC/USD': 'BTC-USDT-SWAP',
    'ETH/USD': 'ETH-USDT-SWAP',
  },
};

export function venueSymbol(exchange: ExchangeId, symbol: SymbolId): string {
  return VENUE_SYMBOLS[exchange][symbol];
}
