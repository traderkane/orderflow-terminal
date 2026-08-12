import type { ExchangeId, FeedStatus, SymbolId, Trade } from '../../types/market';
import { venueSymbol } from './symbols';
import type { VenueClient, VenueHandlers, VenueLevel } from './types';

const WS_URL = 'wss://stream.bybit.com/v5/public/linear';
const RECONNECT_BASE = 800;
const CONNECT_TIMEOUT_MS = 8000;

interface BybitTradeRow {
  T: number;
  s: string;
  S: 'Buy' | 'Sell';
  v: string;
  p: string;
  i: string;
}

interface BybitBookData {
  s: string;
  b: [string, string][];
  a: [string, string][];
  u: number;
}

/**
 * Bybit USDT linear perpetual — publicTrade + orderbook.50 (snapshot/delta).
 * No API keys.
 */
export class BybitVenue implements VenueClient {
  readonly exchange: ExchangeId = 'Bybit';
  private symbol: SymbolId = 'BTC/USD';
  private handlers: VenueHandlers | null = null;
  private ws: WebSocket | null = null;
  private running = false;
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private bids = new Map<number, number>();
  private asks = new Map<number, number>();
  private status: FeedStatus = 'paused';

  start(symbol: SymbolId, handlers: VenueHandlers) {
    this.handlers = handlers;
    if (this.running && this.symbol === symbol) return;
    this.symbol = symbol;
    this.running = true;
    this.intentionalClose = false;
    this.connect();
  }

  stop() {
    this.running = false;
    this.intentionalClose = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.bids.clear();
    this.asks.clear();
    this.setStatus('paused');
  }

  setSymbol(symbol: SymbolId) {
    if (this.symbol === symbol) return;
    this.symbol = symbol;
    this.bids.clear();
    this.asks.clear();
    if (this.running) this.reconnectNow();
  }

  private reconnectNow() {
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.intentionalClose = false;
    this.clearTimers();
    this.connect();
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
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setStatus(status: FeedStatus) {
    this.status = status;
    this.handlers?.onStatus(this.exchange, status);
  }

  private connect() {
    if (!this.running || !this.handlers) return;
    this.setStatus('connecting');
    const pair = venueSymbol('Bybit', this.symbol);
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    this.connectTimer = setTimeout(() => {
      if (this.status === 'connecting') {
        console.warn('[BybitVenue] connect timeout');
        ws.close();
      }
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.reconnectAttempt = 0;
      ws.send(
        JSON.stringify({
          op: 'subscribe',
          args: [`publicTrade.${pair}`, `orderbook.50.${pair}`, `tickers.${pair}`],
        }),
      );
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 'ping' }));
        }
      }, 20_000);
      this.setStatus('live');
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          topic?: string;
          type?: string;
          data?: unknown;
          op?: string;
        };
        if (msg.op === 'pong' || msg.op === 'subscribe') return;
        const topic = msg.topic ?? '';
        if (topic.startsWith('publicTrade.')) {
          this.onTrades(msg.data as BybitTradeRow[]);
        } else if (topic.startsWith('orderbook.')) {
          this.onBook(msg.type ?? 'snapshot', msg.data as BybitBookData);
        } else if (topic.startsWith('tickers.')) {
          this.onTicker(msg.data);
        }
      } catch (e) {
        console.warn('[BybitVenue] bad message', e);
      }
    };

    ws.onerror = () => {
      /* onclose handles reconnect */
    };

    ws.onclose = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.ws = null;
      if (this.intentionalClose || !this.running) return;
      this.setStatus('error');
      const delay = Math.min(10_000, RECONNECT_BASE * 2 ** this.reconnectAttempt);
      this.reconnectAttempt += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private onTrades(rows: BybitTradeRow[] | undefined) {
    if (!rows?.length || !this.handlers) return;
    for (const row of rows) {
      const side: Trade['side'] = row.S === 'Buy' ? 'buy' : 'sell';
      this.handlers.onTrade({
        id: `by_${row.i}`,
        time: row.T,
        price: parseFloat(row.p),
        size: parseFloat(row.v),
        side,
        exchange: 'Bybit',
      });
    }
  }

  private onBook(type: string, data: BybitBookData | undefined) {
    if (!data || !this.handlers) return;
    if (type === 'snapshot') {
      this.bids.clear();
      this.asks.clear();
    }
    for (const [p, s] of data.b ?? []) {
      const price = parseFloat(p);
      const size = parseFloat(s);
      if (!Number.isFinite(price)) continue;
      if (size <= 0) this.bids.delete(price);
      else this.bids.set(price, size);
    }
    for (const [p, s] of data.a ?? []) {
      const price = parseFloat(p);
      const size = parseFloat(s);
      if (!Number.isFinite(price)) continue;
      if (size <= 0) this.asks.delete(price);
      else this.asks.set(price, size);
    }
    const bids: VenueLevel[] = [...this.bids.entries()]
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => b.price - a.price);
    const asks: VenueLevel[] = [...this.asks.entries()]
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => a.price - b.price);
    this.handlers.onDepth({
      exchange: 'Bybit',
      bids,
      asks,
      ts: Date.now(),
    });
  }

  private onTicker(data: unknown) {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object' || !this.handlers) return;
    const t = row as Record<string, string>;
    if (t.fundingRate != null) {
      const rate = parseFloat(t.fundingRate);
      if (Number.isFinite(rate)) this.handlers.onFunding?.(rate);
    }
    if (t.openInterestValue != null) {
      const oi = parseFloat(t.openInterestValue);
      if (Number.isFinite(oi)) this.handlers.onOpenInterest?.(oi);
    }
  }
}
