import type {
  Candle,
  ExchangeId,
  FeedStatus,
  Liquidation,
  SymbolId,
  Trade,
} from '../../types/market';
import {
  binanceKlineInterval,
  type ChartInterval,
} from '../../lib/chartIntervals';
import { venueSymbol } from './symbols';
import type { VenueClient, VenueHandlers, VenueLevel } from './types';

const REST_FAPI = 'https://fapi.binance.com';
const REST_VISION = 'https://data-api.binance.vision';
const WS_FUTURES = 'wss://fstream.binance.com/stream?streams=';
const WS_SPOT_VISION = 'wss://data-stream.binance.vision/stream?streams=';
const CONNECT_TIMEOUT_MS = 8000;

/**
 * Binance USDT-M futures venue — aggTrade, depth20, kline, markPrice, forceOrder.
 * Includes spot Vision fallback for trades/klines when futures tape is filtered.
 */
export class BinanceVenue implements VenueClient {
  readonly exchange: ExchangeId = 'Binance';
  private symbol: SymbolId = 'BTC/USD';
  private handlers: VenueHandlers | null = null;
  private ws: WebSocket | null = null;
  private spotWs: WebSocket | null = null;
  private running = false;
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private tradeWatchTimer: ReturnType<typeof setTimeout> | null = null;
  private sawFuturesTrade = false;
  private status: FeedStatus = 'paused';
  private pair = 'btcusdt';
  private klineInterval: ChartInterval = '1m';

  start(symbol: SymbolId, handlers: VenueHandlers) {
    this.handlers = handlers;
    const pair = venueSymbol('Binance', symbol);
    if (this.running && this.symbol === symbol && this.pair === pair) return;
    this.symbol = symbol;
    this.pair = pair;
    this.running = true;
    this.intentionalClose = false;
    void this.bootstrapAndConnect();
  }

  stop() {
    this.running = false;
    this.intentionalClose = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.spotWs) {
      this.spotWs.close();
      this.spotWs = null;
    }
    this.setStatus('paused');
  }

  setSymbol(symbol: SymbolId) {
    if (this.symbol === symbol) return;
    this.symbol = symbol;
    this.pair = venueSymbol('Binance', symbol);
    if (this.running) void this.bootstrapAndConnect();
  }

  setKlineInterval(interval: ChartInterval) {
    if (this.klineInterval === interval) return;
    this.klineInterval = interval;
    if (this.running) void this.bootstrapAndConnect();
  }

  private clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.tradeWatchTimer) {
      clearTimeout(this.tradeWatchTimer);
      this.tradeWatchTimer = null;
    }
  }

  private setStatus(status: FeedStatus) {
    this.status = status;
    this.handlers?.onStatus(this.exchange, status);
  }

  private async bootstrapAndConnect() {
    this.clearTimers();
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.spotWs) {
      this.spotWs.close();
      this.spotWs = null;
    }
    this.intentionalClose = false;
    this.setStatus('connecting');
    await this.bootstrapRest();
    if (!this.running) return;
    this.connectWs();
  }

  private async bootstrapRest() {
    const pair = this.pair.toUpperCase();
    const tryJson = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as T;
      } catch (err) {
        console.warn('[BinanceVenue] REST miss', url, err);
        return null;
      }
    };

    const iv = binanceKlineInterval(this.klineInterval);
    const klines =
      (await tryJson<unknown[][]>(
        `${REST_FAPI}/fapi/v1/klines?symbol=${pair}&interval=${iv}&limit=200`,
      )) ??
      (await tryJson<unknown[][]>(
        `${REST_VISION}/api/v3/klines?symbol=${pair}&interval=${iv}&limit=200`,
      ));

    const ticker =
      (await tryJson<Record<string, string>>(
        `${REST_FAPI}/fapi/v1/ticker/24hr?symbol=${pair}`,
      )) ??
      (await tryJson<Record<string, string>>(
        `${REST_VISION}/api/v3/ticker/24hr?symbol=${pair}`,
      ));

    const oi = await tryJson<{ openInterest: string }>(
      `${REST_FAPI}/fapi/v1/openInterest?symbol=${pair}`,
    );

    if (klines?.length && this.handlers) {
      const candles = klines.map((k) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
        volume: parseFloat(String(k[5])),
      }));
      if (this.handlers.onHistory) this.handlers.onHistory(candles);
      else for (const c of candles) this.handlers.onCandle?.(c);
    }
    if (ticker && this.handlers?.onTicker24h) {
      this.handlers.onTicker24h({
        last: parseFloat(ticker.lastPrice),
        high: parseFloat(ticker.highPrice),
        low: parseFloat(ticker.lowPrice),
        volume: parseFloat(ticker.volume),
        change: parseFloat(ticker.priceChange),
        changePct: parseFloat(ticker.priceChangePercent),
      });
    }
    if (oi && this.handlers) {
      const last = ticker ? parseFloat(ticker.lastPrice) : 0;
      const oiBase = parseFloat(oi.openInterest);
      this.handlers.onOpenInterest?.(oiBase * (last || 1));
    }
  }

  private connectWs() {
    if (!this.running) return;
    this.sawFuturesTrade = false;
    const p = this.pair;
    const kline = binanceKlineInterval(this.klineInterval);
    const streams = [
      `${p}@aggTrade`,
      `${p}@depth20@100ms`,
      `${p}@kline_${kline}`,
      `${p}@markPrice`,
      '!forceOrder@arr',
    ].join('/');
    const ws = new WebSocket(`${WS_FUTURES}${streams}`);
    this.ws = ws;
    this.setStatus('connecting');

    this.connectTimer = setTimeout(() => {
      if (this.status === 'connecting') {
        console.warn('[BinanceVenue] connect timeout');
        ws.close();
      }
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.reconnectAttempt = 0;
      this.setStatus('live');
      this.armSpotTradeFallback();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { stream?: string; data?: unknown };
        const data = (msg.data ?? msg) as Record<string, unknown>;
        const stream = msg.stream ?? '';
        if (stream.includes('@aggTrade') || data.e === 'aggTrade') {
          this.sawFuturesTrade = true;
          if (this.spotWs) {
            this.spotWs.close();
            this.spotWs = null;
          }
          if (this.tradeWatchTimer) {
            clearTimeout(this.tradeWatchTimer);
            this.tradeWatchTimer = null;
          }
        }
        this.handleMessage(stream, data);
      } catch (e) {
        console.warn('[BinanceVenue] bad message', e);
      }
    };

    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.ws = null;
      if (this.intentionalClose || !this.running) return;
      this.setStatus('error');
      const delay = Math.min(10_000, 800 * 2 ** this.reconnectAttempt);
      this.reconnectAttempt += 1;
      this.reconnectTimer = setTimeout(() => {
        if (!this.running) return;
        this.connectWs();
      }, delay);
    };
  }

  private armSpotTradeFallback() {
    if (this.tradeWatchTimer) clearTimeout(this.tradeWatchTimer);
    this.tradeWatchTimer = setTimeout(() => {
      if (!this.running || this.sawFuturesTrade || this.spotWs) return;
      console.warn('[BinanceVenue] No futures aggTrade — spot Vision fallback');
      this.connectSpotFallback();
    }, 4000);
  }

  private connectSpotFallback() {
    if (this.spotWs || !this.running) return;
    const p = this.pair;
    const kline = binanceKlineInterval(this.klineInterval);
    const streams = [`${p}@aggTrade`, `${p}@kline_${kline}`].join('/');
    const ws = new WebSocket(`${WS_SPOT_VISION}${streams}`);
    this.spotWs = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { stream?: string; data?: unknown };
        const data = (msg.data ?? msg) as Record<string, unknown>;
        this.handleMessage(msg.stream ?? '', data);
      } catch (e) {
        console.warn('[BinanceVenue] spot bad message', e);
      }
    };
    ws.onclose = () => {
      this.spotWs = null;
      if (!this.running || this.intentionalClose || this.sawFuturesTrade) return;
      setTimeout(() => this.connectSpotFallback(), 2000);
    };
  }

  private handleMessage(stream: string, data: Record<string, unknown>) {
    const event = String(data.e ?? '');
    if (stream.includes('@aggTrade') || event === 'aggTrade') {
      this.onAggTrade(data);
      return;
    }
    if (stream.includes('@bookTicker') || event === 'bookTicker') return;
    const isDepth =
      stream.includes('@depth') ||
      event === 'depthUpdate' ||
      Array.isArray(data.bids) ||
      Array.isArray(data.b);
    if (isDepth) {
      this.onDepth(data);
      return;
    }
    if (stream.includes('@kline') || event === 'kline') {
      this.onKline(data);
      return;
    }
    if (stream.includes('@markPrice') || event === 'markPriceUpdate') {
      const r = parseFloat(String(data.r ?? ''));
      if (Number.isFinite(r)) this.handlers?.onFunding?.(r);
      return;
    }
    if (stream.includes('forceOrder') || event === 'forceOrder') {
      this.onForceOrder(data);
    }
  }

  private onAggTrade(data: Record<string, unknown>) {
    if (!this.handlers) return;
    const price = parseFloat(String(data.p));
    const size = parseFloat(String(data.q));
    const side: Trade['side'] = data.m ? 'sell' : 'buy';
    this.handlers.onTrade({
      id: `bn_${data.a}`,
      time: Number(data.T) || Date.now(),
      price,
      size,
      side,
      exchange: 'Binance',
    });
  }

  private onDepth(data: Record<string, unknown>) {
    if (!this.handlers) return;
    const rawBids = (Array.isArray(data.bids) ? data.bids : data.b) as
      | [string, string][]
      | undefined;
    const rawAsks = (Array.isArray(data.asks) ? data.asks : data.a) as
      | [string, string][]
      | undefined;
    if (!rawBids?.length && !rawAsks?.length) return;
    // Guard: bookTicker uses string b/a
    if (rawBids && !Array.isArray(rawBids[0])) return;

    const toLevels = (rows: [string, string][] | undefined): VenueLevel[] => {
      if (!rows) return [];
      return rows
        .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }))
        .filter((l) => l.price > 0 && l.size > 0);
    };
    const bids = toLevels(rawBids).sort((a, b) => b.price - a.price);
    const asks = toLevels(rawAsks).sort((a, b) => a.price - b.price);
    this.handlers.onDepth({
      exchange: 'Binance',
      bids,
      asks,
      ts: Date.now(),
    });
  }

  private onKline(data: Record<string, unknown>) {
    const k = data.k as
      | { t: number; o: string; h: string; l: string; c: string; v: string }
      | undefined;
    if (!k || !this.handlers?.onCandle) return;
    const candle: Candle = {
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
    };
    this.handlers.onCandle(candle);
  }

  private onForceOrder(data: Record<string, unknown>) {
    const o = data.o as
      | {
          s: string;
          S: 'BUY' | 'SELL';
          q: string;
          p: string;
          ap: string;
          l: string;
          T: number;
        }
      | undefined;
    if (!o || !this.handlers?.onLiquidation) return;
    if (o.s.toLowerCase() !== this.pair) return;
    const side: Liquidation['side'] = o.S === 'SELL' ? 'long' : 'short';
    this.handlers.onLiquidation({
      id: `liq_bn_${o.T}_${o.ap}_${o.l}`,
      time: o.T,
      price: parseFloat(o.ap || o.p),
      size: parseFloat(o.l || o.q),
      side,
      exchange: 'Binance',
    });
  }
}
