import type {
  Candle,
  CvdPoint,
  ExchangeId,
  FeedStatus,
  HeatmapFrame,
  Liquidation,
  OrderBook,
  SymbolId,
  Trade,
  VolumeProfileBin,
  VwapPoint,
} from '../types/market';
import type { FeedListener, FeedSnapshot } from './feedTypes';

const SYMBOL_MAP: Record<SymbolId, string> = {
  'BTC/USD': 'btcusdt',
  'ETH/USD': 'ethusdt',
};

const REST_FAPI = 'https://fapi.binance.com';
const REST_VISION = 'https://data-api.binance.vision';
const WS_FUTURES = 'wss://fstream.binance.com/stream?streams=';
const WS_SPOT_VISION = 'wss://data-stream.binance.vision/stream?streams=';

const MAX_TRADES = 120;
const MAX_LIQS = 80;
const MAX_CANDLES = 240;
const MAX_HEATMAP = 90;
const HEATMAP_LEVELS = 48;
const EMIT_MS = 100;
const CONNECT_TIMEOUT_MS = 8000;

interface DepthMsg {
  e?: string;
  lastUpdateId?: number;
  bids?: [string, string][];
  asks?: [string, string][];
  b?: [string, string][];
  a?: [string, string][];
}

interface AggTradeMsg {
  e: string;
  a: number;
  p: string;
  q: string;
  T: number;
  m: boolean;
  s: string;
}

interface KlineMsg {
  e: string;
  s: string;
  k: {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean;
  };
}

interface MarkPriceMsg {
  e: string;
  s: string;
  p: string;
  i?: string;
  P?: string;
  r: string;
  T: number;
}

interface ForceOrderMsg {
  e: string;
  o: {
    s: string;
    S: 'BUY' | 'SELL';
    q: string;
    p: string;
    ap: string;
    l: string;
    T: number;
  };
}

function profileStep(symbol: SymbolId) {
  return symbol === 'BTC/USD' ? 25 : 1;
}

export class BinanceFeed {
  private symbol: SymbolId = 'BTC/USD';
  private running = false;
  private status: FeedStatus = 'paused';
  private ws: WebSocket | null = null;
  private spotWs: WebSocket | null = null;
  private sawFuturesTrade = false;
  private tradeWatchTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<FeedListener>();
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private pair = SYMBOL_MAP['BTC/USD'];

  private candles: Candle[] = [];
  private trades: Trade[] = [];
  private liquidations: Liquidation[] = [];
  private cvdSeries: CvdPoint[] = [];
  private heatmap: HeatmapFrame[] = [];
  private volumeProfile = new Map<number, VolumeProfileBin>();
  private book: OrderBook = { bids: [], asks: [], spread: 0, mid: 0 };
  private cvd = 0;
  private last = 0;
  private high24 = 0;
  private low24 = 0;
  private volume24 = 0;
  private change24 = 0;
  private changePct24 = 0;
  private fundingRate = 0;
  private openInterest = 0;
  private candleSec = 60;
  private onFallback: (() => void) | null = null;
  private bootstrapped = false;
  private everLive = false;
  private statusListeners = new Set<(s: FeedStatus) => void>();

  subscribe(fn: FeedListener) {
    this.listeners.add(fn);
    if (this.bootstrapped) fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  /** Called once when live connect fails / stays dead — store may fall back to mock. */
  setFallbackHandler(fn: (() => void) | null) {
    this.onFallback = fn;
  }

  onStatus(fn: (s: FeedStatus) => void) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  start() {
    if (this.running) return;
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
    this.status = 'paused';
    this.statusListeners.forEach((fn) => fn(this.status));
  }

  setSymbol(symbol: SymbolId) {
    if (this.symbol === symbol) return;
    this.symbol = symbol;
    this.pair = SYMBOL_MAP[symbol];
    this.resetState();
    if (this.running) {
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
      void this.bootstrapAndConnect();
    } else {
      this.emit();
    }
  }

  setExchanges(_exchanges: ExchangeId[]) {
    // Live feed is Binance USDT-M only; exchange chips are display metadata for mock.
  }

  setSpeed(_speed: 1 | 2) {
    // Speed only applies to mock replay.
  }

  getStatus(): FeedStatus {
    return this.status;
  }

  private resetState() {
    this.candles = [];
    this.trades = [];
    this.liquidations = [];
    this.cvdSeries = [];
    this.heatmap = [];
    this.volumeProfile.clear();
    this.book = { bids: [], asks: [], spread: 0, mid: 0 };
    this.cvd = 0;
    this.last = 0;
    this.high24 = 0;
    this.low24 = 0;
    this.volume24 = 0;
    this.change24 = 0;
    this.changePct24 = 0;
    this.fundingRate = 0;
    this.openInterest = 0;
    this.bootstrapped = false;
    this.everLive = false;
    this.sawFuturesTrade = false;
    this.dirty = false;
  }

  private clearTimers() {
    if (this.emitTimer) {
      clearInterval(this.emitTimer);
      this.emitTimer = null;
    }
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
    this.statusListeners.forEach((fn) => fn(status));
    if (this.bootstrapped) this.emit();
  }

  private async bootstrapAndConnect() {
    this.clearTimers();
    this.setStatus('connecting');
    const pair = this.pair.toUpperCase();

    await this.bootstrapRest(pair);

    this.bootstrapped = true;
    this.emit();
    this.connectWs();
    if (this.emitTimer) clearInterval(this.emitTimer);
    this.emitTimer = setInterval(() => {
      if (this.dirty) {
        this.dirty = false;
        this.emit();
      }
    }, EMIT_MS);
  }

  private seedDerivedFromCandles() {
    this.cvd = 0;
    this.cvdSeries = [];
    this.volumeProfile.clear();
    for (const c of this.candles) {
      const delta = (c.close >= c.open ? 1 : -1) * c.volume * 0.55;
      this.cvd += delta;
      this.cvdSeries.push({ time: c.time, value: this.cvd, delta });
      const buy = c.close >= c.open ? c.volume * 0.55 : c.volume * 0.45;
      const sell = c.volume - buy;
      this.bumpProfile(c.close, buy, sell);
    }
  }


  private async bootstrapRest(pair: string) {
    // fapi is often geo-blocked (HTTP 451); data-api.binance.vision usually remains reachable.
    const tryJson = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as T;
      } catch (err) {
        console.warn('[BinanceFeed] REST miss', url, err);
        return null;
      }
    };

    let klines =
      (await tryJson<unknown[][]>(
        `${REST_FAPI}/fapi/v1/klines?symbol=${pair}&interval=1m&limit=200`,
      )) ??
      (await tryJson<unknown[][]>(
        `${REST_VISION}/api/v3/klines?symbol=${pair}&interval=1m&limit=200`,
      ));

    let ticker =
      (await tryJson<Record<string, string>>(
        `${REST_FAPI}/fapi/v1/ticker/24hr?symbol=${pair}`,
      )) ??
      (await tryJson<Record<string, string>>(
        `${REST_VISION}/api/v3/ticker/24hr?symbol=${pair}`,
      ));

    const oi = await tryJson<{ openInterest: string }>(
      `${REST_FAPI}/fapi/v1/openInterest?symbol=${pair}`,
    );

    if (klines) this.ingestKlines(klines);
    if (ticker) {
      this.last = parseFloat(ticker.lastPrice);
      this.high24 = parseFloat(ticker.highPrice);
      this.low24 = parseFloat(ticker.lowPrice);
      this.volume24 = parseFloat(ticker.volume);
      this.change24 = parseFloat(ticker.priceChange);
      this.changePct24 = parseFloat(ticker.priceChangePercent);
    }
    if (oi) {
      const oiBase = parseFloat(oi.openInterest);
      this.openInterest = oiBase * (this.last || 1);
    }
    if (this.candles.length) this.seedDerivedFromCandles();
  }

  private ingestKlines(raw: unknown[][]) {
    this.candles = raw.map((k) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(String(k[1])),
      high: parseFloat(String(k[2])),
      low: parseFloat(String(k[3])),
      close: parseFloat(String(k[4])),
      volume: parseFloat(String(k[5])),
    }));
    if (this.candles.length) {
      this.last = this.candles[this.candles.length - 1].close;
    }
  }

  private connectWs() {
    if (!this.running) return;
    if (this.ws) {
      this.intentionalClose = true;
      this.ws.close();
      this.ws = null;
      this.intentionalClose = false;
    }

    this.sawFuturesTrade = false;
    const p = this.pair;
    const streams = [
      `${p}@aggTrade`,
      `${p}@depth20@100ms`,
      `${p}@kline_1m`,
      `${p}@markPrice`,
      `${p}@bookTicker`,
      '!forceOrder@arr',
    ].join('/');
    const url = `${WS_FUTURES}${streams}`;

    this.setStatus('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    this.connectTimer = setTimeout(() => {
      if (this.status === 'connecting') {
        console.warn('[BinanceFeed] connect timeout');
        ws.close();
      }
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.reconnectAttempt = 0;
      this.everLive = true;
      this.setStatus('live');
      this.emit();
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
        console.warn('[BinanceFeed] bad message', e);
      }
    };

    ws.onerror = () => {
      // onclose will handle reconnect
    };

    ws.onclose = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.ws = null;
      if (this.intentionalClose || !this.running) return;
      this.setStatus('error');
      this.scheduleReconnectOrFallback();
    };
  }

  private scheduleReconnectOrFallback() {
    if (!this.running) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    // If we never got a live WS session, fall back to mock after a few tries.
    if (!this.everLive && this.reconnectAttempt >= 3) {
      this.onFallback?.();
      return;
    }

    const delay = Math.min(10_000, 800 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.running) return;
      if (!this.bootstrapped) void this.bootstrapAndConnect();
      else this.connectWs();
    }, delay);
  }


  private armSpotTradeFallback() {
    if (this.tradeWatchTimer) clearTimeout(this.tradeWatchTimer);
    this.tradeWatchTimer = setTimeout(() => {
      if (!this.running || this.sawFuturesTrade || this.spotWs) return;
      console.warn('[BinanceFeed] No futures aggTrade yet — opening spot vision trades/klines fallback');
      this.connectSpotFallback();
    }, 4000);
  }

  private connectSpotFallback() {
    if (this.spotWs || !this.running) return;
    const p = this.pair;
    const streams = [`${p}@aggTrade`, `${p}@kline_1m`].join('/');
    const url = `${WS_SPOT_VISION}${streams}`;
    const ws = new WebSocket(url);
    this.spotWs = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { stream?: string; data?: unknown };
        const data = (msg.data ?? msg) as Record<string, unknown>;
        const stream = msg.stream ?? '';
        this.handleMessage(stream, data);
      } catch (e) {
        console.warn('[BinanceFeed] spot bad message', e);
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
      this.onAggTrade(data as unknown as AggTradeMsg);
      return;
    }
    if (stream.includes('@depth') || event === 'depthUpdate' || data.bids || data.b) {
      this.onDepth(data as unknown as DepthMsg);
      return;
    }
    if (stream.includes('@kline') || event === 'kline') {
      this.onKline(data as unknown as KlineMsg);
      return;
    }
    if (stream.includes('@markPrice') || event === 'markPriceUpdate') {
      this.onMarkPrice(data as unknown as MarkPriceMsg);
      return;
    }
    if (stream.includes('@bookTicker') || event === 'bookTicker') {
      this.onBookTicker(data as { b?: string; a?: string; B?: string; A?: string });
      return;
    }
    if (stream.includes('forceOrder') || event === 'forceOrder') {
      this.onForceOrder(data as unknown as ForceOrderMsg);
    }
  }

  private onAggTrade(msg: AggTradeMsg) {
    const price = parseFloat(msg.p);
    const size = parseFloat(msg.q);
    // m = buyer is maker → aggressor is seller
    const side: Trade['side'] = msg.m ? 'sell' : 'buy';
    const trade: Trade = {
      id: `agg_${msg.a}`,
      time: msg.T,
      price,
      size,
      side,
      exchange: 'Binance',
    };
    this.trades.unshift(trade);
    if (this.trades.length > MAX_TRADES) this.trades.length = MAX_TRADES;

    const signed = (side === 'buy' ? 1 : -1) * size;
    this.cvd += signed;
    this.last = price;
    this.high24 = Math.max(this.high24 || price, price);
    this.low24 = this.low24 ? Math.min(this.low24, price) : price;
    this.volume24 += size;
    this.bumpProfile(price, side === 'buy' ? size : 0, side === 'sell' ? size : 0);

    const nowSec = Math.floor(msg.T / 1000);
    this.updateCandleFromTrade(nowSec, price, size);
    this.updateCvdPoint(nowSec, signed);
    this.dirty = true;
  }

  private onDepth(msg: DepthMsg) {
    const rawBids = msg.bids ?? msg.b ?? [];
    const rawAsks = msg.asks ?? msg.a ?? [];
    const bids = [];
    const asks = [];
    let bidTotal = 0;
    let askTotal = 0;
    for (const [p, s] of rawBids) {
      const price = parseFloat(p);
      const size = parseFloat(s);
      if (size <= 0) continue;
      bidTotal += size;
      bids.push({ price, size, total: bidTotal });
    }
    for (const [p, s] of rawAsks) {
      const price = parseFloat(p);
      const size = parseFloat(s);
      if (size <= 0) continue;
      askTotal += size;
      asks.push({ price, size, total: askTotal });
    }
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);
    // recompute cumulative after sort
    bidTotal = 0;
    askTotal = 0;
    for (const b of bids) {
      bidTotal += b.size;
      b.total = bidTotal;
    }
    for (const a of asks) {
      askTotal += a.size;
      a.total = askTotal;
    }
    const bestBid = bids[0]?.price ?? this.last;
    const bestAsk = asks[0]?.price ?? this.last;
    this.book = {
      bids: bids.slice(0, 22),
      asks: asks.slice(0, 22),
      spread: Math.max(0, bestAsk - bestBid),
      mid: (bestAsk + bestBid) / 2 || this.last,
    };
    this.pushHeatmapFrame(Math.floor(Date.now() / 1000));
    this.dirty = true;
  }

  private onKline(msg: KlineMsg) {
    const k = msg.k;
    if (!k) return;
    const candle: Candle = {
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
    };
    const last = this.candles[this.candles.length - 1];
    if (!last || last.time < candle.time) {
      this.candles.push(candle);
      if (this.candles.length > MAX_CANDLES) this.candles.shift();
    } else if (last.time === candle.time) {
      last.open = candle.open;
      last.high = candle.high;
      last.low = candle.low;
      last.close = candle.close;
      last.volume = candle.volume;
    }
    this.last = candle.close;
    this.dirty = true;
  }

  private onMarkPrice(msg: MarkPriceMsg) {
    this.fundingRate = parseFloat(msg.r);
    const mark = parseFloat(msg.p);
    if (mark > 0 && this.openInterest > 0) {
      // keep notional roughly in sync if we only have base OI cached via last
    }
    if (!this.last && mark) this.last = mark;
    this.dirty = true;
  }

  private onBookTicker(msg: { b?: string; a?: string; B?: string; A?: string }) {
    const bid = parseFloat(msg.b || '0');
    const ask = parseFloat(msg.a || '0');
    if (!bid || !ask) return;
    this.last = (bid + ask) / 2;
    // Keep a thin top-of-book if depth is lagging
    if (!this.book.bids.length) {
      this.book = {
        bids: [{ price: bid, size: parseFloat(msg.B || '0'), total: parseFloat(msg.B || '0') }],
        asks: [{ price: ask, size: parseFloat(msg.A || '0'), total: parseFloat(msg.A || '0') }],
        spread: ask - bid,
        mid: (ask + bid) / 2,
      };
    } else {
      this.book = {
        ...this.book,
        spread: ask - bid,
        mid: (ask + bid) / 2,
      };
    }
    this.dirty = true;
  }

  private onForceOrder(msg: ForceOrderMsg) {
    const o = msg.o;
    if (!o) return;
    if (o.s.toLowerCase() !== this.pair) return;
    // SELL liquidation order = long liquidated; BUY = short liquidated
    const side: Liquidation['side'] = o.S === 'SELL' ? 'long' : 'short';
    const price = parseFloat(o.ap || o.p);
    const size = parseFloat(o.l || o.q);
    const liq: Liquidation = {
      id: `liq_${o.T}_${price}_${size}`,
      time: o.T,
      price,
      size,
      side,
      exchange: 'Binance',
    };
    this.liquidations.unshift(liq);
    if (this.liquidations.length > MAX_LIQS) this.liquidations.length = MAX_LIQS;
    this.dirty = true;
  }

  private updateCandleFromTrade(nowSec: number, price: number, size: number) {
    const bucket = Math.floor(nowSec / this.candleSec) * this.candleSec;
    const last = this.candles[this.candles.length - 1];
    if (!last || last.time < bucket) {
      this.candles.push({
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: size,
      });
      if (this.candles.length > MAX_CANDLES) this.candles.shift();
    } else {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
    }
  }

  private updateCvdPoint(nowSec: number, delta: number) {
    const bucket = Math.floor(nowSec / this.candleSec) * this.candleSec;
    const last = this.cvdSeries[this.cvdSeries.length - 1];
    if (!last || last.time < bucket) {
      this.cvdSeries.push({ time: bucket, value: this.cvd, delta });
      if (this.cvdSeries.length > MAX_CANDLES) this.cvdSeries.shift();
    } else {
      last.value = this.cvd;
      last.delta += delta;
    }
  }

  private bumpProfile(price: number, buy: number, sell: number) {
    const step = profileStep(this.symbol);
    const key = Math.round(price / step) * step;
    const prev = this.volumeProfile.get(key) ?? {
      price: key,
      buyVolume: 0,
      sellVolume: 0,
      total: 0,
    };
    prev.buyVolume += buy;
    prev.sellVolume += sell;
    prev.total += buy + sell;
    this.volumeProfile.set(key, prev);
  }

  private pushHeatmapFrame(time: number) {
    const mid = this.book.mid || this.last;
    if (!mid) return;
    const span = mid * 0.008;
    const prices: number[] = [];
    const bids: number[] = [];
    const asks: number[] = [];

    let maxBid = 0;
    let maxAsk = 0;
    const bidSizes = new Array(HEATMAP_LEVELS).fill(0);
    const askSizes = new Array(HEATMAP_LEVELS).fill(0);

    for (let i = 0; i < HEATMAP_LEVELS; i++) {
      prices.push(mid - span + (span * 2 * i) / (HEATMAP_LEVELS - 1));
    }

    const bucketIndex = (price: number) => {
      const t = (price - (mid - span)) / (span * 2);
      return Math.max(0, Math.min(HEATMAP_LEVELS - 1, Math.round(t * (HEATMAP_LEVELS - 1))));
    };

    for (const b of this.book.bids) {
      const idx = bucketIndex(b.price);
      bidSizes[idx] += b.size;
      maxBid = Math.max(maxBid, bidSizes[idx]);
    }
    for (const a of this.book.asks) {
      const idx = bucketIndex(a.price);
      askSizes[idx] += a.size;
      maxAsk = Math.max(maxAsk, askSizes[idx]);
    }

    for (let i = 0; i < HEATMAP_LEVELS; i++) {
      bids.push(maxBid ? bidSizes[i] / maxBid : 0);
      asks.push(maxAsk ? askSizes[i] / maxAsk : 0);
    }

    // Avoid flooding identical frames every 100ms — keep ~2/sec feel
    const prev = this.heatmap[this.heatmap.length - 1];
    if (prev && time - prev.time < 1) {
      prev.prices = prices;
      prev.bids = bids;
      prev.asks = asks;
      prev.time = time;
    } else {
      this.heatmap.push({ time, prices, bids, asks });
      if (this.heatmap.length > MAX_HEATMAP) this.heatmap.shift();
    }
  }

  private snapshot(): FeedSnapshot {
    const last = this.last || this.candles[this.candles.length - 1]?.close || 0;
    let pv = 0;
    let vv = 0;
    let runPv = 0;
    let runVv = 0;
    const vwapSeries: VwapPoint[] = this.candles.map((c) => {
      const typical = (c.high + c.low + c.close) / 3;
      pv += typical * c.volume;
      vv += c.volume;
      runPv += typical * c.volume;
      runVv += c.volume;
      return { time: c.time, value: runVv ? runPv / runVv : c.close };
    });

    const profile = [...this.volumeProfile.values()]
      .sort((a, b) => a.price - b.price)
      .slice(-60);

    return {
      symbol: this.symbol,
      candles: [...this.candles],
      trades: [...this.trades],
      book: {
        bids: [...this.book.bids],
        asks: [...this.book.asks],
        spread: this.book.spread,
        mid: this.book.mid || last,
      },
      cvd: [...this.cvdSeries],
      liquidations: [...this.liquidations],
      heatmap: [...this.heatmap],
      volumeProfile: profile,
      vwap: vv ? pv / vv : last,
      vwapSeries,
      stats: {
        last,
        change24h: this.change24,
        changePct24h: this.changePct24,
        high24h: this.high24 || last,
        low24h: this.low24 || last,
        volume24h: this.volume24,
        fundingRate: this.fundingRate,
        openInterest: this.openInterest,
        spread: this.book.spread,
        mid: this.book.mid || last,
      },
    };
  }

  private emit() {
    if (!this.listeners.size) return;
    const snap = this.snapshot();
    this.listeners.forEach((fn) => fn(snap));
  }
}

export const binanceFeed = new BinanceFeed();
