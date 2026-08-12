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
import {
  bybitKlineInterval,
  intervalToSec,
  okxKlineBar,
  type ChartInterval,
} from '../lib/chartIntervals';
import {
  bumpFootprint,
  footprintStep,
  serializeFootprint,
  type FootprintBarMut,
} from './footprint';
import { BinanceVenue } from './venues/binance';
import { BybitVenue } from './venues/bybit';
import { mergeVenueBooks } from './venues/mergeBook';
import { OkxVenue } from './venues/okx';
import { venueSymbol } from './venues/symbols';
import type { VenueClient, VenueDepth, VenueHandlers, VenueLevel } from './venues/types';

const MAX_TRADES = 120;
const MAX_LIQS = 80;
const MAX_CANDLES = 240;
const MAX_HEATMAP = 160;
const HEATMAP_LEVELS = 96;
const HEATMAP_FRAME_MS = 200;
const EMIT_MS = 100;
/** Footprint / TPO stay on 1m buckets regardless of chart TF. */
const FOOTPRINT_SEC = 60;
const ALL_EXCHANGES: ExchangeId[] = ['Binance', 'Bybit', 'OKX'];

function profileStep(symbol: SymbolId) {
  return symbol === 'BTC/USD' ? 25 : 1;
}

/**
 * Multi-venue live feed: Binance / Bybit / OKX public WS aggregation.
 * Selected venues contribute to a merged tape, CVD, order book, and heatmap.
 * Candles / 24h stats bootstrap prefer Binance when selected.
 */
export class LiveFeed {
  private symbol: SymbolId = 'BTC/USD';
  private exchanges: ExchangeId[] = ['Binance'];
  private running = false;
  private status: FeedStatus = 'paused';
  private listeners = new Set<FeedListener>();
  private statusListeners = new Set<(s: FeedStatus) => void>();
  private venueStatusListeners = new Set<(m: Record<ExchangeId, FeedStatus>) => void>();
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;
  private onFallback: (() => void) | null = null;
  private bootstrapped = false;
  private everLive = false;
  private connectStartedAt = 0;

  private venueStatus: Record<ExchangeId, FeedStatus> = {
    Binance: 'paused',
    Bybit: 'paused',
    OKX: 'paused',
  };

  private venues: Record<ExchangeId, VenueClient> = {
    Binance: new BinanceVenue(),
    Bybit: new BybitVenue(),
    OKX: new OkxVenue(),
  };

  private venueDepths = new Map<ExchangeId, VenueDepth>();

  private candles: Candle[] = [];
  private trades: Trade[] = [];
  private liquidations: Liquidation[] = [];
  private cvdSeries: CvdPoint[] = [];
  private heatmap: HeatmapFrame[] = [];
  private depthBids: VenueLevel[] = [];
  private depthAsks: VenueLevel[] = [];
  private volumeProfile = new Map<number, VolumeProfileBin>();
  private footprintBars: FootprintBarMut[] = [];
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
  private chartInterval: ChartInterval = '1m';
  private candleSec = 60;
  private candlesSeeded = false;

  subscribe(fn: FeedListener) {
    this.listeners.add(fn);
    if (this.bootstrapped) fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  setFallbackHandler(fn: (() => void) | null) {
    this.onFallback = fn;
  }

  onStatus(fn: (s: FeedStatus) => void) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  onVenueStatus(fn: (m: Record<ExchangeId, FeedStatus>) => void) {
    this.venueStatusListeners.add(fn);
    fn({ ...this.venueStatus });
    return () => this.venueStatusListeners.delete(fn);
  }

  getVenueStatus() {
    return { ...this.venueStatus };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.connectStartedAt = Date.now();
    this.setStatus('connecting');
    void this.ensureHistoryBootstrap().finally(() => {
      if (!this.running) return;
      this.syncVenues();
    });
    if (this.emitTimer) clearInterval(this.emitTimer);
    this.emitTimer = setInterval(() => {
      if (this.dirty) {
        this.dirty = false;
        this.emit();
      }
      this.maybeFallback();
    }, EMIT_MS);
  }

  stop() {
    this.running = false;
    if (this.emitTimer) {
      clearInterval(this.emitTimer);
      this.emitTimer = null;
    }
    for (const ex of ALL_EXCHANGES) {
      this.venues[ex].stop();
      this.venueStatus[ex] = 'paused';
    }
    this.venueDepths.clear();
    this.emitVenueStatus();
    this.setStatus('paused');
  }

  setSymbol(symbol: SymbolId) {
    if (this.symbol === symbol) return;
    this.symbol = symbol;
    this.resetState();
    if (this.running) {
      this.setStatus('connecting');
      this.connectStartedAt = Date.now();
      void this.ensureHistoryBootstrap().finally(() => {
        if (!this.running) return;
        this.syncVenues();
      });
    } else {
      this.emit();
    }
  }

  setExchanges(exchanges: ExchangeId[]) {
    const next: ExchangeId[] = exchanges.length ? [...exchanges] : ['Binance'];
    const same =
      next.length === this.exchanges.length &&
      next.every((e) => this.exchanges.includes(e));
    this.exchanges = next;
    if (same) return;
    // Drop depth from deselected venues
    for (const ex of ALL_EXCHANGES) {
      if (!this.exchanges.includes(ex)) this.venueDepths.delete(ex);
    }
    this.rebuildBook();
    if (this.running) this.syncVenues();
    this.dirty = true;
  }

  /** Chart candle TF — rebootstrap/resubscribe klines; footprint stays 1m. */
  setChartInterval(interval: ChartInterval) {
    if (this.chartInterval === interval) return;
    this.chartInterval = interval;
    this.candleSec = intervalToSec(interval);
    this.resetCandlesOnly();
    this.venues.Binance.setKlineInterval?.(interval);
    if (this.running) {
      void this.ensureHistoryBootstrap().finally(() => {
        if (!this.running) return;
        // BinanceVenue.setKlineInterval already rebootstrap+reconnects when running.
        // When Binance is off, history comes from Bybit/OKX REST above.
        this.dirty = true;
        this.emit();
      });
    } else {
      this.emit();
    }
  }

  setSpeed(_speed: 1 | 2) {
    /* mock only */
  }

  getStatus(): FeedStatus {
    return this.status;
  }

  /** When Binance is off, pull chart-TF history from Bybit (or OKX) so chart/CVD still seed. */
  private async ensureHistoryBootstrap() {
    if (this.exchanges.includes('Binance')) {
      // BinanceVenue REST handles klines + ticker for current chartInterval
      return;
    }
    if (this.candlesSeeded && this.candles.length) return;

    const tryJson = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as T;
      } catch (err) {
        console.warn('[LiveFeed] history miss', url, err);
        return null;
      }
    };

    if (this.exchanges.includes('Bybit')) {
      const pair = venueSymbol('Bybit', this.symbol);
      const body = await tryJson<{
        result?: { list?: string[][] };
      }>(
        `https://api.bybit.com/v5/market/kline?category=linear&symbol=${pair}&interval=${bybitKlineInterval(this.chartInterval)}&limit=200`,
      );
      const list = body?.result?.list;
      if (list?.length) {
        // Bybit returns newest-first
        const rows = [...list].reverse();
        this.candles = rows.map((k) => ({
          time: Math.floor(Number(k[0]) / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        this.last = this.candles[this.candles.length - 1]?.close ?? 0;
        this.seedDerivedFromCandles();
        this.candlesSeeded = true;
        this.bootstrapped = true;
        this.emit();
        return;
      }
    }

    if (this.exchanges.includes('OKX')) {
      const instId = venueSymbol('OKX', this.symbol);
      const body = await tryJson<{ data?: string[][] }>(
        `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${okxKlineBar(this.chartInterval)}&limit=200`,
      );
      const list = body?.data;
      if (list?.length) {
        const rows = [...list].reverse();
        this.candles = rows.map((k) => ({
          time: Math.floor(Number(k[0]) / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        this.last = this.candles[this.candles.length - 1]?.close ?? 0;
        this.seedDerivedFromCandles();
        this.candlesSeeded = true;
        this.bootstrapped = true;
        this.emit();
      }
    }
  }

  private syncVenues() {
    const handlers = this.makeHandlers();
    this.venues.Binance.setKlineInterval?.(this.chartInterval);
    for (const ex of ALL_EXCHANGES) {
      if (this.exchanges.includes(ex)) {
        this.venues[ex].start(this.symbol, handlers);
      } else {
        this.venues[ex].stop();
        this.venueStatus[ex] = 'paused';
      }
    }
    this.emitVenueStatus();
    this.recomputeAggregateStatus();
  }

  private makeHandlers(): VenueHandlers {
    return {
      onTrade: (trade) => this.onTrade(trade),
      onDepth: (depth) => this.onDepth(depth),
      onLiquidation: (liq) => this.onLiquidation(liq),
      onCandle: (c) => this.onCandle(c),
      onHistory: (candles) => this.onHistory(candles),
      onFunding: (rate) => {
        this.fundingRate = rate;
        this.dirty = true;
      },
      onOpenInterest: (oi) => {
        this.openInterest = oi;
        this.dirty = true;
      },
      onTicker24h: (t) => {
        this.last = t.last || this.last;
        this.high24 = t.high;
        this.low24 = t.low;
        this.volume24 = t.volume;
        this.change24 = t.change;
        this.changePct24 = t.changePct;
        this.bootstrapped = true;
        if (this.candles.length && !this.candlesSeeded) {
          this.seedDerivedFromCandles();
          this.candlesSeeded = true;
        }
        this.dirty = true;
      },
      onStatus: (exchange, status) => {
        this.venueStatus[exchange] = status;
        this.emitVenueStatus();
        if (status === 'live') this.everLive = true;
        this.recomputeAggregateStatus();
      },
    };
  }

  private recomputeAggregateStatus() {
    if (!this.running) {
      this.setStatus('paused');
      return;
    }
    const active = this.exchanges.map((e) => this.venueStatus[e]);
    if (active.some((s) => s === 'live')) {
      this.setStatus('live');
      this.bootstrapped = true;
      return;
    }
    if (active.some((s) => s === 'connecting')) {
      this.setStatus('connecting');
      return;
    }
    if (active.some((s) => s === 'error')) {
      this.setStatus('error');
      return;
    }
    this.setStatus('connecting');
  }

  private maybeFallback() {
    if (!this.running || this.everLive) return;
    if (Date.now() - this.connectStartedAt < 12_000) return;
    const anyLive = this.exchanges.some((e) => this.venueStatus[e] === 'live');
    if (!anyLive) this.onFallback?.();
  }

  private resetState() {
    this.candles = [];
    this.trades = [];
    this.liquidations = [];
    this.cvdSeries = [];
    this.heatmap = [];
    this.depthBids = [];
    this.depthAsks = [];
    this.volumeProfile.clear();
    this.footprintBars = [];
    this.book = { bids: [], asks: [], spread: 0, mid: 0 };
    this.venueDepths.clear();
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
    this.candlesSeeded = false;
    this.everLive = false;
    this.dirty = false;
  }

  /** Clear candle/CVD series for TF switch without dropping tape/book/footprint. */
  private resetCandlesOnly() {
    this.candles = [];
    this.cvdSeries = [];
    this.cvd = 0;
    this.volumeProfile.clear();
    this.candlesSeeded = false;
    this.dirty = false;
  }

  private setStatus(status: FeedStatus) {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  private emitVenueStatus() {
    const snap = { ...this.venueStatus };
    this.venueStatusListeners.forEach((fn) => fn(snap));
  }

  private onTrade(trade: Trade) {
    if (!this.exchanges.includes(trade.exchange)) return;
    if (!(trade.price > 0) || !(trade.size > 0)) return;

    this.trades.unshift(trade);
    if (this.trades.length > MAX_TRADES) this.trades.length = MAX_TRADES;

    const signed = (trade.side === 'buy' ? 1 : -1) * trade.size;
    this.cvd += signed;
    this.last = trade.price;
    this.high24 = Math.max(this.high24 || trade.price, trade.price);
    this.low24 = this.low24 ? Math.min(this.low24, trade.price) : trade.price;
    this.volume24 += trade.size;
    this.bumpProfile(
      trade.price,
      trade.side === 'buy' ? trade.size : 0,
      trade.side === 'sell' ? trade.size : 0,
    );
    bumpFootprint(
      this.footprintBars,
      FOOTPRINT_SEC,
      footprintStep(this.symbol),
      Math.floor(trade.time / 1000),
      trade.price,
      trade.side === 'buy' ? trade.size : 0,
      trade.side === 'sell' ? trade.size : 0,
    );
    const nowSec = Math.floor(trade.time / 1000);
    this.updateCandleFromTrade(nowSec, trade.price, trade.size);
    this.updateCvdPoint(nowSec, signed);
    this.bootstrapped = true;
    this.dirty = true;
  }

  private onDepth(depth: VenueDepth) {
    if (!this.exchanges.includes(depth.exchange)) return;
    this.venueDepths.set(depth.exchange, depth);
    this.rebuildBook();
    this.pushHeatmapFrame(Date.now());
    this.bootstrapped = true;
    this.dirty = true;
  }

  private rebuildBook() {
    const depths = this.exchanges
      .map((e) => this.venueDepths.get(e))
      .filter((d): d is VenueDepth => !!d);
    const merged = mergeVenueBooks(depths, this.last);
    this.book = merged.book;
    this.depthBids = merged.depthBids;
    this.depthAsks = merged.depthAsks;
    if (this.book.mid) this.last = this.last || this.book.mid;
  }

  private onLiquidation(liq: Liquidation) {
    if (!this.exchanges.includes(liq.exchange)) return;
    this.liquidations.unshift(liq);
    if (this.liquidations.length > MAX_LIQS) this.liquidations.length = MAX_LIQS;
    this.dirty = true;
  }

  private onCandle(candle: Candle) {
    // Prefer seeding full history once from Binance REST; then stream updates.
    if (!this.candlesSeeded && this.candles.length === 0) {
      // First candle during bootstrap — liveFeed accumulates via repeated onCandle from REST
    }
    const last = this.candles[this.candles.length - 1];
    if (!last) {
      this.candles.push(candle);
    } else if (last.time < candle.time) {
      // If REST dumps many candles, they arrive in order — append
      if (candle.time - last.time > this.candleSec * 2 && !this.candlesSeeded) {
        this.candles.push(candle);
      } else {
        this.candles.push(candle);
      }
      if (this.candles.length > MAX_CANDLES) {
        // During REST bootstrap we may push 200; trim after seed
        if (this.candlesSeeded) this.candles.shift();
        else while (this.candles.length > MAX_CANDLES) this.candles.shift();
      }
    } else if (last.time === candle.time) {
      last.open = candle.open;
      last.high = candle.high;
      last.low = candle.low;
      last.close = candle.close;
      last.volume = candle.volume;
    } else if (!this.candlesSeeded) {
      // Out-of-order during bootstrap — insert sorted
      const idx = this.candles.findIndex((c) => c.time === candle.time);
      if (idx >= 0) {
        this.candles[idx] = candle;
      } else {
        this.candles.push(candle);
        this.candles.sort((a, b) => a.time - b.time);
      }
    }
    this.last = candle.close || this.last;
    this.bootstrapped = true;
    this.dirty = true;
  }

  private onHistory(candles: Candle[]) {
    if (!candles.length) return;
    this.candles = candles.slice(-MAX_CANDLES);
    this.last = this.candles[this.candles.length - 1]?.close ?? this.last;
    this.seedDerivedFromCandles();
    this.candlesSeeded = true;
    this.bootstrapped = true;
    this.dirty = true;
    this.emit();
  }

  private seedDerivedFromCandles() {
    this.cvd = 0;
    this.cvdSeries = [];
    this.volumeProfile.clear();
    // Footprint stays 1m — only reseed from candles when chart TF is 1m.
    if (this.candleSec === FOOTPRINT_SEC) this.footprintBars = [];
    const step = footprintStep(this.symbol);
    for (const c of this.candles) {
      const delta = (c.close >= c.open ? 1 : -1) * c.volume * 0.55;
      this.cvd += delta;
      this.cvdSeries.push({ time: c.time, value: this.cvd, delta });
      const buy = c.close >= c.open ? c.volume * 0.55 : c.volume * 0.45;
      const sell = c.volume - buy;
      this.bumpProfile(c.close, buy, sell);
      if (this.candleSec === FOOTPRINT_SEC) {
        bumpFootprint(this.footprintBars, FOOTPRINT_SEC, step, c.time, c.close, buy, sell);
      }
    }
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
      last.volume += size;
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

  private inferTick(bids: VenueLevel[], asks: VenueLevel[]): number {
    let tick = Infinity;
    for (let i = 1; i < Math.min(bids.length, 8); i++) {
      const d = Math.abs(bids[i - 1].price - bids[i].price);
      if (d > 0) tick = Math.min(tick, d);
    }
    for (let i = 1; i < Math.min(asks.length, 8); i++) {
      const d = Math.abs(asks[i].price - asks[i - 1].price);
      if (d > 0) tick = Math.min(tick, d);
    }
    return Number.isFinite(tick) && tick > 0 ? tick : 0;
  }

  private pushHeatmapFrame(nowMs: number) {
    const mid = this.book.mid || this.last;
    if (!mid) return;
    const srcBids = this.depthBids.length ? this.depthBids : this.book.bids;
    const srcAsks = this.depthAsks.length ? this.depthAsks : this.book.asks;
    if (!srcBids.length && !srcAsks.length) return;

    const lowestBid = srcBids[srcBids.length - 1]?.price ?? mid;
    const highestAsk = srcAsks[srcAsks.length - 1]?.price ?? mid;
    const bookHalf = Math.max(mid - lowestBid, highestAsk - mid, 0);
    const tick = this.inferTick(srcBids, srcAsks) || Math.max(mid * 1e-6, 0.01);
    const halfLevels = (HEATMAP_LEVELS - 1) / 2;
    const span = Math.min(
      mid * 0.02,
      Math.max(bookHalf * 1.35, tick * halfLevels, tick * 12),
    );

    const prices: number[] = new Array(HEATMAP_LEVELS);
    const bidSizes = new Array(HEATMAP_LEVELS).fill(0);
    const askSizes = new Array(HEATMAP_LEVELS).fill(0);
    for (let i = 0; i < HEATMAP_LEVELS; i++) {
      prices[i] = mid - span + (span * 2 * i) / (HEATMAP_LEVELS - 1);
    }

    const bucketIndex = (price: number) => {
      const t = (price - (mid - span)) / (span * 2 || 1);
      return Math.max(0, Math.min(HEATMAP_LEVELS - 1, Math.round(t * (HEATMAP_LEVELS - 1))));
    };

    const deposit = (arr: number[], price: number, size: number) => {
      const idx = bucketIndex(price);
      arr[idx] += size;
      if (idx > 0) arr[idx - 1] += size * 0.35;
      if (idx < HEATMAP_LEVELS - 1) arr[idx + 1] += size * 0.35;
      if (idx > 1) arr[idx - 2] += size * 0.12;
      if (idx < HEATMAP_LEVELS - 2) arr[idx + 2] += size * 0.12;
    };

    for (const b of srcBids) deposit(bidSizes, b.price, b.size);
    for (const a of srcAsks) deposit(askSizes, a.price, a.size);

    let maxBid = 0;
    let maxAsk = 0;
    for (let i = 0; i < HEATMAP_LEVELS; i++) {
      maxBid = Math.max(maxBid, bidSizes[i]);
      maxAsk = Math.max(maxAsk, askSizes[i]);
    }
    const norm = (v: number, max: number) =>
      max > 0 ? Math.log1p(v) / Math.log1p(max) : 0;

    const bids: number[] = new Array(HEATMAP_LEVELS);
    const asks: number[] = new Array(HEATMAP_LEVELS);
    for (let i = 0; i < HEATMAP_LEVELS; i++) {
      bids[i] = norm(bidSizes[i], maxBid);
      asks[i] = norm(askSizes[i], maxAsk);
    }

    const prev = this.heatmap[this.heatmap.length - 1];
    if (prev && nowMs - prev.time < HEATMAP_FRAME_MS) {
      prev.prices = prices;
      prev.bids = bids;
      prev.asks = asks;
      prev.time = nowMs;
    } else {
      this.heatmap.push({ time: nowMs, prices, bids, asks });
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
      footprint: serializeFootprint(this.footprintBars, last),
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

export const liveFeed = new LiveFeed();
