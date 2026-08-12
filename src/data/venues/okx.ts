import type { ExchangeId, FeedStatus, SymbolId, Trade } from '../../types/market';
import { venueSymbol } from './symbols';
import type { VenueClient, VenueHandlers, VenueLevel } from './types';

const WS_URL = 'wss://ws.okx.com:8443/ws/v5/public';
const RECONNECT_BASE = 800;
const CONNECT_TIMEOUT_MS = 8000;

/**
 * OKX USDT-margined swap — trades + books5 (top-5 snapshot each tick).
 * Gap: books5 is only 5 levels per side (not full depth). No API keys.
 */
export class OkxVenue implements VenueClient {
  readonly exchange: ExchangeId = 'OKX';
  private symbol: SymbolId = 'BTC/USD';
  private handlers: VenueHandlers | null = null;
  private ws: WebSocket | null = null;
  private running = false;
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
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
    this.setStatus('paused');
  }

  setSymbol(symbol: SymbolId) {
    if (this.symbol === symbol) return;
    this.symbol = symbol;
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
    const instId = venueSymbol('OKX', this.symbol);
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    this.connectTimer = setTimeout(() => {
      if (this.status === 'connecting') {
        console.warn('[OkxVenue] connect timeout');
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
          args: [
            { channel: 'trades', instId },
            { channel: 'books5', instId },
            { channel: 'funding-rate', instId },
          ],
        }),
      );
      // OKX expects client ping text frames when idle
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 20_000);
      this.setStatus('live');
    };

    ws.onmessage = (ev) => {
      const raw = String(ev.data);
      if (raw === 'pong') return;
      try {
        const msg = JSON.parse(raw) as {
          event?: string;
          arg?: { channel?: string; instId?: string };
          data?: unknown[];
          action?: string;
        };
        if (msg.event === 'subscribe' || msg.event === 'error') {
          if (msg.event === 'error') console.warn('[OkxVenue] sub error', msg);
          return;
        }
        const channel = msg.arg?.channel ?? '';
        if (channel === 'trades') this.onTrades(msg.data);
        else if (channel === 'books5') this.onBooks5(msg.data);
        else if (channel === 'funding-rate') this.onFunding(msg.data);
      } catch (e) {
        console.warn('[OkxVenue] bad message', e);
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

  private onTrades(data: unknown[] | undefined) {
    if (!data?.length || !this.handlers) return;
    for (const row of data) {
      const t = row as {
        tradeId?: string;
        ts?: string;
        px?: string;
        sz?: string;
        side?: string;
      };
      const side: Trade['side'] = t.side === 'sell' ? 'sell' : 'buy';
      this.handlers.onTrade({
        id: `ok_${t.tradeId ?? `${t.ts}_${t.px}_${t.sz}`}`,
        time: Number(t.ts) || Date.now(),
        price: parseFloat(t.px ?? '0'),
        size: parseFloat(t.sz ?? '0'),
        side,
        exchange: 'OKX',
      });
    }
  }

  private onBooks5(data: unknown[] | undefined) {
    if (!data?.length || !this.handlers) return;
    const book = data[0] as {
      bids?: [string, string, string, string][];
      asks?: [string, string, string, string][];
      ts?: string;
    };
    const toLevels = (rows: [string, string, string, string][] | undefined): VenueLevel[] => {
      if (!rows) return [];
      return rows
        .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }))
        .filter((l) => l.price > 0 && l.size > 0);
    };
    const bids = toLevels(book.bids).sort((a, b) => b.price - a.price);
    const asks = toLevels(book.asks).sort((a, b) => a.price - b.price);
    this.handlers.onDepth({
      exchange: 'OKX',
      bids,
      asks,
      ts: Number(book.ts) || Date.now(),
    });
  }

  private onFunding(data: unknown[] | undefined) {
    if (!data?.length || !this.handlers) return;
    const row = data[0] as { fundingRate?: string };
    const rate = parseFloat(row.fundingRate ?? '');
    if (Number.isFinite(rate)) this.handlers.onFunding?.(rate);
  }
}
