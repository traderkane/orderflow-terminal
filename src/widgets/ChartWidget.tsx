import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import {
  deleteControlAnchor,
  drawChartDrawings,
  getSymbolDrawings,
  hitTestDrawing,
  loadDrawings,
  newDrawingId,
  saveDrawings,
  setSymbolDrawings,
  type ChartDrawing,
  type DrawingTool,
  type TrendDraft,
} from '../lib/chartDrawings';
import { useTerminalStore } from '../store/useTerminalStore';
import type { Candle, HeatmapFrame, Trade, VolumeProfileBin } from '../types/market';

const UP = '#0ecb81';
const DOWN = '#f6465d';
const PANEL = '#0a0c10';
const GRID = '#12161e';
const TEXT = '#6b7280';
const ACCENT = '#f0b90b';

function frameTimeSec(t: number): number {
  // Live heatmap uses ms; mock uses unix seconds.
  return t > 1e12 ? t / 1000 : t;
}

function tradeTimeSec(t: number): number {
  return t > 1e12 ? t / 1000 : t;
}

/** Fallback VPVR from recent trades, else candles. */
function buildFallbackProfile(
  trades: Trade[],
  candles: Candle[],
): VolumeProfileBin[] {
  const bins = new Map<number, VolumeProfileBin>();
  const bump = (price: number, buy: number, sell: number) => {
    const step =
      price >= 1000 ? 5 : price >= 100 ? 0.5 : price >= 10 ? 0.05 : 0.001;
    const key = Math.round(price / step) * step;
    const prev = bins.get(key) ?? { price: key, buyVolume: 0, sellVolume: 0, total: 0 };
    prev.buyVolume += buy;
    prev.sellVolume += sell;
    prev.total += buy + sell;
    bins.set(key, prev);
  };

  if (trades.length) {
    for (const t of trades) {
      if (t.side === 'buy') bump(t.price, t.size, 0);
      else bump(t.price, 0, t.size);
    }
  } else {
    for (const c of candles.slice(-80)) {
      const mid = (c.high + c.low + c.close) / 3;
      const buy = c.close >= c.open ? c.volume * 0.55 : c.volume * 0.45;
      const sell = c.volume - buy;
      bump(mid, buy, sell);
      bump(c.high, buy * 0.15, sell * 0.15);
      bump(c.low, buy * 0.15, sell * 0.15);
    }
  }

  return [...bins.values()].sort((a, b) => a.price - b.price).slice(-80);
}

export function ChartWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);
  const cvdRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<{ setMarkers: (m: SeriesMarker<Time>[]) => void } | null>(null);
  const rafRef = useRef<number>(0);
  const heatmapRef = useRef<HeatmapFrame[]>([]);
  const profileRef = useRef<VolumeProfileBin[]>([]);
  const tradesRef = useRef<Trade[]>([]);
  const flagsRef = useRef({
    heatmap: true,
    profile: true,
    bubbles: true,
  });

  const [tool, setTool] = useState<DrawingTool>(null);
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletePos, setDeletePos] = useState<{ x: number; y: number } | null>(null);

  const toolRef = useRef<DrawingTool>(null);
  const drawingsRef = useRef<ChartDrawing[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const draftRef = useRef<TrendDraft | null>(null);
  const symbolRef = useRef(useTerminalStore.getState().symbol);

  const feed = useTerminalStore((s) => s.feed);
  const symbol = useTerminalStore((s) => s.symbol);
  const showVwap = useTerminalStore((s) => s.showVwap);
  const showCvdOverlay = useTerminalStore((s) => s.showCvdOverlay);
  const showLiqMarkers = useTerminalStore((s) => s.showLiqMarkers);
  const showHeatmap = useTerminalStore((s) => s.showHeatmap);
  const showProfile = useTerminalStore((s) => s.showProfile);
  const showBubbles = useTerminalStore((s) => s.showBubbles);
  const setShowVwap = useTerminalStore((s) => s.setShowVwap);
  const setShowCvdOverlay = useTerminalStore((s) => s.setShowCvdOverlay);
  const setShowLiqMarkers = useTerminalStore((s) => s.setShowLiqMarkers);
  const setShowHeatmap = useTerminalStore((s) => s.setShowHeatmap);
  const setShowProfile = useTerminalStore((s) => s.setShowProfile);
  const setShowBubbles = useTerminalStore((s) => s.setShowBubbles);

  flagsRef.current = {
    heatmap: showHeatmap,
    profile: showProfile,
    bubbles: showBubbles,
  };
  toolRef.current = tool;
  drawingsRef.current = drawings;
  selectedIdRef.current = selectedId;
  symbolRef.current = symbol;

  const persistDrawings = (next: ChartDrawing[]) => {
    drawingsRef.current = next;
    setDrawings(next);
    const all = loadDrawings();
    saveDrawings(setSymbolDrawings(all, symbolRef.current, next));
    scheduleOverlays();
  };

  const updateDeletePos = () => {
    const chart = chartRef.current;
    const series = candleRef.current;
    const parent = containerRef.current;
    const id = selectedIdRef.current;
    if (!chart || !series || !parent || !id) {
      setDeletePos(null);
      return;
    }
    const d = drawingsRef.current.find((x) => x.id === id);
    if (!d) {
      setDeletePos(null);
      return;
    }
    const anchor = deleteControlAnchor(d, chart, series, parent.clientWidth);
    setDeletePos(anchor);
  };

  const drawHeatmapLayer = (
    ctx: CanvasRenderingContext2D,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    w: number,
  ) => {
    const frames = heatmapRef.current;
    if (!frames.length) return;

    const recent = frames.slice(-120);
    const timeScale = chart.timeScale();

    const xMapped: Array<number | null> = recent.map((f) =>
      timeScale.timeToCoordinate(Math.floor(frameTimeSec(f.time)) as Time),
    );
    const validXs = xMapped.filter((x): x is number => x != null && Number.isFinite(x));
    let useStretch = validXs.length < 2;
    let x0 = 0;
    let x1 = w;
    if (!useStretch) {
      x0 = Math.min(...validXs);
      x1 = Math.max(...validXs);
      if (x1 - x0 < w * 0.22) useStretch = true;
    }

    let peak = 0;
    for (const frame of recent) {
      const n = frame.prices.length;
      for (let y = 0; y < n; y++) {
        peak = Math.max(peak, frame.bids[y] ?? 0, frame.asks[y] ?? 0);
      }
    }
    const invPeak = peak > 0 ? 1 / peak : 1;

    const stretchLeft = w * 0.28;
    const stretchRight = w - 8;
    const stretchSpan = Math.max(1, stretchRight - stretchLeft);

    for (let i = 0; i < recent.length; i++) {
      const frame = recent[i];
      let xLeft: number;
      let xRight: number;

      if (useStretch) {
        xLeft = stretchLeft + (i / recent.length) * stretchSpan;
        xRight = stretchLeft + ((i + 1) / recent.length) * stretchSpan;
      } else {
        const x = xMapped[i];
        if (x == null || !Number.isFinite(x)) continue;
        const prev = i > 0 ? xMapped[i - 1] : null;
        const next = i + 1 < xMapped.length ? xMapped[i + 1] : null;
        const leftGap =
          prev != null && Number.isFinite(prev)
            ? (x - prev) / 2
            : Math.max(2, (x1 - x0) / recent.length / 2);
        const rightGap =
          next != null && Number.isFinite(next)
            ? (next - x) / 2
            : Math.max(2, (x1 - x0) / recent.length / 2);
        xLeft = x - leftGap;
        xRight = x + rightGap;
      }

      const cellW = Math.max(1, xRight - xLeft);
      const levels = frame.prices.length;
      if (levels < 2) continue;

      for (let y = 0; y < levels; y++) {
        const bid = frame.bids[y] ?? 0;
        const ask = frame.asks[y] ?? 0;
        const raw = Math.max(bid, ask) * invPeak;
        if (raw < 0.03) continue;
        const intensity = Math.min(1, Math.pow(raw, 0.55));
        const price = frame.prices[y];
        const yCoord = series.priceToCoordinate(price);
        if (yCoord == null || !Number.isFinite(yCoord)) continue;

        let yTop: number;
        let yBot: number;
        if (y + 1 < levels) {
          const yNext = series.priceToCoordinate(frame.prices[y + 1]);
          if (yNext == null) continue;
          yTop = Math.min(yCoord, yNext);
          yBot = Math.max(yCoord, yNext);
        } else if (y > 0) {
          const yPrev = series.priceToCoordinate(frame.prices[y - 1]);
          if (yPrev == null) continue;
          const half = Math.abs(yCoord - yPrev);
          yTop = yCoord - half / 2;
          yBot = yCoord + half / 2;
        } else {
          continue;
        }

        const cellH = Math.max(1, yBot - yTop);
        const isBid = bid >= ask;
        const alpha = 0.08 + intensity * 0.42;
        ctx.fillStyle = isBid
          ? `rgba(14, 203, 129, ${alpha})`
          : `rgba(246, 70, 93, ${alpha})`;
        ctx.fillRect(
          Math.floor(xLeft),
          Math.floor(yTop),
          Math.ceil(cellW) + 1,
          Math.ceil(cellH) + 1,
        );
      }
    }
  };

  const drawProfileLayer = (
    ctx: CanvasRenderingContext2D,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    paneH: number,
  ) => {
    const profile = profileRef.current;
    if (!profile.length) return;

    const plotW = chart.timeScale().width();
    if (plotW <= 0) return;

    let maxVol = 0;
    let pocPrice = profile[0].price;
    for (const bin of profile) {
      if (bin.total > maxVol) {
        maxVol = bin.total;
        pocPrice = bin.price;
      }
    }
    if (maxVol <= 0) return;

    const maxBarW = Math.max(36, plotW * 0.18);
    const right = plotW - 2;

    // Soft backdrop so bars stay readable over candles/heatmap.
    ctx.fillStyle = 'rgba(5, 6, 8, 0.28)';
    ctx.fillRect(right - maxBarW - 4, 0, maxBarW + 6, paneH);

    for (let i = 0; i < profile.length; i++) {
      const bin = profile[i];
      const y = series.priceToCoordinate(bin.price);
      if (y == null || !Number.isFinite(y)) continue;

      let h: number;
      if (i + 1 < profile.length) {
        const yNext = series.priceToCoordinate(profile[i + 1].price);
        h =
          yNext != null && Number.isFinite(yNext)
            ? Math.max(1.5, Math.abs(yNext - y))
            : 3;
      } else if (i > 0) {
        const yPrev = series.priceToCoordinate(profile[i - 1].price);
        h =
          yPrev != null && Number.isFinite(yPrev)
            ? Math.max(1.5, Math.abs(y - yPrev))
            : 3;
      } else {
        h = 3;
      }

      const barW = (bin.total / maxVol) * maxBarW;
      const buyShare = bin.total ? bin.buyVolume / bin.total : 0.5;
      const buyW = barW * buyShare;
      const sellW = barW - buyW;
      const x0 = right - barW;
      const yTop = y - h / 2;
      const isPoc = bin.price === pocPrice;

      if (buyW > 0.5) {
        ctx.fillStyle = isPoc ? 'rgba(14, 203, 129, 0.72)' : 'rgba(14, 203, 129, 0.42)';
        ctx.fillRect(x0, yTop, buyW, h);
      }
      if (sellW > 0.5) {
        ctx.fillStyle = isPoc ? 'rgba(246, 70, 93, 0.72)' : 'rgba(246, 70, 93, 0.42)';
        ctx.fillRect(x0 + buyW, yTop, sellW, h);
      }
    }

    const pocY = series.priceToCoordinate(pocPrice);
    if (pocY != null && Number.isFinite(pocY)) {
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, right - maxBarW - 8), pocY);
      ctx.lineTo(right, pocY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '600 9px IBM Plex Mono, JetBrains Mono, monospace';
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = 0.95;
      const label = `POC ${pocPrice.toFixed(pocPrice >= 100 ? 1 : 2)}`;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, Math.max(4, right - tw - 6), pocY - 4);
      ctx.restore();
    }
  };

  const drawBubblesLayer = (
    ctx: CanvasRenderingContext2D,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
  ) => {
    const trades = tradesRef.current;
    if (!trades.length) return;

    const sizes = trades.map((t) => t.size).sort((a, b) => a - b);
    const p75 = sizes[Math.floor(sizes.length * 0.75)] ?? 1;
    const floor = Math.max(0.35, p75 * 0.85);
    const large = trades.filter((t) => t.size >= floor).slice(0, 60);
    if (!large.length) return;

    const timeScale = chart.timeScale();
    const maxSize = Math.max(...large.map((t) => t.size), floor);
    const nowSec = tradeTimeSec(trades[0]?.time ?? Date.now());

    // Oldest first so newer bubbles paint on top.
    const ordered = [...large].sort((a, b) => a.time - b.time);

    for (const t of ordered) {
      const tSec = tradeTimeSec(t.time);
      const xBase = timeScale.timeToCoordinate(Math.floor(tSec) as Time);
      if (xBase == null || !Number.isFinite(xBase)) continue;
      // Mild intra-minute offset so stacked prints don't fully overlap.
      const frac = tSec - Math.floor(tSec / 60) * 60;
      const x = (xBase as number) + Math.min(10, (frac / 60) * 12);

      const y = series.priceToCoordinate(t.price);
      if (y == null || !Number.isFinite(y)) continue;

      const norm = Math.sqrt(t.size / maxSize);
      const r = 2.5 + norm * 11;
      const ageSec = Math.max(0, nowSec - tSec);
      const fade = Math.max(0.25, 1 - ageSec / 180);
      const isBuy = t.side === 'buy';
      const fill = isBuy
        ? `rgba(14, 203, 129, ${0.18 + fade * 0.35})`
        : `rgba(246, 70, 93, ${0.18 + fade * 0.35})`;
      const stroke = isBuy
        ? `rgba(14, 203, 129, ${0.45 + fade * 0.45})`
        : `rgba(246, 70, 93, ${0.45 + fade * 0.45})`;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = t.size >= maxSize * 0.6 ? 1.5 : 1;
      ctx.strokeStyle = stroke;
      ctx.stroke();

      if (t.size >= maxSize * 0.55) {
        ctx.font = '600 8px IBM Plex Mono, JetBrains Mono, monospace';
        ctx.fillStyle = isBuy ? 'rgba(14,203,129,0.9)' : 'rgba(246,70,93,0.9)';
        const label = t.size >= 10 ? t.size.toFixed(1) : t.size.toFixed(2);
        ctx.fillText(label, x + r + 2, y + 3);
      }
    }
  };

  const drawOverlays = () => {
    const canvas = overlayRef.current;
    const chart = chartRef.current;
    const series = candleRef.current;
    const parent = containerRef.current;
    if (!canvas || !chart || !series || !parent) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const flags = flagsRef.current;
    if (flags.heatmap) drawHeatmapLayer(ctx, chart, series, w);
    if (flags.bubbles) drawBubblesLayer(ctx, chart, series);
    if (flags.profile) drawProfileLayer(ctx, chart, series, h);

    // Drawings sit above Heatmap / Bubbles / Profile.
    drawChartDrawings(
      ctx,
      chart,
      series,
      w,
      h,
      drawingsRef.current,
      selectedIdRef.current,
      draftRef.current,
    );
    updateDeletePos();
  };

  const scheduleOverlays = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawOverlays();
    });
  };

  // Load drawings when symbol changes.
  useEffect(() => {
    const next = getSymbolDrawings(loadDrawings(), symbol);
    drawingsRef.current = next;
    setDrawings(next);
    setSelectedId(null);
    selectedIdRef.current = null;
    draftRef.current = null;
    setDeletePos(null);
    scheduleOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: PANEL },
        textColor: TEXT,
        fontFamily: 'IBM Plex Mono, JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: {
        borderColor: '#161a22',
        scaleMargins: { top: 0.08, bottom: 0.18 },
      },
      timeScale: {
        borderColor: '#161a22',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: 'rgba(212,212,216,0.28)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1a2030',
        },
        horzLine: {
          color: 'rgba(212,212,216,0.28)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1a2030',
        },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
    });

    const vwap = chart.addSeries(LineSeries, {
      color: '#f0b90b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const cvd = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 1,
      priceScaleId: 'cvd',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    chart.priceScale('cvd').applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.55 },
      borderVisible: false,
    });

    markersRef.current = createSeriesMarkers(candles, []);

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    vwapRef.current = vwap;
    cvdRef.current = cvd;

    const onRange = () => scheduleOverlays();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);

    const onClick = (param: MouseEventParams<Time>) => {
      const series = candleRef.current;
      if (!series || !param.point) return;

      const { x, y } = param.point;
      const price = series.coordinateToPrice(y);
      if (price == null || !Number.isFinite(Number(price))) return;
      const priceN = Number(price);

      const active = toolRef.current;

      if (active === 'hline') {
        const next: ChartDrawing[] = [
          ...drawingsRef.current,
          { id: newDrawingId(), type: 'hline', price: priceN },
        ];
        setSelectedId(null);
        selectedIdRef.current = null;
        persistDrawings(next);
        return;
      }

      if (active === 'trend') {
        const timeVal = chart.timeScale().coordinateToTime(x);
        // Prefer chart time; fall back to logical mapping via param.time.
        let tSec: number | null = null;
        if (typeof timeVal === 'number') tSec = timeVal;
        else if (typeof param.time === 'number') tSec = param.time;
        if (tSec == null || !Number.isFinite(tSec)) return;

        const draft = draftRef.current;
        if (!draft) {
          draftRef.current = { t1: tSec, p1: priceN };
          setSelectedId(null);
          selectedIdRef.current = null;
          scheduleOverlays();
          return;
        }

        const next: ChartDrawing[] = [
          ...drawingsRef.current,
          {
            id: newDrawingId(),
            type: 'trend',
            t1: draft.t1,
            p1: draft.p1,
            t2: tSec,
            p2: priceN,
          },
        ];
        draftRef.current = null;
        setSelectedId(null);
        selectedIdRef.current = null;
        persistDrawings(next);
        return;
      }

      // Select mode — hit-test drawings (does not block chart pan/zoom).
      const hit = hitTestDrawing(drawingsRef.current, chart, series, x, y);
      const id = hit?.id ?? null;
      selectedIdRef.current = id;
      setSelectedId(id);
      scheduleOverlays();
    };

    const onCrosshair = (param: MouseEventParams<Time>) => {
      const draft = draftRef.current;
      if (!draft || !param.point) return;
      const series = candleRef.current;
      if (!series) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null || !Number.isFinite(Number(price))) return;
      let tSec: number | null = null;
      const timeVal = chart.timeScale().coordinateToTime(param.point.x);
      if (typeof timeVal === 'number') tSec = timeVal;
      else if (typeof param.time === 'number') tSec = param.time;
      if (tSec == null) return;
      draftRef.current = { ...draft, t2: tSec, p2: Number(price) };
      scheduleOverlays();
    };

    chart.subscribeClick(onClick);
    chart.subscribeCrosshairMove(onCrosshair);

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
      scheduleOverlays();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.unsubscribeClick(onClick);
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!feed || !candleRef.current || !volumeRef.current) return;

    candleRef.current.setData(
      feed.candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    volumeRef.current.setData(
      feed.candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(14,203,129,0.45)' : 'rgba(246,70,93,0.45)',
      })),
    );

    if (vwapRef.current) {
      if (showVwap) {
        const series = feed.vwapSeries?.length
          ? feed.vwapSeries
          : feed.candles.map((c) => ({ time: c.time, value: feed.vwap }));
        vwapRef.current.setData(
          series.map((p) => ({ time: p.time as Time, value: p.value })),
        );
      } else {
        vwapRef.current.setData([]);
      }
    }

    if (cvdRef.current) {
      if (showCvdOverlay) {
        cvdRef.current.setData(
          feed.cvd.map((p) => ({ time: p.time as Time, value: p.value })),
        );
      } else {
        cvdRef.current.setData([]);
      }
    }

    if (markersRef.current) {
      if (showLiqMarkers) {
        const markers: SeriesMarker<Time>[] = feed.liquidations.slice(0, 25).map((l) => ({
          time: Math.floor(l.time / 1000) as unknown as Time,
          position: l.side === 'long' ? 'belowBar' : 'aboveBar',
          color: l.side === 'long' ? DOWN : UP,
          shape: l.side === 'long' ? 'arrowUp' : 'arrowDown',
          text: `Liq ${l.size.toFixed(1)}`,
        }));
        const byTime = new Map<number, SeriesMarker<Time>>();
        for (const m of markers) byTime.set(Number(m.time), m);
        markersRef.current.setMarkers(
          [...byTime.values()].sort((a, b) => Number(a.time) - Number(b.time)),
        );
      } else {
        markersRef.current.setMarkers([]);
      }
    }

    heatmapRef.current = feed.heatmap ?? [];
    tradesRef.current = feed.trades ?? [];
    profileRef.current =
      feed.volumeProfile?.length > 0
        ? feed.volumeProfile
        : buildFallbackProfile(feed.trades ?? [], feed.candles ?? []);
    scheduleOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, showVwap, showCvdOverlay, showLiqMarkers]);

  useEffect(() => {
    scheduleOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHeatmap, showProfile, showBubbles, selectedId, drawings, tool]);

  // Delete / Backspace removes selected; Escape cancels tool / draft / selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (toolRef.current || draftRef.current || selectedIdRef.current) {
          e.stopPropagation();
          setTool(null);
          toolRef.current = null;
          draftRef.current = null;
          selectedIdRef.current = null;
          setSelectedId(null);
          scheduleOverlays();
        }
        return;
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedIdRef.current
      ) {
        e.preventDefault();
        const id = selectedIdRef.current;
        const next = drawingsRef.current.filter((d) => d.id !== id);
        selectedIdRef.current = null;
        setSelectedId(null);
        persistDrawings(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTool = (next: DrawingTool) => {
    draftRef.current = null;
    if (tool === next) {
      setTool(null);
      toolRef.current = null;
    } else {
      setTool(next);
      toolRef.current = next;
      selectedIdRef.current = null;
      setSelectedId(null);
    }
    scheduleOverlays();
  };

  const clearAllDrawings = () => {
    draftRef.current = null;
    selectedIdRef.current = null;
    setSelectedId(null);
    persistDrawings([]);
  };

  const deleteSelected = () => {
    const id = selectedIdRef.current;
    if (!id) return;
    const next = drawingsRef.current.filter((d) => d.id !== id);
    selectedIdRef.current = null;
    setSelectedId(null);
    persistDrawings(next);
  };

  const cursorClass =
    tool === 'hline' || tool === 'trend' ? 'cursor-crosshair' : '';

  return (
    <div className={`relative flex h-full flex-col ${cursorClass}`}>
      <div className="absolute left-1.5 top-1.5 z-10 flex overflow-hidden rounded-[2px] border border-terminal-border bg-black/55 backdrop-blur-[2px]">
        <Toggle label="Heatmap" on={showHeatmap} onClick={() => setShowHeatmap(!showHeatmap)} />
        <Toggle label="Profile" on={showProfile} onClick={() => setShowProfile(!showProfile)} />
        <Toggle label="Bubbles" on={showBubbles} onClick={() => setShowBubbles(!showBubbles)} />
        <Toggle label="VWAP" on={showVwap} onClick={() => setShowVwap(!showVwap)} />
        <Toggle label="CVD" on={showCvdOverlay} onClick={() => setShowCvdOverlay(!showCvdOverlay)} />
        <Toggle label="Liqs" on={showLiqMarkers} onClick={() => setShowLiqMarkers(!showLiqMarkers)} />
      </div>

      <div className="absolute right-1.5 top-1.5 z-10 flex overflow-hidden rounded-[2px] border border-terminal-border bg-black/55 backdrop-blur-[2px]">
        <Toggle
          label="H-Line"
          on={tool === 'hline'}
          onClick={() => toggleTool('hline')}
          title="Horizontal line — click chart to place"
        />
        <Toggle
          label="Trend"
          on={tool === 'trend'}
          onClick={() => toggleTool('trend')}
          title="Trend line — two clicks to place"
        />
        <Toggle
          label="Clear"
          on={false}
          onClick={clearAllDrawings}
          title="Clear all drawings for this symbol"
          danger
        />
      </div>

      {tool && (
        <div className="pointer-events-none absolute left-1/2 top-8 z-10 -translate-x-1/2 rounded-[2px] border border-terminal-border bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400 backdrop-blur-[2px]">
          {tool === 'hline'
            ? 'Click to place horizontal'
            : 'Trend — click start, then end · Esc cancel'}
        </div>
      )}

      <div ref={containerRef} className="h-full w-full" />
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden
      />

      {selectedId && deletePos && (
        <button
          type="button"
          title="Delete drawing"
          onClick={deleteSelected}
          className="absolute z-[3] flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2px] border border-terminal-border-strong bg-black/80 text-[10px] leading-none text-zinc-300 hover:border-down/50 hover:text-down"
          style={{ left: deletePos.x, top: deletePos.y }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function Toggle({
  label,
  on,
  onClick,
  title,
  danger,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        on
          ? 'bg-up/15 text-up'
          : danger
            ? 'text-zinc-500 hover:bg-down/10 hover:text-down'
            : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
}
