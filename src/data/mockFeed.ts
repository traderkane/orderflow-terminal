import type {
  Candle,
  CvdPoint,
  VwapPoint,
  ExchangeId,
  HeatmapFrame,
  Liquidation,
  OrderBook,
  SymbolId,
  Trade,
  VolumeProfileBin,
} from '../types/market';
import type { FeedListener, FeedSnapshot } from './feedTypes';

export type { FeedListener, FeedSnapshot } from './feedTypes';

const SYMBOL_BASE: Record<SymbolId, number> = {
  'BTC/USD': 67500,
  'ETH/USD': 3450,
};

const EXCHANGES: ExchangeId[] = ['Binance', 'Bybit', 'OKX'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export class MockFeed {
  private symbol: SymbolId = 'BTC/USD';
  private exchanges: ExchangeId[] = [...EXCHANGES];
  private running = false;
  private speed: 1 | 2 = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<FeedListener>();
  private rand = rng(42);
  private mid = SYMBOL_BASE['BTC/USD'];
  private candles: Candle[] = [];
  private trades: Trade[] = [];
  private liquidations: Liquidation[] = [];
  private cvdSeries: CvdPoint[] = [];
  private heatmap: HeatmapFrame[] = [];
  private volumeProfile = new Map<number, VolumeProfileBin>();
  private cvd = 0;
  private dayOpen = 0;
  private high24 = 0;
  private low24 = 0;
  private volume24 = 0;
  private fundingRate = 0.0001;
  private openInterest = 1_250_000_000;
  private tick = 0;
  private candleSec = 60;

  constructor() {
    this.resetSymbol('BTC/USD');
  }

  subscribe(fn: FeedListener) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setSpeed(speed: 1 | 2) {
    this.speed = speed;
    if (this.running) this.schedule();
  }

  setSymbol(symbol: SymbolId) {
    this.resetSymbol(symbol);
    this.emit();
  }

  setExchanges(exchanges: ExchangeId[]) {
    this.exchanges = exchanges.length ? exchanges : [...EXCHANGES];
  }

  getStatus() {
    return this.running ? ('live' as const) : ('paused' as const);
  }

  private schedule() {
    if (this.timer) clearInterval(this.timer);
    const ms = this.speed === 2 ? 250 : 500;
    this.timer = setInterval(() => this.step(), ms);
  }

  private resetSymbol(symbol: SymbolId) {
    this.symbol = symbol;
    this.rand = rng(symbol === 'BTC/USD' ? 42 : 99);
    this.mid = SYMBOL_BASE[symbol];
    this.dayOpen = this.mid * (0.98 + this.rand() * 0.03);
    this.high24 = this.mid;
    this.low24 = this.mid;
    this.volume24 = 0;
    this.cvd = 0;
    this.tick = 0;
    this.candles = [];
    this.trades = [];
    this.liquidations = [];
    this.cvdSeries = [];
    this.heatmap = [];
    this.volumeProfile.clear();
    this.fundingRate = (this.rand() - 0.5) * 0.0008;
    this.openInterest = symbol === 'BTC/USD' ? 1.25e9 : 4.2e8;

    const now = Math.floor(Date.now() / 1000);
    const start = now - 180 * this.candleSec;
    let price = this.mid * (0.97 + this.rand() * 0.02);

    for (let t = start; t <= now; t += this.candleSec) {
      const drift = (this.rand() - 0.48) * price * 0.0025;
      const open = price;
      const close = Math.max(1, open + drift);
      const high = Math.max(open, close) * (1 + this.rand() * 0.0012);
      const low = Math.min(open, close) * (1 - this.rand() * 0.0012);
      const volume = 20 + this.rand() * 180;
      this.candles.push({ time: t, open, high, low, close, volume });
      price = close;
      this.high24 = Math.max(this.high24, high);
      this.low24 = Math.min(this.low24, low);
      this.volume24 += volume;
      const delta = (close >= open ? 1 : -1) * volume * (0.3 + this.rand() * 0.7);
      this.cvd += delta;
      this.cvdSeries.push({ time: t, value: this.cvd, delta });
      this.bumpProfile(close, volume * (0.4 + this.rand() * 0.3), volume * (0.4 + this.rand() * 0.3));
    }

    this.mid = price;
    for (let i = 0; i < 80; i++) this.pushHeatmapFrame(now - (80 - i) * 1, false);
  }

  private step() {
    this.tick += 1;
    const now = Math.floor(Date.now() / 1000);
    const vol = this.mid * 0.00035;
    this.mid = Math.max(1, this.mid + (this.rand() - 0.5) * vol * 4);

    const tradeCount = 1 + Math.floor(this.rand() * (this.speed === 2 ? 4 : 2));
    for (let i = 0; i < tradeCount; i++) {
      const side = this.rand() > 0.5 ? 'buy' : 'sell';
      const size = this.rand() < 0.08 ? 2 + this.rand() * 12 : 0.01 + this.rand() * 1.5;
      const price = this.mid * (1 + (side === 'buy' ? 1 : -1) * this.rand() * 0.0002);
      const exchange = this.exchanges[Math.floor(this.rand() * this.exchanges.length)];
      const trade: Trade = { id: uid('t'), time: Date.now(), price, size, side, exchange };
      this.trades.unshift(trade);
      if (this.trades.length > 120) this.trades.length = 120;

      const signed = (side === 'buy' ? 1 : -1) * size;
      this.cvd += signed;
      this.volume24 += size;
      this.high24 = Math.max(this.high24, price);
      this.low24 = Math.min(this.low24, price);
      this.bumpProfile(price, side === 'buy' ? size : 0, side === 'sell' ? size : 0);

      this.updateCandle(now, price, size);
      this.updateCvdPoint(now, signed);
    }

    if (this.rand() < 0.08) {
      const side = this.rand() > 0.5 ? 'long' : 'short';
      const liq: Liquidation = {
        id: uid('l'),
        time: Date.now(),
        price: this.mid * (1 + (this.rand() - 0.5) * 0.001),
        size: 5 + this.rand() * 80,
        side,
        exchange: this.exchanges[Math.floor(this.rand() * this.exchanges.length)],
      };
      this.liquidations.unshift(liq);
      if (this.liquidations.length > 80) this.liquidations.length = 80;
    }

    if (this.tick % 2 === 0) this.pushHeatmapFrame(now, true);

    this.fundingRate += (this.rand() - 0.5) * 0.00001;
    this.openInterest *= 1 + (this.rand() - 0.5) * 0.0004;

    this.emit();
  }

  private updateCandle(now: number, price: number, size: number) {
    const bucket = Math.floor(now / this.candleSec) * this.candleSec;
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
      if (this.candles.length > 240) this.candles.shift();
    } else {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
      last.volume += size;
    }
  }

  private updateCvdPoint(now: number, delta: number) {
    const bucket = Math.floor(now / this.candleSec) * this.candleSec;
    const last = this.cvdSeries[this.cvdSeries.length - 1];
    if (!last || last.time < bucket) {
      this.cvdSeries.push({ time: bucket, value: this.cvd, delta });
      if (this.cvdSeries.length > 240) this.cvdSeries.shift();
    } else {
      last.value = this.cvd;
      last.delta += delta;
    }
  }

  private bumpProfile(price: number, buy: number, sell: number) {
    const step = this.symbol === 'BTC/USD' ? 25 : 1;
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

  private pushHeatmapFrame(time: number, trim: boolean) {
    const levels = 80;
    const span = this.mid * 0.01;
    const prices: number[] = [];
    const bids: number[] = [];
    const asks: number[] = [];
    for (let i = 0; i < levels; i++) {
      const p = this.mid - span + (span * 2 * i) / (levels - 1);
      prices.push(p);
      const dist = Math.abs(p - this.mid) / span;
      // Cluster liquidity near mid with occasional deeper walls (MMT-like).
      const wall = this.rand() < 0.04 ? 0.55 + this.rand() * 0.45 : 0;
      const base = Math.max(0, 1 - dist ** 1.15) * (0.15 + this.rand() * 0.75) + wall;
      const intensity = Math.min(1, Math.log1p(base * 4) / Math.log1p(4));
      if (p <= this.mid) {
        bids.push(intensity);
        asks.push(this.rand() * 0.04);
      } else {
        asks.push(intensity);
        bids.push(this.rand() * 0.04);
      }
    }
    this.heatmap.push({ time, prices, bids, asks });
    if (trim && this.heatmap.length > 160) this.heatmap.shift();
  }

  private buildBook(): OrderBook {
    const levels = 22;
    const tick = this.symbol === 'BTC/USD' ? 0.5 : 0.05;
    const bids = [];
    const asks = [];
    let bidTotal = 0;
    let askTotal = 0;
    for (let i = 0; i < levels; i++) {
      const bSize = (0.2 + this.rand() * 4) * (1 + (this.rand() < 0.1 ? 5 : 0));
      const aSize = (0.2 + this.rand() * 4) * (1 + (this.rand() < 0.1 ? 5 : 0));
      bidTotal += bSize;
      askTotal += aSize;
      bids.push({ price: this.mid - tick * (i + 1), size: bSize, total: bidTotal });
      asks.push({ price: this.mid + tick * (i + 1), size: aSize, total: askTotal });
    }
    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;
    return {
      bids,
      asks,
      spread: bestAsk - bestBid,
      mid: (bestAsk + bestBid) / 2,
    };
  }

  private snapshot(): FeedSnapshot {
    const book = this.buildBook();
    const last = this.candles[this.candles.length - 1]?.close ?? this.mid;
    const change = last - this.dayOpen;
    let pv = 0;
    let vv = 0;
    for (const c of this.candles) {
      pv += ((c.high + c.low + c.close) / 3) * c.volume;
      vv += c.volume;
    }
    const profile = [...this.volumeProfile.values()]
      .sort((a, b) => a.price - b.price)
      .slice(-60);

    let runPv = 0;
    let runVv = 0;
    const vwapSeries: VwapPoint[] = this.candles.map((c) => {
      const typical = (c.high + c.low + c.close) / 3;
      runPv += typical * c.volume;
      runVv += c.volume;
      return { time: c.time, value: runVv ? runPv / runVv : c.close };
    });

    return {
      symbol: this.symbol,
      candles: [...this.candles],
      trades: [...this.trades],
      book,
      cvd: [...this.cvdSeries],
      liquidations: [...this.liquidations],
      heatmap: [...this.heatmap],
      volumeProfile: profile,
      vwap: vv ? pv / vv : last,
      vwapSeries,
      stats: {
        last,
        change24h: change,
        changePct24h: (change / this.dayOpen) * 100,
        high24h: this.high24,
        low24h: this.low24,
        volume24h: this.volume24,
        fundingRate: this.fundingRate,
        openInterest: this.openInterest,
        spread: book.spread,
        mid: book.mid,
      },
    };
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((fn) => fn(snap));
  }
}

export const mockFeed = new MockFeed();
