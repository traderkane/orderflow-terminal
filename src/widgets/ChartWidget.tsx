import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import {
  DRAWING_COLORS,
  FIB_TOGGLE_LEVELS,
  LINE_WIDTHS,
  MAGNET_PX,
  activeFibLevels,
  applyDrawingDrag,
  defaultDrawingStyle,
  deleteControlAnchor,
  drawChartDrawings,
  drawMagnetPreview,
  drawingTypeLabel,
  drawingTypeShort,
  formatDrawingPrice,
  getSymbolDrawings,
  hitTestDrawingDetailed,
  isDrawingVisible,
  isPlaceTool,
  isSelectTool,
  loadDrawings,
  magnetSnap,
  newDrawingId,
  normalizeFibLevels,
  saveDrawings,
  setSymbolDrawings,
  withDrawingDefaults,
  type ChartDrawing,
  type DrawingHit,
  type DrawingTool,
  type HandleId,
  type TwoPointDraft,
} from '../lib/chartDrawings';
import { CHART_INTERVALS, intervalToSec, type ChartInterval } from '../lib/chartIntervals';
import type { ChartMode } from '../lib/chartMode';
import {
  computeBarStatColors,
  type BarStatsMetric,
} from '../lib/barStats';
import { tradeCountsFromTrades } from '../lib/tradeCount';
import {
  VWAP_ANCHORS,
  VWAP_ANCHOR_COLOR,
  VWAP_ANCHOR_LABEL,
  VWAP_ANCHOR_TITLE,
  computeVwapSeriesForAnchor,
  toggleVwapAnchor,
  type VwapAnchor,
} from '../lib/vwap';
import {
  FOOTPRINT_IMBALANCE_RATIO,
  FOOTPRINT_STACK_MIN,
  detectNakedPocs,
  detectStackedImbalances,
  footprintBarsForChart,
  footprintCellImbalance,
  footprintStep,
  formatFootprintVol,
  stackedImbalanceKey,
} from '../data/footprint';
import {
  HEATMAP_COLORMAPS,
  heatmapCellColor,
  loadHeatmapCraft,
  patchHeatmapCraft,
  peakPercentile,
  rebinHeatLevels,
  splatBlend,
  type HeatmapCraftPrefs,
} from '../lib/heatmapCraft';
import { useTerminalStore } from '../store/useTerminalStore';
import type {
  Candle,
  FootprintBar,
  HeatmapFrame,
  Trade,
  VolumeProfileBin,
} from '../types/market';

const UP = '#0ecb81';
const DOWN = '#f6465d';
const PANEL = '#0a0c10';
const GRID = '#12161e';
const TEXT = '#6b7280';
const ACCENT = '#f0b90b';

type HoverCursor = 'crosshair' | 'grab' | 'grabbing' | 'pointer' | 'default';

function frameTimeSec(t: number): number {
  return t > 1e12 ? t / 1000 : t;
}

function tradeTimeSec(t: number): number {
  return t > 1e12 ? t / 1000 : t;
}

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

type DragState = {
  id: string;
  handle: HandleId;
  lastPrice: number;
  lastTime: number;
};

export function ChartWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const buyCountRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const sellCountRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapRefs = useRef<Partial<Record<VwapAnchor, ISeriesApi<'Line'>>>>({});
  const cvdRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<{ setMarkers: (m: SeriesMarker<Time>[]) => void } | null>(null);
  const rafRef = useRef<number>(0);
  const heatmapRef = useRef<HeatmapFrame[]>([]);
  const profileRef = useRef<VolumeProfileBin[]>([]);
  const tradesRef = useRef<Trade[]>([]);
  const footprintRef = useRef<FootprintBar[]>([]);
  const chartModeRef = useRef<ChartMode>('candles');
  const intervalSecRef = useRef(60);
  const flagsRef = useRef({
    heatmap: true,
    profile: true,
    bubbles: true,
  });

  const [tool, setTool] = useState<DrawingTool>('select');
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletePos, setDeletePos] = useState<{ x: number; y: number } | null>(null);
  const [hoverCursor, setHoverCursor] = useState<HoverCursor>('default');
  const [priceEdit, setPriceEdit] = useState<{ id: string; value: string } | null>(null);
  const [magnetOn, setMagnetOn] = useState(true);
  const [objectTreeOpen, setObjectTreeOpen] = useState(false);
  const [vwapMenuOpen, setVwapMenuOpen] = useState(false);
  const [barStatsMenuOpen, setBarStatsMenuOpen] = useState(false);
  const [layersMenuOpen, setLayersMenuOpen] = useState(false);
  const [heatmapMenuOpen, setHeatmapMenuOpen] = useState(false);
  const [heatmapCraft, setHeatmapCraft] = useState<HeatmapCraftPrefs>(() =>
    loadHeatmapCraft(),
  );
  const heatmapCraftRef = useRef<HeatmapCraftPrefs>(heatmapCraft);
  heatmapCraftRef.current = heatmapCraft;

  const updateHeatmapCraft = (partial: Partial<HeatmapCraftPrefs>) => {
    const next = patchHeatmapCraft(partial);
    setHeatmapCraft(next);
  };

  const toolRef = useRef<DrawingTool>('select');
  const drawingsRef = useRef<ChartDrawing[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const draftRef = useRef<TwoPointDraft | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const symbolRef = useRef(useTerminalStore.getState().symbol);
  const magnetRef = useRef(true);
  const magnetPreviewRef = useRef<{
    x: number;
    y: number;
    snapped: boolean;
  } | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const hoverPriceLineRef = useRef<IPriceLine | null>(null);
  const focusPriceLineRef = useRef<IPriceLine | null>(null);
  const lastChartHoverRef = useRef<number | null>(null);

  const feed = useTerminalStore((s) => s.feed);
  const symbol = useTerminalStore((s) => s.symbol);
  const showVwap = useTerminalStore((s) => s.showVwap);
  const vwapAnchors = useTerminalStore((s) => s.vwapAnchors);
  const showBarStats = useTerminalStore((s) => s.showBarStats);
  const barStatsMetric = useTerminalStore((s) => s.barStatsMetric);
  const volumePaneMode = useTerminalStore((s) => s.volumePaneMode);
  const showCvdOverlay = useTerminalStore((s) => s.showCvdOverlay);
  const showLiqMarkers = useTerminalStore((s) => s.showLiqMarkers);
  const showHeatmap = useTerminalStore((s) => s.showHeatmap);
  const showProfile = useTerminalStore((s) => s.showProfile);
  const showBubbles = useTerminalStore((s) => s.showBubbles);
  const chartInterval = useTerminalStore((s) => s.chartInterval);
  const setChartInterval = useTerminalStore((s) => s.setChartInterval);
  const chartMode = useTerminalStore((s) => s.chartMode);
  const setChartMode = useTerminalStore((s) => s.setChartMode);
  const setShowVwap = useTerminalStore((s) => s.setShowVwap);
  const setVwapAnchors = useTerminalStore((s) => s.setVwapAnchors);
  const setShowBarStats = useTerminalStore((s) => s.setShowBarStats);
  const setBarStatsMetric = useTerminalStore((s) => s.setBarStatsMetric);
  const setVolumePaneMode = useTerminalStore((s) => s.setVolumePaneMode);
  const setShowCvdOverlay = useTerminalStore((s) => s.setShowCvdOverlay);
  const setShowLiqMarkers = useTerminalStore((s) => s.setShowLiqMarkers);
  const setShowHeatmap = useTerminalStore((s) => s.setShowHeatmap);
  const setShowProfile = useTerminalStore((s) => s.setShowProfile);
  const setShowBubbles = useTerminalStore((s) => s.setShowBubbles);
  const hoverPrice = useTerminalStore((s) => s.hoverPrice);
  const hoverSource = useTerminalStore((s) => s.hoverSource);
  const focusPrice = useTerminalStore((s) => s.focusPrice);

  flagsRef.current = {
    heatmap: showHeatmap,
    profile: showProfile,
    bubbles: showBubbles,
  };
  toolRef.current = tool;
  drawingsRef.current = drawings;
  selectedIdRef.current = selectedId;
  symbolRef.current = symbol;
  magnetRef.current = magnetOn;
  chartModeRef.current = chartMode;
  intervalSecRef.current = intervalToSec(chartInterval);

  const setChartInteraction = (enabled: boolean) => {
    chartRef.current?.applyOptions({
      handleScroll: enabled,
      handleScale: enabled,
    });
  };

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

  const pointFromEvent = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number; price: number; time: number } | null => {
    const parent = containerRef.current;
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!parent || !chart || !series) return null;
    const rect = parent.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const price = series.coordinateToPrice(y);
    if (price == null || !Number.isFinite(Number(price))) return null;
    let tSec: number | null = null;
    const timeVal = chart.timeScale().coordinateToTime(x);
    if (typeof timeVal === 'number') tSec = timeVal;
    if (tSec == null || !Number.isFinite(tSec)) {
      // Fallback: logical estimate from visible range mid when off-scale
      tSec = Date.now() / 1000;
    }
    return { x, y, price: Number(price), time: tSec };
  };

  const snapPoint = (
    x: number,
    y: number,
    price: number,
    time: number,
  ): { price: number; time: number } => {
    if (!magnetRef.current) return { price, time };
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series) return { price, time };
    return magnetSnap(chart, series, candlesRef.current, x, y, price, time);
  };

  const updateMagnetPreview = (
    x: number,
    y: number,
    price: number,
    time: number,
  ) => {
    if (!magnetRef.current) {
      if (magnetPreviewRef.current) {
        magnetPreviewRef.current = null;
        scheduleOverlays();
      }
      return;
    }
    const chart = chartRef.current;
    const series = candleRef.current;
    if (!chart || !series) return;
    const snapped = magnetSnap(
      chart,
      series,
      candlesRef.current,
      x,
      y,
      price,
      time,
      MAGNET_PX,
    );
    const didSnap = snapped.price !== price || snapped.time !== time;
    let sx = x;
    let sy = y;
    if (didSnap) {
      const cx = chart.timeScale().timeToCoordinate(Math.floor(snapped.time) as Time);
      const cy = series.priceToCoordinate(snapped.price);
      if (cx != null && cy != null && Number.isFinite(cx) && Number.isFinite(cy)) {
        sx = cx;
        sy = cy;
      }
    }
    const prev = magnetPreviewRef.current;
    if (
      prev &&
      Math.abs(prev.x - sx) < 0.5 &&
      Math.abs(prev.y - sy) < 0.5 &&
      prev.snapped === didSnap
    ) {
      return;
    }
    magnetPreviewRef.current = { x: sx, y: sy, snapped: didSnap };
    scheduleOverlays();
  };

  const drawHeatmapLayer = (
    ctx: CanvasRenderingContext2D,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
    w: number,
  ) => {
    const frames = heatmapRef.current;
    if (!frames.length) return;

    const craft = heatmapCraftRef.current;
    const recent = frames.slice(-180);
    const timeScale = chart.timeScale();
    const plotW = Math.max(1, timeScale.width() || w);

    const xMapped: Array<number | null> = recent.map((f) =>
      timeScale.timeToCoordinate(Math.floor(frameTimeSec(f.time)) as Time),
    );
    const validXs = xMapped.filter((x): x is number => x != null && Number.isFinite(x));
    // Extend-live: stretch trail to the right edge when mapped span is thin / empty.
    // Off: prefer true time mapping only (no live right-edge crawl).
    let useStretch = craft.extendLive && validXs.length < 2;
    let x0 = 0;
    let x1 = plotW;
    if (validXs.length >= 2) {
      x0 = Math.min(...validXs);
      x1 = Math.max(...validXs);
      if (craft.extendLive && x1 - x0 < plotW * 0.42) useStretch = true;
      else useStretch = false;
    } else if (!craft.extendLive) {
      useStretch = false;
    }

    // Soft peak from craft.peakIntensity (p70..p99) — walls bright without crush.
    const samples: number[] = [];
    for (const frame of recent) {
      const rebinned = rebinHeatLevels(
        frame.prices,
        frame.bids,
        frame.asks,
        craft.binMode,
      );
      const n = rebinned.prices.length;
      for (let y = 0; y < n; y++) {
        const v = Math.max(rebinned.bids[y] ?? 0, rebinned.asks[y] ?? 0);
        if (v > 0.001) samples.push(v);
      }
    }
    samples.sort((a, b) => a - b);
    const pct = peakPercentile(craft.peakIntensity);
    const peak =
      samples.length > 0
        ? samples[Math.min(samples.length - 1, Math.floor(samples.length * pct))]
        : 1;
    const invPeak = peak > 0 ? 1 / peak : 1;
    const lowGate = Math.max(0.004, craft.lowIntensity * 0.9);
    const isSplat = craft.style === 'splat';
    const gamma = isSplat ? 0.58 : 0.48;
    const alphaScale = isSplat ? 0.42 : 0.52;
    const alphaFloor = isSplat ? 0.05 : 0.07;

    const stretchLeft = Math.max(8, plotW * 0.12);
    const stretchRight = craft.extendLive ? plotW - 6 : Math.min(plotW - 6, (x1 || plotW) + 4);
    const stretchSpan = Math.max(1, stretchRight - stretchLeft);

    if (isSplat) {
      ctx.save();
      // Soft bloom — stand-in for MMT splat without proprietary filters.
      ctx.filter = 'blur(0.65px)';
      ctx.globalCompositeOperation = 'lighter';
    }

    for (let i = 0; i < recent.length; i++) {
      const frame = recent[i];
      const rebinned = rebinHeatLevels(
        frame.prices,
        frame.bids,
        frame.asks,
        craft.binMode,
      );
      let xLeft: number;
      let xRight: number;

      if (useStretch) {
        // Ease columns so recent frames occupy more horizontal room (MMT trail).
        const t0 = i / recent.length;
        const t1 = (i + 1) / recent.length;
        const ease = (t: number) => t * t * (3 - 2 * t);
        xLeft = stretchLeft + ease(t0) * stretchSpan;
        xRight = stretchLeft + ease(t1) * stretchSpan;
      } else {
        const x = xMapped[i];
        if (x == null || !Number.isFinite(x)) continue;
        const prev = i > 0 ? xMapped[i - 1] : null;
        const next = i + 1 < xMapped.length ? xMapped[i + 1] : null;
        const leftGap =
          prev != null && Number.isFinite(prev)
            ? Math.max(1.2, (x - prev) / 2)
            : Math.max(2, (x1 - x0) / recent.length / 2);
        const rightGap =
          next != null && Number.isFinite(next)
            ? Math.max(1.2, (next - x) / 2)
            : Math.max(2, (x1 - x0) / recent.length / 2);
        xLeft = x - leftGap;
        xRight = x + rightGap;
      }

      // Slight overlap smooths temporal seams; splat uses a wider pad.
      const pad = Math.min(
        isSplat ? 2.4 : 1.25,
        Math.max(0.35, (xRight - xLeft) * (isSplat ? 0.28 : 0.15)),
      );
      xLeft -= pad;
      xRight += pad;

      const cellW = Math.max(1, xRight - xLeft);
      const levels = rebinned.prices.length;
      if (levels < 2) continue;

      const yCoords: Array<number | null> = new Array(levels);
      for (let y = 0; y < levels; y++) {
        const yc = series.priceToCoordinate(rebinned.prices[y]);
        yCoords[y] = yc != null && Number.isFinite(yc) ? yc : null;
      }

      for (let y = 0; y < levels; y++) {
        const bid = rebinned.bids[y] ?? 0;
        const ask = rebinned.asks[y] ?? 0;
        let bidN: number;
        let askN: number;
        if (isSplat) {
          bidN = splatBlend(
            bid,
            rebinned.bids[y - 1] ?? bid,
            rebinned.bids[y + 1] ?? bid,
            rebinned.bids[y - 2] ?? bid,
            rebinned.bids[y + 2] ?? bid,
          );
          askN = splatBlend(
            ask,
            rebinned.asks[y - 1] ?? ask,
            rebinned.asks[y + 1] ?? ask,
            rebinned.asks[y - 2] ?? ask,
            rebinned.asks[y + 2] ?? ask,
          );
        } else {
          bidN =
            bid * 0.55 +
            (rebinned.bids[y - 1] ?? bid) * 0.225 +
            (rebinned.bids[y + 1] ?? bid) * 0.225;
          askN =
            ask * 0.55 +
            (rebinned.asks[y - 1] ?? ask) * 0.225 +
            (rebinned.asks[y + 1] ?? ask) * 0.225;
        }
        const rawBid = Math.min(1.35, bidN * invPeak);
        const rawAsk = Math.min(1.35, askN * invPeak);
        if (rawBid < lowGate && rawAsk < lowGate) continue;

        const yCoord = yCoords[y];
        if (yCoord == null) continue;

        let yTop: number;
        let yBot: number;
        const yNext = y + 1 < levels ? yCoords[y + 1] : null;
        const yPrev = y > 0 ? yCoords[y - 1] : null;
        if (yNext != null) {
          yTop = Math.min(yCoord, yNext);
          yBot = Math.max(yCoord, yNext);
        } else if (yPrev != null) {
          const half = Math.abs(yCoord - yPrev);
          yTop = yCoord - half / 2;
          yBot = yCoord + half / 2;
        } else {
          continue;
        }

        // Splat expands cells slightly for a blurrier wall.
        if (isSplat) {
          const inflate = Math.max(0.4, (yBot - yTop) * 0.2);
          yTop -= inflate;
          yBot += inflate;
        }

        const cellH = Math.max(1, yBot - yTop);
        const bidI = Math.min(1, Math.pow(Math.max(0, rawBid), gamma));
        const askI = Math.min(1, Math.pow(Math.max(0, rawAsk), gamma));
        if (bidI < craft.lowIntensity && askI < craft.lowIntensity) continue;

        const paint = (side: 'bid' | 'ask', intensity: number, aMul: number) => {
          if (intensity < craft.lowIntensity) return;
          const alpha = (alphaFloor + intensity * alphaScale) * aMul;
          ctx.fillStyle = heatmapCellColor(
            craft.colormap,
            side,
            intensity,
            alpha,
          );
          ctx.fillRect(
            Math.floor(xLeft),
            Math.floor(yTop),
            Math.ceil(cellW) + 1,
            Math.ceil(cellH) + 1,
          );
        };

        if (bidI >= askI && bidI > craft.lowIntensity) {
          paint('bid', bidI, 1);
          if (askI > Math.max(0.06, craft.lowIntensity)) paint('ask', askI, 0.45);
        } else if (askI > craft.lowIntensity) {
          paint('ask', askI, 1);
          if (bidI > Math.max(0.06, craft.lowIntensity)) paint('bid', bidI, 0.45);
        }
      }
    }

    if (isSplat) ctx.restore();
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
    const ordered = [...large].sort((a, b) => a.time - b.time);

    for (const t of ordered) {
      const tSec = tradeTimeSec(t.time);
      const xBase = timeScale.timeToCoordinate(Math.floor(tSec) as Time);
      if (xBase == null || !Number.isFinite(xBase)) continue;
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


  const drawFootprintLayer = (
    ctx: CanvasRenderingContext2D,
    chart: IChartApi,
    series: ISeriesApi<'Candlestick'>,
  ) => {
    const bars = footprintRef.current;
    if (!bars.length) return;

    const timeScale = chart.timeScale();
    const byTime = new Map(bars.map((b) => [b.time, b]));
    const candles = candlesRef.current;
    if (!candles.length) return;

    let maxSide = 1;
    let maxAbsDelta = 1;
    for (const b of bars) {
      maxAbsDelta = Math.max(maxAbsDelta, Math.abs(b.delta));
      for (const l of b.levels) {
        maxSide = Math.max(maxSide, l.buyVolume, l.sellVolume);
      }
    }

    // Median bar gap → align footprint body to candle width.
    const xs: number[] = [];
    for (const c of candles) {
      const x = timeScale.timeToCoordinate(c.time as Time);
      if (x != null && Number.isFinite(x)) xs.push(x);
    }
    let barW = 14;
    if (xs.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < xs.length; i++) {
        const g = xs[i] - xs[i - 1];
        if (g > 1) gaps.push(g);
      }
      gaps.sort((a, b) => a - b);
      if (gaps.length) barW = gaps[Math.floor(gaps.length / 2)];
    }
    // Prefer chart barSpacing when available (tighter candle lock).
    const spacing = timeScale.options().barSpacing;
    if (typeof spacing === 'number' && spacing > 2) {
      barW = Math.max(barW * 0.92, spacing);
    }

    // Body slightly under full gap so adjacent columns don't collide.
    const bodyW = Math.max(6, Math.min(barW * 0.9, barW - 1.5));
    const half = bodyW / 2;
    // Delta strip on the right when there's room (MMT-style column).
    const showDeltaCol = bodyW >= 26;
    const deltaColW = showDeltaCol ? Math.max(3, Math.min(6, bodyW * 0.14)) : 0;
    const clusterW = bodyW - deltaColW;
    const showText = bodyW >= 22;
    const showCompact = bodyW >= 14 && !showText;
    const fontPx = bodyW >= 36 ? 10 : bodyW >= 28 ? 9 : 8;
    const minCellH = showText ? 7 : 2.5;

    const stepGuess = footprintStep(symbolRef.current) || (
      candles[candles.length - 1] && candles[candles.length - 1].close >= 1000
        ? 25
        : 1
    );

    // MMT-style stacked / diagonal imbalances across adjacent bars
    const intervalSec =
      candles.length >= 2
        ? Math.max(1, candles[1].time - candles[0].time)
        : 60;
    const stackChains = detectStackedImbalances(bars, {
      maxSide,
      step: stepGuess,
      minStack: FOOTPRINT_STACK_MIN,
      maxBarGapSec: intervalSec,
    });
    const stackedKeys = new Set<string>();
    for (const chain of stackChains) {
      for (const cell of chain.cells) {
        stackedKeys.add(stackedImbalanceKey(cell.time, cell.price));
      }
    }
    const cellGeo = new Map<
      string,
      { cx: number; cy: number; x0: number; yTop: number; w: number; h: number }
    >();

    for (const c of candles) {
      const bar = byTime.get(c.time);
      if (!bar || !bar.levels.length) continue;
      const xMid = timeScale.timeToCoordinate(c.time as Time);
      if (xMid == null || !Number.isFinite(xMid)) continue;

      const x0 = (xMid as number) - half;
      const levels = [...bar.levels].sort((a, b) => b.price - a.price);

      // Soft delta-tinted body behind cells
      const yHi = series.priceToCoordinate(c.high);
      const yLo = series.priceToCoordinate(c.low);
      if (yHi != null && yLo != null) {
        const top = Math.min(yHi, yLo);
        const bot = Math.max(yHi, yLo);
        const deltaPos = bar.delta >= 0;
        ctx.fillStyle = deltaPos
          ? 'rgba(14, 203, 129, 0.07)'
          : 'rgba(246, 70, 93, 0.07)';
        ctx.fillRect(x0, top, bodyW, Math.max(1, bot - top));
      }

      for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        const y = series.priceToCoordinate(lvl.price);
        if (y == null || !Number.isFinite(y)) continue;

        let h: number;
        if (i + 1 < levels.length) {
          const yNext = series.priceToCoordinate(levels[i + 1].price);
          h =
            yNext != null && Number.isFinite(yNext)
              ? Math.abs(yNext - y)
              : stepGuess;
        } else if (i > 0) {
          const yPrev = series.priceToCoordinate(levels[i - 1].price);
          h =
            yPrev != null && Number.isFinite(yPrev)
              ? Math.abs(y - yPrev)
              : stepGuess;
        } else {
          const yStep = series.priceToCoordinate(lvl.price - stepGuess);
          h =
            yStep != null && Number.isFinite(yStep)
              ? Math.abs(y - yStep)
              : 6;
        }
        // Cap less aggressively when zoomed so 1m cells stay readable.
        const maxH = showText ? 34 : 22;
        h = Math.max(minCellH, Math.min(h, maxH));
        const yTop = y - h / 2;

        const buyA =
          maxSide > 0 ? 0.14 + (lvl.buyVolume / maxSide) * 0.62 : 0.1;
        const sellA =
          maxSide > 0 ? 0.14 + (lvl.sellVolume / maxSide) * 0.62 : 0.1;
        const midX = x0 + clusterW / 2;
        const halfCluster = clusterW / 2;

        ctx.fillStyle = `rgba(246, 70, 93, ${sellA})`;
        ctx.fillRect(x0, yTop, halfCluster - 0.4, h);
        ctx.fillStyle = `rgba(14, 203, 129, ${buyA})`;
        ctx.fillRect(midX + 0.4, yTop, halfCluster - 0.4, h);

        // Hairline split between sell | buy
        ctx.fillStyle = 'rgba(10, 12, 16, 0.55)';
        ctx.fillRect(midX - 0.5, yTop, 1, h);

        const imb = footprintCellImbalance(
          lvl.buyVolume,
          lvl.sellVolume,
          maxSide,
        );
        const stackKey = stackedImbalanceKey(bar.time, lvl.price);
        cellGeo.set(stackKey, {
          cx: x0 + clusterW / 2,
          cy: y,
          x0,
          yTop,
          w: clusterW,
          h,
        });
        const inStack = stackedKeys.has(stackKey);
        if (imb) {
          const imbColor =
            imb === 'buy'
              ? 'rgba(14, 203, 129, 0.95)'
              : 'rgba(246, 70, 93, 0.95)';
          // Soft wash for stacked diagonal members
          if (inStack) {
            ctx.fillStyle =
              imb === 'buy'
                ? 'rgba(14, 203, 129, 0.16)'
                : 'rgba(246, 70, 93, 0.16)';
            ctx.fillRect(x0 - 1, yTop - 0.5, clusterW + 2, Math.max(1, h + 1));
          }
          // Stronger imbalance: outer stroke + side accent bar
          ctx.strokeStyle = imbColor;
          ctx.lineWidth = inStack ? (h >= 10 ? 2.25 : 1.75) : h >= 10 ? 1.5 : 1;
          ctx.strokeRect(x0 + 0.5, yTop + 0.5, clusterW - 1, Math.max(1, h - 1));
          if (inStack) {
            // Brighter outer edge for chain members
            ctx.strokeStyle =
              imb === 'buy'
                ? 'rgba(167, 243, 208, 0.85)'
                : 'rgba(252, 165, 165, 0.85)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x0 - 0.5, yTop - 0.5, clusterW + 1, Math.max(1, h + 1));
          }
          ctx.fillStyle = imbColor;
          if (imb === 'buy') {
            ctx.fillRect(x0 + clusterW - 2.5, yTop + 1, 2, Math.max(1, h - 2));
          } else {
            ctx.fillRect(x0 + 0.5, yTop + 1, 2, Math.max(1, h - 2));
          }
        }

        // Optional per-level delta column (right of cluster)
        if (showDeltaCol && deltaColW > 0) {
          const dNorm = Math.min(1, Math.abs(lvl.delta) / (maxSide * 0.85 || 1));
          const dA = 0.12 + dNorm * 0.7;
          ctx.fillStyle =
            lvl.delta >= 0
              ? `rgba(14, 203, 129, ${dA})`
              : `rgba(246, 70, 93, ${dA})`;
          ctx.fillRect(x0 + clusterW + 0.5, yTop, deltaColW - 0.5, h);
        }

        if (showText && h >= 8) {
          const useFont = h >= 12 ? fontPx : Math.max(7, fontPx - 1);
          ctx.font = `600 ${useFont}px IBM Plex Mono, JetBrains Mono, monospace`;
          ctx.textBaseline = 'middle';
          const sellLabel = formatFootprintVol(lvl.sellVolume);
          const buyLabel = formatFootprintVol(lvl.buyVolume);
          // Clip labels into half-cells for zoom fidelity
          if (sellLabel) {
            ctx.fillStyle = imb === 'sell' ? 'rgba(254, 202, 202, 1)' : 'rgba(252, 165, 165, 0.95)';
            ctx.textAlign = 'right';
            const tw = ctx.measureText(sellLabel).width;
            if (tw <= halfCluster - 3) {
              ctx.fillText(sellLabel, midX - 2, y + 0.5);
            } else if (halfCluster >= 10) {
              ctx.font = `600 ${Math.max(7, useFont - 1)}px IBM Plex Mono, JetBrains Mono, monospace`;
              ctx.fillText(sellLabel, midX - 2, y + 0.5);
            }
          }
          if (buyLabel) {
            ctx.font = `600 ${useFont}px IBM Plex Mono, JetBrains Mono, monospace`;
            ctx.fillStyle = imb === 'buy' ? 'rgba(167, 243, 208, 1)' : 'rgba(167, 243, 208, 0.95)';
            ctx.textAlign = 'left';
            const tw = ctx.measureText(buyLabel).width;
            if (tw <= halfCluster - 3) {
              ctx.fillText(buyLabel, midX + 2, y + 0.5);
            } else if (halfCluster >= 10) {
              ctx.font = `600 ${Math.max(7, useFont - 1)}px IBM Plex Mono, JetBrains Mono, monospace`;
              ctx.fillText(buyLabel, midX + 2, y + 0.5);
            }
          }
        } else if (showCompact && h >= 4) {
          const d = lvl.delta;
          if (Math.abs(d) > maxSide * 0.06) {
            ctx.fillStyle =
              d >= 0 ? 'rgba(14,203,129,0.9)' : 'rgba(246,70,93,0.9)';
            ctx.fillRect(midX - 1, yTop + 0.5, 2, Math.max(1, h - 1));
          }
        }
      }

      // Per-bar delta caption under the low — stronger chip when zoomed
      if (showText || showCompact) {
        const yLo2 = series.priceToCoordinate(c.low);
        if (yLo2 != null && Number.isFinite(yLo2)) {
          const label = `${bar.delta >= 0 ? '+' : ''}${formatFootprintVol(Math.abs(bar.delta)) || '0'}`;
          ctx.font = `700 ${showText ? fontPx : 8}px IBM Plex Mono, JetBrains Mono, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const tw = ctx.measureText(label).width;
          const chipW = tw + 5;
          const chipH = showText ? 11 : 9;
          const chipX = (xMid as number) - chipW / 2;
          const chipY = (yLo2 as number) + 2;
          const dStrength = Math.min(1, Math.abs(bar.delta) / maxAbsDelta);
          ctx.fillStyle =
            bar.delta >= 0
              ? `rgba(14, 203, 129, ${0.12 + dStrength * 0.22})`
              : `rgba(246, 70, 93, ${0.12 + dStrength * 0.22})`;
          ctx.fillRect(chipX, chipY, chipW, chipH);
          ctx.fillStyle =
            bar.delta >= 0
              ? 'rgba(167, 243, 208, 0.95)'
              : 'rgba(252, 165, 165, 0.95)';
          ctx.fillText(label, xMid as number, chipY + 1);
        }
      }
    }

    // Diagonal stack connectors (cell wash/edge already drawn above)
    for (const chain of stackChains) {
      if (chain.cells.length < FOOTPRINT_STACK_MIN) continue;
      const pts: { cx: number; cy: number }[] = [];
      for (const cell of chain.cells) {
        const g = cellGeo.get(stackedImbalanceKey(cell.time, cell.price));
        if (g) pts.push(g);
      }
      if (pts.length < 2) continue;
      const stroke =
        chain.side === 'buy'
          ? 'rgba(14, 203, 129, 0.85)'
          : 'rgba(246, 70, 93, 0.85)';
      const glow =
        chain.side === 'buy'
          ? 'rgba(14, 203, 129, 0.2)'
          : 'rgba(246, 70, 93, 0.2)';
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].cx, pts[0].cy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].cx, pts[i].cy);
      ctx.strokeStyle = glow;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pts[0].cx, pts[0].cy);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].cx, pts[i].cy);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.75;
      ctx.stroke();
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
      }
      ctx.restore();
    }

    // Naked (unfinished auction) POCs — diamond ticks until traded through
    const naked = detectNakedPocs(bars, candles, { step: stepGuess });
    for (const mark of naked) {
      const xMid = timeScale.timeToCoordinate(mark.time as Time);
      const y = series.priceToCoordinate(mark.price);
      if (xMid == null || y == null || !Number.isFinite(xMid) || !Number.isFinite(y)) {
        continue;
      }
      // Place diamond on the right edge of the footprint body
      const cx = (xMid as number) + half + 3.5;
      const cy = y as number;
      const s = bodyW >= 22 ? 4.2 : bodyW >= 12 ? 3.4 : 2.8;
      ctx.save();
      // Soft glow
      ctx.beginPath();
      ctx.moveTo(cx, cy - s - 1);
      ctx.lineTo(cx + s + 1, cy);
      ctx.lineTo(cx, cy + s + 1);
      ctx.lineTo(cx - s - 1, cy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
      ctx.fill();
      // Diamond
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(250, 204, 21, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.95)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Tiny tick toward the cluster
      ctx.beginPath();
      ctx.moveTo(cx - s - 1, cy);
      ctx.lineTo((xMid as number) + half - 0.5, cy);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
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
    const fpMode = chartModeRef.current === 'footprint';
    if (flags.heatmap && !fpMode) drawHeatmapLayer(ctx, chart, series, w);
    else if (flags.heatmap && fpMode) {
      // Dimmer heatmap under footprint clusters
      ctx.save();
      ctx.globalAlpha = 0.45;
      drawHeatmapLayer(ctx, chart, series, w);
      ctx.restore();
    }
    if (fpMode) drawFootprintLayer(ctx, chart, series);
    if (flags.bubbles && !fpMode) drawBubblesLayer(ctx, chart, series);
    if (flags.profile) drawProfileLayer(ctx, chart, series, h);

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
    const mag = magnetPreviewRef.current;
    if (mag && magnetRef.current) {
      drawMagnetPreview(ctx, mag.x, mag.y, mag.snapped, MAGNET_PX);
    }
    updateDeletePos();
  };

  const scheduleOverlays = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawOverlays();
    });
  };

  useEffect(() => {
    const next = getSymbolDrawings(loadDrawings(), symbol);
    drawingsRef.current = next;
    setDrawings(next);
    setSelectedId(null);
    selectedIdRef.current = null;
    draftRef.current = null;
    dragRef.current = null;
    setDeletePos(null);
    setPriceEdit(null);
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
    const buyCount = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    const sellCount = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      borderVisible: false,
    });

    const vwapLineStyle: Record<VwapAnchor, LineStyle> = {
      session: LineStyle.Solid,
      week: LineStyle.Dashed,
      rolling24h: LineStyle.Dotted,
    };
    const vwapMap: Partial<Record<VwapAnchor, ISeriesApi<'Line'>>> = {};
    for (const anchor of VWAP_ANCHORS) {
      vwapMap[anchor] = chart.addSeries(LineSeries, {
        color: VWAP_ANCHOR_COLOR[anchor],
        lineWidth: 1,
        lineStyle: vwapLineStyle[anchor],
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }
    vwapRefs.current = vwapMap;

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
    buyCountRef.current = buyCount;
    sellCountRef.current = sellCount;
    cvdRef.current = cvd;

    const onRange = () => scheduleOverlays();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);

    const placeOrSelect = (param: MouseEventParams<Time>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (dragRef.current) return;
      const series = candleRef.current;
      if (!series || !param.point) return;

      const { x, y } = param.point;
      const price = series.coordinateToPrice(y);
      if (price == null || !Number.isFinite(Number(price))) return;
      let priceN = Number(price);
      let tHint: number | null = null;
      const tv0 = chart.timeScale().coordinateToTime(x);
      if (typeof tv0 === 'number') tHint = tv0;
      else if (typeof param.time === 'number') tHint = param.time;
      if (tHint != null) {
        const snapped = snapPoint(x, y, priceN, tHint);
        priceN = snapped.price;
        tHint = snapped.time;
      }
      const active = toolRef.current;

      if (active === 'eraser') {
        const hit = hitTestDrawingDetailed(
          drawingsRef.current,
          chart,
          series,
          x,
          y,
          selectedIdRef.current,
        );
        if (hit) {
          const next = drawingsRef.current.filter((d) => d.id !== hit.drawing.id);
          selectedIdRef.current = null;
          setSelectedId(null);
          persistDrawings(next);
        }
        return;
      }

      if (active === 'hline') {
        const next: ChartDrawing[] = [
          ...drawingsRef.current,
          withDrawingDefaults({
            id: newDrawingId(),
            type: 'hline',
            price: priceN,
            ...defaultDrawingStyle(),
            extendLeft: true,
            extendRight: true,
          }),
        ];
        setSelectedId(null);
        selectedIdRef.current = null;
        persistDrawings(next);
        return;
      }

      if (active === 'hray') {
        let tSec: number | null = tHint;
        if (tSec == null || !Number.isFinite(tSec)) {
          const timeVal = chart.timeScale().coordinateToTime(x);
          if (typeof timeVal === 'number') tSec = timeVal;
          else if (typeof param.time === 'number') tSec = param.time;
        }
        if (tSec == null || !Number.isFinite(tSec)) return;
        const next: ChartDrawing[] = [
          ...drawingsRef.current,
          withDrawingDefaults({
            id: newDrawingId(),
            type: 'hray',
            price: priceN,
            t1: tSec,
            ...defaultDrawingStyle(),
          }),
        ];
        setSelectedId(null);
        selectedIdRef.current = null;
        persistDrawings(next);
        return;
      }

      if (active === 'trend' || active === 'rect' || active === 'fib') {
        let tSec: number | null = tHint;
        if (tSec == null || !Number.isFinite(tSec)) {
          const timeVal = chart.timeScale().coordinateToTime(x);
          if (typeof timeVal === 'number') tSec = timeVal;
          else if (typeof param.time === 'number') tSec = param.time;
        }
        if (tSec == null || !Number.isFinite(tSec)) return;

        const draft = draftRef.current;
        if (!draft || draft.type !== active) {
          draftRef.current = { type: active, t1: tSec, p1: priceN };
          setSelectedId(null);
          selectedIdRef.current = null;
          scheduleOverlays();
          return;
        }

        const style = defaultDrawingStyle();
        const id = newDrawingId();
        let created: ChartDrawing;
        if (active === 'trend') {
          created = withDrawingDefaults({
            id,
            type: 'trend',
            t1: draft.t1,
            p1: draft.p1,
            t2: tSec,
            p2: priceN,
            ...style,
            extendLeft: false,
            extendRight: false,
          });
        } else if (active === 'rect') {
          created = withDrawingDefaults({
            id,
            type: 'rect',
            t1: draft.t1,
            p1: draft.p1,
            t2: tSec,
            p2: priceN,
            ...style,
          });
        } else {
          created = withDrawingDefaults({
            id,
            type: 'fib',
            t1: draft.t1,
            p1: draft.p1,
            t2: tSec,
            p2: priceN,
            ...style,
          });
        }

        const next: ChartDrawing[] = [
          ...drawingsRef.current,
          created,
        ];
        draftRef.current = null;
        setSelectedId(null);
        selectedIdRef.current = null;
        persistDrawings(next);
        return;
      }

      // Select mode
      const hit = hitTestDrawingDetailed(
        drawingsRef.current,
        chart,
        series,
        x,
        y,
        selectedIdRef.current,
      );
      const id = hit?.drawing.id ?? null;
      selectedIdRef.current = id;
      setSelectedId(id);
      scheduleOverlays();
    };

    const onCrosshair = (param: MouseEventParams<Time>) => {
      const draft = draftRef.current;
      if (draft && param.point) {
        const series = candleRef.current;
        if (series) {
          const price = series.coordinateToPrice(param.point.y);
          if (price != null && Number.isFinite(Number(price))) {
            let tSec: number | null = null;
            const timeVal = chart.timeScale().coordinateToTime(param.point.x);
            if (typeof timeVal === 'number') tSec = timeVal;
            else if (typeof param.time === 'number') tSec = param.time;
            if (tSec != null) {
              const snapped = snapPoint(
                param.point.x,
                param.point.y,
                Number(price),
                tSec,
              );
              draftRef.current = { ...draft, t2: snapped.time, p2: snapped.price };
              updateMagnetPreview(
                param.point.x,
                param.point.y,
                Number(price),
                tSec,
              );
              scheduleOverlays();
            }
          }
        }
      } else if (
        param.point &&
        magnetRef.current &&
        (isPlaceTool(toolRef.current) || dragRef.current)
      ) {
        const seriesMag = candleRef.current;
        if (seriesMag) {
          const raw = seriesMag.coordinateToPrice(param.point.y);
          if (raw != null && Number.isFinite(Number(raw))) {
            let tSec: number | null = null;
            const timeVal = chart.timeScale().coordinateToTime(param.point.x);
            if (typeof timeVal === 'number') tSec = timeVal;
            else if (typeof param.time === 'number') tSec = param.time;
            if (tSec != null) {
              updateMagnetPreview(
                param.point.x,
                param.point.y,
                Number(raw),
                tSec,
              );
            }
          }
        }
      } else if (!param.point || !magnetRef.current) {
        if (magnetPreviewRef.current) {
          magnetPreviewRef.current = null;
          scheduleOverlays();
        }
      }

      // Chart ↔ DOM cohesion: publish hover price / clear on leave
      if (!param.point) {
        if (lastChartHoverRef.current != null) {
          lastChartHoverRef.current = null;
          const st = useTerminalStore.getState();
          if (st.hoverSource === 'chart') st.setHoverPrice(null, null);
        }
      } else if (!dragRef.current) {
        const seriesForHover = candleRef.current;
        if (seriesForHover) {
          const raw = seriesForHover.coordinateToPrice(param.point.y);
          const p = raw == null ? null : Number(raw);
          if (p != null && Number.isFinite(p)) {
            const prev = lastChartHoverRef.current;
            // Throttle store writes to ~0.01 price units to keep DOM row stable
            if (prev == null || Math.abs(prev - p) >= 0.01) {
              lastChartHoverRef.current = p;
              useTerminalStore.getState().setHoverPrice(p, 'chart');
            }
          }
        }
      }

      // Hover cursor in select mode
      if (!param.point || dragRef.current) return;
      const series = candleRef.current;
      if (!series) return;
      const active = toolRef.current;
      if (isPlaceTool(active) || active === 'eraser') {
        setHoverCursor(active === 'eraser' ? 'pointer' : 'crosshair');
        return;
      }
      const hit = hitTestDrawingDetailed(
        drawingsRef.current,
        chart,
        series,
        param.point.x,
        param.point.y,
        selectedIdRef.current,
      );
      if (!hit) {
        setHoverCursor('default');
        return;
      }
      if (hit.handle === 'p1' || hit.handle === 'p2') setHoverCursor('pointer');
      else setHoverCursor('grab');
    };

    chart.subscribeClick(placeOrSelect);
    chart.subscribeCrosshairMove(onCrosshair);

    const parent = containerRef.current;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!isSelectTool(toolRef.current)) return;
      const series = candleRef.current;
      if (!series || !chartRef.current) return;
      const pt = pointFromEvent(e.clientX, e.clientY);
      if (!pt) return;
      const hit: DrawingHit | null = hitTestDrawingDetailed(
        drawingsRef.current,
        chartRef.current,
        series,
        pt.x,
        pt.y,
        selectedIdRef.current,
      );
      if (!hit) return;

      // Start drag — disable chart pan/zoom
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        id: hit.drawing.id,
        handle: hit.handle,
        lastPrice: pt.price,
        lastTime: pt.time,
      };
      selectedIdRef.current = hit.drawing.id;
      setSelectedId(hit.drawing.id);
      setChartInteraction(false);
      setHoverCursor('grabbing');
      scheduleOverlays();
      try {
        parent.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pt = pointFromEvent(e.clientX, e.clientY);
      if (!pt) return;
      const snapped = snapPoint(pt.x, pt.y, pt.price, pt.time);
      const priceDelta = snapped.price - drag.lastPrice;
      const timeDelta = snapped.time - drag.lastTime;
      if (priceDelta === 0 && timeDelta === 0) return;

      const next = drawingsRef.current.map((d) => {
        if (d.id !== drag.id) return d;
        // Full horizontals only move in price; rays can slide anchor in time on p1
        if (d.type === 'hline') {
          return applyDrawingDrag(d, 'body', priceDelta, 0);
        }
        if (d.type === 'hray' && drag.handle === 'body') {
          return applyDrawingDrag(d, 'body', priceDelta, 0);
        }
        return applyDrawingDrag(d, drag.handle, priceDelta, timeDelta);
      });
      drawingsRef.current = next;
      setDrawings(next);
      dragRef.current = {
        ...drag,
        lastPrice: snapped.price,
        lastTime: snapped.time,
      };
      updateMagnetPreview(pt.x, pt.y, pt.price, pt.time);
      scheduleOverlays();
    };

    const endDrag = (e: PointerEvent) => {
      if (!dragRef.current) return;
      suppressClickRef.current = true;
      const all = loadDrawings();
      saveDrawings(setSymbolDrawings(all, symbolRef.current, drawingsRef.current));
      dragRef.current = null;
      setChartInteraction(true);
      setHoverCursor('grab');
      try {
        parent.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      scheduleOverlays();
    };

    const onDblClick = (e: MouseEvent) => {
      if (!isSelectTool(toolRef.current)) return;
      const series = candleRef.current;
      const chartApi = chartRef.current;
      if (!series || !chartApi) return;
      const pt = pointFromEvent(e.clientX, e.clientY);
      if (!pt) return;
      const hit = hitTestDrawingDetailed(
        drawingsRef.current,
        chartApi,
        series,
        pt.x,
        pt.y,
        selectedIdRef.current,
      );
      if (
        !hit ||
        (hit.drawing.type !== 'hline' && hit.drawing.type !== 'hray')
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      selectedIdRef.current = hit.drawing.id;
      setSelectedId(hit.drawing.id);
      setPriceEdit({
        id: hit.drawing.id,
        value: formatDrawingPrice(hit.drawing.price).replace(/,/g, ''),
      });
    };

    parent.addEventListener('pointerdown', onPointerDown, true);
    parent.addEventListener('pointermove', onPointerMove);
    parent.addEventListener('pointerup', endDrag);
    parent.addEventListener('pointercancel', endDrag);
    parent.addEventListener('dblclick', onDblClick);

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
      parent.removeEventListener('pointerdown', onPointerDown, true);
      parent.removeEventListener('pointermove', onPointerMove);
      parent.removeEventListener('pointerup', endDrag);
      parent.removeEventListener('pointercancel', endDrag);
      parent.removeEventListener('dblclick', onDblClick);
      chart.unsubscribeClick(placeOrSelect);
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      hoverPriceLineRef.current = null;
      focusPriceLineRef.current = null;
      lastChartHoverRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DOM/tape → chart: subtle sync price line when hovering a book or tape row
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;

    const external =
      (hoverSource === 'dom' || hoverSource === 'tape') &&
      hoverPrice != null &&
      Number.isFinite(hoverPrice);

    if (external) {
      if (hoverPriceLineRef.current) {
        hoverPriceLineRef.current.applyOptions({ price: hoverPrice });
      } else {
        hoverPriceLineRef.current = series.createPriceLine({
          price: hoverPrice,
          color: 'rgba(212, 212, 216, 0.42)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          axisLabelColor: '#1a2030',
          axisLabelTextColor: '#d4d4d8',
          title: '',
        });
      }
      return;
    }

    if (hoverPriceLineRef.current) {
      series.removePriceLine(hoverPriceLineRef.current);
      hoverPriceLineRef.current = null;
    }
  }, [hoverPrice, hoverSource]);

  // Tape click (or other pulse) → brief solid emphasis line on chart
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;

    if (focusPrice != null && Number.isFinite(focusPrice)) {
      if (focusPriceLineRef.current) {
        focusPriceLineRef.current.applyOptions({ price: focusPrice });
      } else {
        focusPriceLineRef.current = series.createPriceLine({
          price: focusPrice,
          color: 'rgba(240, 185, 11, 0.9)',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          axisLabelColor: '#f0b90b',
          axisLabelTextColor: '#0b0e11',
          title: '',
        });
      }
      return;
    }

    if (focusPriceLineRef.current) {
      series.removePriceLine(focusPriceLineRef.current);
      focusPriceLineRef.current = null;
    }
  }, [focusPrice]);

  useEffect(() => {
    if (!feed || !candleRef.current || !volumeRef.current) return;

    const fpMode = chartMode === 'footprint';
    const useBarStats = showBarStats && !fpMode;
    const barColors = useBarStats
      ? computeBarStatColors(feed.candles, feed.cvd ?? [], barStatsMetric)
      : null;

    candleRef.current.setData(
      feed.candles.map((c, i) => {
        const base = {
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        };
        if (!barColors) return base;
        const col = barColors[i];
        return {
          ...base,
          color: col.color,
          borderColor: col.borderColor,
          wickColor: col.wickColor,
        };
      }),
    );

    const countMode = volumePaneMode === 'count';
    const counts =
      feed.tradeCounts && feed.tradeCounts.length
        ? feed.tradeCounts
        : tradeCountsFromTrades(
            feed.trades ?? [],
            feed.candles ?? [],
            intervalSecRef.current,
          );
    const countByTime = new Map(counts.map((p) => [p.time, p]));

    if (countMode) {
      volumeRef.current.setData([]);
      if (buyCountRef.current) {
        buyCountRef.current.setData(
          feed.candles.map((c) => {
            const row = countByTime.get(c.time);
            return {
              time: c.time as Time,
              value: row?.buyCount ?? 0,
              color: 'rgba(14,203,129,0.55)',
            };
          }),
        );
      }
      if (sellCountRef.current) {
        sellCountRef.current.setData(
          feed.candles.map((c) => {
            const row = countByTime.get(c.time);
            return {
              time: c.time as Time,
              value: -(row?.sellCount ?? 0),
              color: 'rgba(246,70,93,0.55)',
            };
          }),
        );
      }
    } else {
      if (buyCountRef.current) buyCountRef.current.setData([]);
      if (sellCountRef.current) sellCountRef.current.setData([]);
      volumeRef.current.setData(
        feed.candles.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(14,203,129,0.45)' : 'rgba(246,70,93,0.45)',
        })),
      );
    }

    for (const anchor of VWAP_ANCHORS) {
      const seriesApi = vwapRefs.current[anchor];
      if (!seriesApi) continue;
      if (showVwap && vwapAnchors.includes(anchor)) {
        const series = computeVwapSeriesForAnchor(feed.candles, anchor);
        seriesApi.setData(
          series.map((p) => ({ time: p.time as Time, value: p.value })),
        );
      } else {
        seriesApi.setData([]);
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
    candlesRef.current = feed.candles ?? [];
    profileRef.current =
      feed.volumeProfile?.length > 0
        ? feed.volumeProfile
        : buildFallbackProfile(feed.trades ?? [], feed.candles ?? []);
    footprintRef.current = footprintBarsForChart(
      feed.candles ?? [],
      feed.footprint ?? [],
      feed.trades ?? [],
      intervalSecRef.current,
      footprintStep(symbolRef.current),
    );
    scheduleOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    feed,
    showVwap,
    vwapAnchors,
    showBarStats,
    barStatsMetric,
    volumePaneMode,
    showCvdOverlay,
    showLiqMarkers,
    chartInterval,
    chartMode,
  ]);

  useEffect(() => {
    if (
      !vwapMenuOpen &&
      !barStatsMenuOpen &&
      !layersMenuOpen &&
      !heatmapMenuOpen &&
      !objectTreeOpen
    ) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-layer-menus]')) return;
      if (t?.closest('[data-object-tree]')) return;
      if (t?.closest('.chart-draw-rail')) return;
      setVwapMenuOpen(false);
      setBarStatsMenuOpen(false);
      setLayersMenuOpen(false);
      setHeatmapMenuOpen(false);
      setObjectTreeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setVwapMenuOpen(false);
        setBarStatsMenuOpen(false);
        setLayersMenuOpen(false);
        setHeatmapMenuOpen(false);
        setObjectTreeOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [vwapMenuOpen, barStatsMenuOpen, layersMenuOpen, heatmapMenuOpen, objectTreeOpen]);

  useEffect(() => {
    scheduleOverlays();
    // Disable pan while placing tools so clicks don't scrub the chart
    const placing = isPlaceTool(tool) || tool === 'eraser';
    if (!dragRef.current) setChartInteraction(!placing);
    if (isPlaceTool(tool)) setHoverCursor('crosshair');
    else if (tool === 'eraser') setHoverCursor('pointer');
    else if (!dragRef.current) setHoverCursor('default');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHeatmap, showProfile, showBubbles, selectedId, drawings, tool, chartMode, heatmapCraft]);

  useEffect(() => {
    const candles = candleRef.current;
    const chart = chartRef.current;
    if (!candles || !chart) return;
    const fp = chartMode === 'footprint';
    candles.applyOptions({
      upColor: fp ? 'rgba(14, 203, 129, 0.08)' : UP,
      downColor: fp ? 'rgba(246, 70, 93, 0.08)' : DOWN,
      borderUpColor: fp ? 'rgba(14, 203, 129, 0.35)' : UP,
      borderDownColor: fp ? 'rgba(246, 70, 93, 0.35)' : DOWN,
      wickUpColor: fp ? 'rgba(14, 203, 129, 0.55)' : UP,
      wickDownColor: fp ? 'rgba(246, 70, 93, 0.55)' : DOWN,
    });
    chart.timeScale().applyOptions({
      barSpacing: fp ? 30 : 8,
      minBarSpacing: fp ? 12 : 0.5,
    });
    scheduleOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartMode]);

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
        if (
          toolRef.current !== 'select' ||
          draftRef.current ||
          selectedIdRef.current ||
          priceEdit
        ) {
          // Capture + stopImmediate so App unmaximize / drawer Esc wait their turn.
          e.preventDefault();
          e.stopImmediatePropagation();
          setTool('select');
          toolRef.current = 'select';
          draftRef.current = null;
          selectedIdRef.current = null;
          setSelectedId(null);
          setPriceEdit(null);
          dragRef.current = null;
          setChartInteraction(true);
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
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceEdit]);

  const selectTool = (next: DrawingTool) => {
    draftRef.current = null;
    const resolved = next ?? 'select';
    if (tool === resolved || (isSelectTool(tool) && isSelectTool(resolved))) {
      setTool('select');
      toolRef.current = 'select';
    } else {
      setTool(resolved);
      toolRef.current = resolved;
      if (!isSelectTool(resolved)) {
        selectedIdRef.current = null;
        setSelectedId(null);
      }
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

  const patchSelected = (patch: Partial<ChartDrawing>) => {
    const id = selectedIdRef.current;
    if (!id) return;
    const next = drawingsRef.current.map((d) => {
      if (d.id !== id) return d;
      return withDrawingDefaults({ ...d, ...patch } as ChartDrawing);
    });
    persistDrawings(next);
  };

  const commitPriceEdit = () => {
    if (!priceEdit) return;
    const parsed = Number(priceEdit.value.replace(/,/g, ''));
    if (!Number.isFinite(parsed)) {
      setPriceEdit(null);
      return;
    }
    const next = drawingsRef.current.map((d) =>
      d.id === priceEdit.id && (d.type === 'hline' || d.type === 'hray')
        ? { ...d, price: parsed }
        : d,
    );
    setPriceEdit(null);
    persistDrawings(next);
  };

  const cursorClass =
    hoverCursor === 'crosshair'
      ? 'cursor-crosshair'
      : hoverCursor === 'grab'
        ? 'cursor-grab'
        : hoverCursor === 'grabbing'
          ? 'cursor-grabbing'
          : hoverCursor === 'pointer'
            ? 'cursor-pointer'
            : '';

  const toolHint =
    tool === 'hline'
      ? 'Click to place horizontal'
      : tool === 'hray'
        ? 'Click to place horizontal ray →'
        : tool === 'trend'
          ? 'Trend — click start, then end · Esc select'
          : tool === 'rect'
            ? 'Rect — click opposite corners · Esc select'
            : tool === 'fib'
              ? 'Fib — click 0, then 1 · Esc select'
              : tool === 'eraser'
                ? 'Click a drawing to erase · Esc select'
                : null;

  const selectedDrawing = selectedId
    ? drawings.find((d) => d.id === selectedId) ?? null
    : null;
  const showExtend =
    selectedDrawing?.type === 'hline' || selectedDrawing?.type === 'trend';
  const showFibProps = selectedDrawing?.type === 'fib';
  const selectedVisible = selectedDrawing
    ? isDrawingVisible(selectedDrawing)
    : true;

  const layersExtraCount =
    (showProfile ? 1 : 0) +
    (showBubbles ? 1 : 0) +
    (showBarStats ? 1 : 0) +
    (volumePaneMode === 'count' ? 1 : 0) +
    (showLiqMarkers ? 1 : 0);

  return (
    <div className={`chart-workspace relative flex h-full min-h-0 ${cursorClass}`}>
      {/* Vertical drawing toolbar — MMT/TV style */}
      <aside className="chart-draw-rail z-[4] flex w-8 shrink-0 flex-col items-center gap-0.5 border-r border-terminal-border bg-terminal-header py-1">
        <ToolIcon
          title="Select / move (Esc)"
          active={isSelectTool(tool)}
          onClick={() => selectTool('select')}
        >
          <IconCursor />
        </ToolIcon>
        <ToolIcon
          title="Horizontal line"
          active={tool === 'hline'}
          onClick={() => selectTool('hline')}
        >
          <IconHLine />
        </ToolIcon>
        <ToolIcon
          title="Horizontal ray — extends right"
          active={tool === 'hray'}
          onClick={() => selectTool('hray')}
        >
          <IconHRay />
        </ToolIcon>
        <ToolIcon
          title="Trend line — two clicks"
          active={tool === 'trend'}
          onClick={() => selectTool('trend')}
        >
          <IconTrend />
        </ToolIcon>
        <ToolIcon
          title="Rectangle — two clicks"
          active={tool === 'rect'}
          onClick={() => selectTool('rect')}
        >
          <IconRect />
        </ToolIcon>
        <ToolIcon
          title="Fib retracement — two clicks"
          active={tool === 'fib'}
          onClick={() => selectTool('fib')}
        >
          <IconFib />
        </ToolIcon>
        <div className="my-0.5 h-px w-5 bg-terminal-border" />
        <ToolIcon
          title={magnetOn ? 'Magnet snap on' : 'Magnet snap off'}
          active={magnetOn}
          onClick={() => {
            setMagnetOn((v) => {
              const next = !v;
              magnetRef.current = next;
              if (!next) magnetPreviewRef.current = null;
              return next;
            });
            scheduleOverlays();
          }}
        >
          <IconMagnet />
        </ToolIcon>
        <div className="my-0.5 h-px w-5 bg-terminal-border" />
        <ToolIcon
          title="Eraser — click a drawing"
          active={tool === 'eraser'}
          onClick={() => selectTool('eraser')}
        >
          <IconEraser />
        </ToolIcon>
        <ToolIcon title="Clear all drawings" active={false} danger onClick={clearAllDrawings}>
          <IconClear />
        </ToolIcon>
        <div className="my-0.5 h-px w-5 bg-terminal-border" />
        <ToolIcon
          title="Object tree — drawings"
          active={objectTreeOpen}
          onClick={() => {
            setObjectTreeOpen((v) => !v);
            setVwapMenuOpen(false);
            setBarStatsMenuOpen(false);
            setLayersMenuOpen(false);
            setHeatmapMenuOpen(false);
          }}
        >
          <IconObjectTree />
        </ToolIcon>
      </aside>

      <div className="relative min-h-0 min-w-0 flex-1">
        {objectTreeOpen && (
          <div
            data-object-tree
            className="pointer-events-auto absolute left-1.5 top-9 z-[8] w-[200px] rounded-[2px] border border-terminal-border bg-black/92 p-1 shadow-panel backdrop-blur-[2px]"
          >
            <div className="flex items-center gap-1.5 px-1.5 pb-1 pt-0.5">
              <IconObjectTree />
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                Objects
              </span>
              <span className="ml-auto font-mono text-[9px] text-zinc-600">
                {drawings.length}
              </span>
            </div>
            {drawings.length === 0 ? (
              <div className="px-1.5 py-2 font-mono text-[10px] text-zinc-600">
                No drawings
              </div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto">
                {[...drawings].reverse().map((d) => {
                  const on = d.id === selectedId;
                  const vis = isDrawingVisible(d);
                  const summary =
                    d.type === 'hline' || d.type === 'hray'
                      ? formatDrawingPrice(d.price)
                      : d.type === 'fib'
                        ? `${activeFibLevels(d).length} lvl`
                        : drawingTypeLabel(d);
                  return (
                    <div
                      key={d.id}
                      className={`mb-0.5 flex items-center gap-0.5 rounded-[2px] ${
                        on ? 'bg-accent/15 ring-1 ring-inset ring-accent/35' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <button
                        type="button"
                        title={`Select ${drawingTypeLabel(d)}`}
                        onClick={() => {
                          selectedIdRef.current = d.id;
                          setSelectedId(d.id);
                          setTool('select');
                          toolRef.current = 'select';
                          scheduleOverlays();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: d.color, opacity: vis ? 1 : 0.35 }}
                        />
                        <span
                          className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${
                            on ? 'text-accent' : 'text-zinc-400'
                          }`}
                        >
                          {drawingTypeShort(d)}
                        </span>
                        <span
                          className={`truncate font-mono text-[10px] ${
                            vis ? 'text-zinc-300' : 'text-zinc-600 line-through'
                          }`}
                        >
                          {summary}
                        </span>
                      </button>
                      <button
                        type="button"
                        title={vis ? 'Hide' : 'Show'}
                        onClick={() => {
                          const next = drawingsRef.current.map((x) =>
                            x.id === d.id
                              ? withDrawingDefaults({ ...x, visible: !vis })
                              : x,
                          );
                          persistDrawings(next);
                        }}
                        className={`flex h-5 w-5 items-center justify-center rounded-[2px] ${
                          vis ? 'text-accent' : 'text-zinc-600'
                        }`}
                      >
                        <IconEye open={vis} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => {
                          const next = drawingsRef.current.filter((x) => x.id !== d.id);
                          if (selectedIdRef.current === d.id) {
                            selectedIdRef.current = null;
                            setSelectedId(null);
                          }
                          persistDrawings(next);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-[2px] text-zinc-600 hover:text-down"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Mode + TF pills — compact, top-left of chart content */}
        <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex items-center gap-1">
          <div className="pointer-events-auto flex h-6 overflow-hidden rounded-[2px] border border-terminal-border bg-black/55 backdrop-blur-[2px]">
            <ModePill
              label="Candles"
              short="Cdl"
              on={chartMode === 'candles'}
              onClick={() => setChartMode('candles')}
            />
            <ModePill
              label="Footprint"
              short="FP"
              on={chartMode === 'footprint'}
              onClick={() => setChartMode('footprint')}
            />
          </div>
          <div className="pointer-events-auto flex h-6 overflow-hidden rounded-[2px] border border-terminal-border bg-black/55 backdrop-blur-[2px]">
            {CHART_INTERVALS.map((iv) => (
              <TfPill
                key={iv}
                label={iv}
                on={chartInterval === iv}
                onClick={() => setChartInterval(iv)}
              />
            ))}
          </div>
          {chartMode === 'footprint' && (
            <div className="pointer-events-none hidden h-6 items-center rounded-[2px] border border-terminal-border/80 bg-black/45 px-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500 backdrop-blur-[2px] sm:flex">
              sell|buy · imb ≥{FOOTPRINT_IMBALANCE_RATIO}:1 · stack≥{FOOTPRINT_STACK_MIN} · naked POC
            </div>
          )}
        </div>

        {/* Layer dock — favorites + Layers checklist (MMT-style) */}
        <div data-layer-menus className="pointer-events-none absolute bottom-1.5 left-1.5 right-14 z-10 flex justify-start gap-1">
          <div className="pointer-events-auto flex h-7 items-stretch overflow-hidden rounded-[2px] border border-terminal-border bg-black/55 backdrop-blur-[2px]">
            <LayerChip
              label="Heatmap"
              short="HM"
              on={showHeatmap}
              onClick={() => {
                const next = !showHeatmap;
                setShowHeatmap(next);
                if (!next) setHeatmapMenuOpen(false);
              }}
              onGear={
                showHeatmap
                  ? () => {
                      setHeatmapMenuOpen((v) => !v);
                      setVwapMenuOpen(false);
                      setBarStatsMenuOpen(false);
                      setLayersMenuOpen(false);
                    }
                  : undefined
              }
              gearTitle="Heatmap craft"
              gearOpen={heatmapMenuOpen}
            />
            <LayerChip
              label="VWAP"
              short="VWAP"
              on={showVwap}
              onClick={() => {
                const next = !showVwap;
                setShowVwap(next);
                setVwapMenuOpen(next);
                if (next) {
                  setBarStatsMenuOpen(false);
                  setLayersMenuOpen(false);
                  setHeatmapMenuOpen(false);
                }
              }}
              onGear={
                showVwap
                  ? () => {
                      setVwapMenuOpen((v) => !v);
                      setBarStatsMenuOpen(false);
                      setLayersMenuOpen(false);
                      setHeatmapMenuOpen(false);
                    }
                  : undefined
              }
              gearTitle="VWAP anchors"
            />
            <LayerChip
              label="CVD"
              short="CVD"
              on={showCvdOverlay}
              onClick={() => setShowCvdOverlay(!showCvdOverlay)}
            />
            <div className="mx-0.5 my-1 w-px self-stretch bg-terminal-border/80" />
            <button
              type="button"
              title="Chart layers — overlays & studies"
              onClick={() => {
                setLayersMenuOpen((v) => !v);
                setVwapMenuOpen(false);
                setBarStatsMenuOpen(false);
                setHeatmapMenuOpen(false);
              }}
              className={`inline-flex items-center gap-1 px-1.5 text-[9px] font-semibold uppercase tracking-wider ${
                layersMenuOpen
                  ? 'bg-accent/20 text-accent ring-1 ring-inset ring-accent/40'
                  : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
              }`}
            >
              <IconLayers />
              <span className="hidden sm:inline">Layers</span>
              <span className="sm:hidden">Lay</span>
              {layersExtraCount > 0 && (
                <span className="rounded-[2px] bg-white/[0.06] px-1 font-mono text-[8px] text-zinc-400">
                  {layersExtraCount}
                </span>
              )}
              <span className="text-[8px] opacity-70">▾</span>
            </button>
          </div>

          {layersMenuOpen && (
            <div className="pointer-events-auto absolute bottom-9 left-0 z-20 w-[188px] rounded-[2px] border border-terminal-border bg-black/92 p-1 shadow-panel backdrop-blur-[2px]">
              <div className="flex items-center gap-1.5 px-1.5 pb-1 pt-0.5">
                <IconLayers className="text-zinc-500" />
                <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                  Layers
                </span>
              </div>

              <div className="px-1.5 pb-0.5 pt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                Overlays
              </div>
              <LayerCheck
                label="Profile"
                hint="VPVR volume profile"
                on={showProfile}
                onClick={() => setShowProfile(!showProfile)}
              />
              <LayerCheck
                label="Bubbles"
                hint="Aggressor size bubbles"
                on={showBubbles}
                onClick={() => setShowBubbles(!showBubbles)}
              />
              <LayerCheck
                label="Bars"
                hint="Bar stats intensity"
                on={showBarStats}
                onClick={() => {
                  const next = !showBarStats;
                  setShowBarStats(next);
                  if (!next) setBarStatsMenuOpen(false);
                }}
                onGear={
                  showBarStats
                    ? () => {
                        setBarStatsMenuOpen((v) => !v);
                        setVwapMenuOpen(false);
                        setHeatmapMenuOpen(false);
                      }
                    : undefined
                }
                gearOpen={barStatsMenuOpen}
                gearTitle="Bar stats metric"
              />
              {showBarStats && barStatsMenuOpen && (
                <div className="mb-0.5 ml-5 mr-0.5 rounded-[2px] border border-terminal-border/70 bg-black/50 p-0.5">
                  {([
                    ['volume', 'Volume'],
                    ['delta', 'Delta'],
                  ] as [BarStatsMetric, string][]).map(([id, label]) => {
                    const on = barStatsMetric === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        title={`Grade candles by ${label.toLowerCase()} vs recent average`}
                        onClick={() => setBarStatsMetric(id)}
                        className={`flex w-full items-center rounded-[2px] px-1.5 py-0.5 text-left font-mono text-[10px] uppercase tracking-wider ${
                          on
                            ? 'bg-white/[0.06] text-zinc-100'
                            : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                        }`}
                      >
                        {label}
                        {on && <span className="ml-auto text-accent">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mx-1 my-1 h-px bg-terminal-border/70" />

              <div className="px-1.5 pb-0.5 pt-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                Studies
              </div>
              <LayerCheck
                label="Count"
                hint="Buy vs sell trade counts"
                on={volumePaneMode === 'count'}
                onClick={() =>
                  setVolumePaneMode(volumePaneMode === 'count' ? 'volume' : 'count')
                }
              />
              <LayerCheck
                label="Liqs"
                hint="Liquidation markers"
                on={showLiqMarkers}
                onClick={() => setShowLiqMarkers(!showLiqMarkers)}
              />

              <div className="mt-1 border-t border-terminal-border/70 px-1.5 pt-1 font-mono text-[8px] leading-snug text-zinc-600">
                Favorites on dock · Heatmap / VWAP / CVD
              </div>
            </div>
          )}

          {showHeatmap && heatmapMenuOpen && (
            <div
              data-heatmap-craft
              className="pointer-events-auto absolute bottom-9 left-0 z-20 w-[220px] rounded-[2px] border border-terminal-border bg-black/92 p-1.5 shadow-panel backdrop-blur-[2px]"
            >
              <div className="flex items-center gap-1.5 px-1 pb-1 pt-0.5">
                <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                  Heatmap craft
                </span>
                <span className="ml-auto font-mono text-[8px] uppercase tracking-wider text-zinc-600">
                  live
                </span>
              </div>

              <label className="mb-1 block px-1">
                <div className="mb-0.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
                  <span>Low</span>
                  <span className="text-zinc-400">{Math.round(heatmapCraft.lowIntensity * 100)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={Math.round(heatmapCraft.lowIntensity * 100)}
                  onChange={(e) =>
                    updateHeatmapCraft({ lowIntensity: Number(e.target.value) / 100 })
                  }
                  className="hm-craft-range w-full"
                  title="Hide soft liquidity below this floor"
                />
              </label>

              <label className="mb-1.5 block px-1">
                <div className="mb-0.5 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
                  <span>Peak</span>
                  <span className="text-zinc-400">{Math.round(heatmapCraft.peakIntensity * 100)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(heatmapCraft.peakIntensity * 100)}
                  onChange={(e) =>
                    updateHeatmapCraft({ peakIntensity: Number(e.target.value) / 100 })
                  }
                  className="hm-craft-range w-full"
                  title="Soft-peak saturation — higher = only walls glow"
                />
              </label>

              <div className="mb-1 px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                Bins
              </div>
              <div className="mb-1.5 flex gap-0.5 px-1">
                {([
                  ['hd', 'HD'],
                  ['sd', 'SD'],
                ] as const).map(([id, label]) => {
                  const on = heatmapCraft.binMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={id === 'hd' ? 'Finer price bins' : 'Coarser aggregated bins'}
                      onClick={() => updateHeatmapCraft({ binMode: id })}
                      className={`flex-1 rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        on
                          ? 'bg-accent/20 text-accent ring-1 ring-inset ring-accent/40'
                          : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mb-1 px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                Style
              </div>
              <div className="mb-1.5 flex gap-0.5 px-1">
                {([
                  ['classic', 'Classic'],
                  ['splat', 'Splat'],
                ] as const).map(([id, label]) => {
                  const on = heatmapCraft.style === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={id === 'classic' ? 'Crisp book walls' : 'Softer / blurrier walls'}
                      onClick={() => updateHeatmapCraft({ style: id })}
                      className={`flex-1 rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        on
                          ? 'bg-accent/20 text-accent ring-1 ring-inset ring-accent/40'
                          : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                title="Keep heatmap trail updating at the live right edge"
                onClick={() => updateHeatmapCraft({ extendLive: !heatmapCraft.extendLive })}
                className={`mb-1.5 flex w-full items-center gap-1.5 rounded-[2px] px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
                  heatmapCraft.extendLive
                    ? 'bg-accent/20 text-accent ring-1 ring-inset ring-accent/40'
                    : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span
                  className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border ${
                    heatmapCraft.extendLive
                      ? 'border-accent/60 bg-accent/25 text-accent'
                      : 'border-terminal-border bg-black/40 text-transparent'
                  }`}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                    <path d="M1.5 4.2L3.2 5.8L6.5 2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                Extend live
              </button>

              <div className="mb-1 px-1 font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-600">
                Colormap
              </div>
              <div className="mb-0.5 grid grid-cols-2 gap-0.5 px-1">
                {HEATMAP_COLORMAPS.map((cm) => {
                  const on = heatmapCraft.colormap === cm.id;
                  return (
                    <button
                      key={cm.id}
                      type="button"
                      title={cm.hint}
                      onClick={() => updateHeatmapCraft({ colormap: cm.id })}
                      className={`rounded-[2px] px-1.5 py-0.5 text-left font-mono text-[9px] uppercase tracking-wider ${
                        on
                          ? 'bg-accent/20 text-accent ring-1 ring-inset ring-accent/40'
                          : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {cm.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-1 border-t border-terminal-border/70 px-1 pt-1 font-mono text-[8px] leading-snug text-zinc-600">
                Rolling book craft · not historical HD archive
              </div>
            </div>
          )}

          {showVwap && vwapMenuOpen && (
            <div className="pointer-events-auto absolute bottom-9 left-0 z-20 min-w-[148px] rounded-[2px] border border-terminal-border bg-black/90 p-1 shadow-panel backdrop-blur-[2px]">
              <div className="px-1.5 pb-1 pt-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                VWAP anchor
              </div>
              {VWAP_ANCHORS.map((anchor) => {
                const on = vwapAnchors.includes(anchor);
                return (
                  <button
                    key={anchor}
                    type="button"
                    title={VWAP_ANCHOR_TITLE[anchor]}
                    onClick={() => setVwapAnchors(toggleVwapAnchor(vwapAnchors, anchor))}
                    className={`flex w-full items-center gap-1.5 rounded-[2px] px-1.5 py-1 text-left font-mono text-[10px] uppercase tracking-wider ${
                      on
                        ? 'bg-white/[0.06] text-zinc-100'
                        : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
                    }`}
                  >
                    <span
                      className="inline-block h-1.5 w-3 rounded-full"
                      style={{ background: VWAP_ANCHOR_COLOR[anchor], opacity: on ? 1 : 0.35 }}
                    />
                    {VWAP_ANCHOR_LABEL[anchor]}
                    {on && <span className="ml-auto text-accent">✓</span>}
                  </button>
                );
              })}
              <div className="mt-0.5 border-t border-terminal-border/80 px-1.5 pt-1 font-mono text-[9px] leading-snug text-zinc-600">
                Day+Week ok · limited by candle history
              </div>
            </div>
          )}
        </div>

        {toolHint && (
          <div className="pointer-events-none absolute left-1/2 top-8 z-10 -translate-x-1/2 rounded-[2px] border border-terminal-border bg-black/65 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400 backdrop-blur-[2px]">
            {toolHint}
          </div>
        )}

        {selectedDrawing && !priceEdit && (
          <div className="drawing-props-panel pointer-events-auto absolute right-2 top-1.5 z-[6] flex items-center gap-1.5 rounded-[2px] border border-terminal-border bg-black/80 px-1.5 py-1 backdrop-blur-[2px]">
            <div className="flex items-center gap-0.5">
              {DRAWING_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={`Color ${c}`}
                  onClick={() => patchSelected({ color: c })}
                  className={`h-3.5 w-3.5 rounded-[2px] border ${
                    selectedDrawing.color === c
                      ? 'border-accent ring-1 ring-accent/50'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="h-3.5 w-px bg-terminal-border" />
            <div className="flex items-center gap-0.5">
              {LINE_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  title={`Line width ${w}`}
                  onClick={() => patchSelected({ lineWidth: w })}
                  className={`flex h-5 min-w-[18px] items-center justify-center rounded-[2px] px-1 font-mono text-[9px] ${
                    selectedDrawing.lineWidth === w
                      ? 'bg-accent/20 text-accent'
                      : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'
                  }`}
                >
                  <span
                    className="block w-3 rounded-full bg-current"
                    style={{ height: Math.max(1, w) }}
                  />
                </button>
              ))}
            </div>
            {showExtend && (
              <>
                <div className="h-3.5 w-px bg-terminal-border" />
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Extend left"
                    onClick={() =>
                      patchSelected({
                        extendLeft: !('extendLeft' in selectedDrawing
                          ? selectedDrawing.extendLeft
                          : false),
                      } as Partial<ChartDrawing>)
                    }
                    className={`flex h-5 min-w-[22px] items-center justify-center rounded-[2px] px-1 font-mono text-[9px] uppercase ${
                      'extendLeft' in selectedDrawing && selectedDrawing.extendLeft
                        ? 'bg-accent/20 text-accent'
                        : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'
                    }`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    title="Extend right"
                    onClick={() =>
                      patchSelected({
                        extendRight: !('extendRight' in selectedDrawing
                          ? selectedDrawing.extendRight
                          : false),
                      } as Partial<ChartDrawing>)
                    }
                    className={`flex h-5 min-w-[22px] items-center justify-center rounded-[2px] px-1 font-mono text-[9px] uppercase ${
                      'extendRight' in selectedDrawing && selectedDrawing.extendRight
                        ? 'bg-accent/20 text-accent'
                        : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'
                    }`}
                  >
                    →
                  </button>
                </div>
              </>
            )}
            {showFibProps && selectedDrawing.type === 'fib' && (
              <>
                <div className="h-3.5 w-px bg-terminal-border" />
                <button
                  type="button"
                  title="Extend fib levels right"
                  onClick={() =>
                    patchSelected({
                      extendRight: !selectedDrawing.extendRight,
                    } as Partial<ChartDrawing>)
                  }
                  className={`flex h-5 min-w-[22px] items-center justify-center rounded-[2px] px-1 font-mono text-[9px] uppercase ${
                    selectedDrawing.extendRight
                      ? 'bg-accent/20 text-accent'
                      : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'
                  }`}
                >
                  →
                </button>
                <div className="flex items-center gap-0.5">
                  {FIB_TOGGLE_LEVELS.map((lvl) => {
                    const on = activeFibLevels(selectedDrawing).includes(lvl);
                    const chip =
                      lvl === 0.5 ? '50' : String(Math.round(lvl * 1000));
                    return (
                      <button
                        key={lvl}
                        type="button"
                        title={`Fib ${lvl} ${on ? 'on' : 'off'}`}
                        onClick={() => {
                          const cur = new Set(activeFibLevels(selectedDrawing));
                          if (on) cur.delete(lvl);
                          else cur.add(lvl);
                          patchSelected({
                            levels: normalizeFibLevels([...cur]),
                          } as Partial<ChartDrawing>);
                        }}
                        className={`flex h-5 min-w-[22px] items-center justify-center rounded-[2px] px-0.5 font-mono text-[8px] ${
                          on
                            ? 'bg-accent/20 text-accent'
                            : 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300'
                        }`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="h-3.5 w-px bg-terminal-border" />
            <button
              type="button"
              title={selectedVisible ? 'Hide drawing' : 'Show drawing'}
              onClick={() =>
                patchSelected({ visible: !selectedVisible } as Partial<ChartDrawing>)
              }
              className={`flex h-5 items-center justify-center rounded-[2px] px-1 ${
                selectedVisible
                  ? 'text-accent hover:bg-accent/10'
                  : 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300'
              }`}
            >
              <IconEye open={selectedVisible} />
            </button>
            <button
              type="button"
              title="Delete drawing"
              onClick={deleteSelected}
              className="flex h-5 items-center justify-center rounded-[2px] px-1.5 font-mono text-[10px] text-zinc-500 hover:bg-down/10 hover:text-down"
            >
              Del
            </button>
          </div>
        )}

        <div ref={containerRef} className="h-full w-full" />
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 z-[1]"
          aria-hidden
        />

        {selectedId && deletePos && !priceEdit && (
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

        {priceEdit && (
          <div className="absolute left-1/2 top-9 z-[5] flex -translate-x-1/2 items-center gap-1 rounded-[2px] border border-accent/40 bg-black/85 px-1.5 py-1 shadow-panel backdrop-blur-[2px]">
            <span className="text-[9px] uppercase tracking-wider text-terminal-label">Price</span>
            <input
              autoFocus
              value={priceEdit.value}
              onChange={(e) => setPriceEdit({ ...priceEdit, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPriceEdit();
                if (e.key === 'Escape') setPriceEdit(null);
              }}
              onBlur={commitPriceEdit}
              className="h-5 w-[96px] rounded-[2px] border border-terminal-border bg-terminal-elevated px-1.5 font-mono text-[11px] text-accent outline-none focus:border-accent/50"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ModePill({
  label,
  short,
  on,
  onClick,
}: {
  label: string;
  short: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={`Chart mode: ${label}`}
      onClick={onClick}
      className={`min-w-[28px] px-1.5 text-[10px] font-semibold uppercase tracking-wider ${
        on
          ? 'bg-accent/20 text-accent'
          : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
      }`}
    >
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{short}</span>
    </button>
  );
}

function TfPill({
  label,
  on,
  onClick,
}: {
  label: ChartInterval;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={`Chart timeframe ${label}`}
      onClick={onClick}
      className={`min-w-[28px] px-1.5 text-[10px] font-semibold uppercase tracking-wider ${
        on
          ? 'bg-accent/20 text-accent'
          : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
}

function LayerChip({
  label,
  short,
  on,
  onClick,
  onGear,
  gearTitle,
  gearOpen,
}: {
  label: string;
  short: string;
  on: boolean;
  onClick: () => void;
  onGear?: () => void;
  gearTitle?: string;
  gearOpen?: boolean;
}) {
  return (
    <span className="inline-flex items-stretch">
      <button
        type="button"
        title={label}
        onClick={onClick}
        className={`px-1.5 text-[9px] font-semibold uppercase tracking-wider ${
          on
            ? 'bg-accent/20 text-accent'
            : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
        }`}
      >
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{short}</span>
      </button>
      {onGear && (
        <button
          type="button"
          title={gearTitle ?? `${label} options`}
          onClick={(e) => {
            e.stopPropagation();
            onGear();
          }}
          className={`border-l border-terminal-border/70 px-1 text-[9px] ${
            gearOpen
              ? 'bg-accent/25 text-accent ring-1 ring-inset ring-accent/40'
              : on
                ? 'bg-accent/10 text-accent/90 hover:text-accent'
                : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
          }`}
        >
          ▾
        </button>
      )}
    </span>
  );
}

function LayerCheck({
  label,
  hint,
  on,
  onClick,
  onGear,
  gearOpen,
  gearTitle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onClick: () => void;
  onGear?: () => void;
  gearOpen?: boolean;
  gearTitle?: string;
}) {
  return (
    <div className="flex items-stretch gap-0.5">
      <button
        type="button"
        title={hint}
        onClick={onClick}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-[2px] px-1.5 py-1 text-left font-mono text-[10px] uppercase tracking-wider ${
          on
            ? 'bg-white/[0.06] text-zinc-100'
            : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
        }`}
      >
        <span
          className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border ${
            on
              ? 'border-accent/60 bg-accent/25 text-accent'
              : 'border-terminal-border bg-black/40 text-transparent'
          }`}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
            <path d="M1.5 4.2L3.2 5.8L6.5 2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="truncate">{label}</span>
      </button>
      {onGear && (
        <button
          type="button"
          title={gearTitle ?? `${label} options`}
          onClick={(e) => {
            e.stopPropagation();
            onGear();
          }}
          className={`rounded-[2px] px-1.5 text-[9px] ${
            gearOpen || on
              ? 'text-accent hover:bg-accent/10'
              : 'text-zinc-600 hover:bg-white/[0.03] hover:text-zinc-300'
          }`}
        >
          ▾
        </button>
      )}
    </div>
  );
}

function IconLayers({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M6 1.5L10.5 4 6 6.5 1.5 4 6 1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M1.5 6L6 8.5 10.5 6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <path
        d="M1.5 8L6 10.5 10.5 8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}

function ToolIcon({
  title,
  active,
  onClick,
  danger,
  children,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-[2px] transition-colors ${
        active
          ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
          : danger
            ? 'text-zinc-500 hover:bg-down/10 hover:text-down'
            : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function IconCursor() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 2l7.5 5.2-3.2.6 1.6 3.4-1.3.6-1.7-3.5L3 10.2V2z" fill="currentColor" />
    </svg>
  );
}

function IconHLine() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="3" cy="7" r="1.2" fill="currentColor" />
      <circle cx="11" cy="7" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconHRay() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="3" cy="7" r="1.35" fill="currentColor" />
      <path d="M11 4.8L13 7l-2 2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 11L11.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2.5" cy="11" r="1.3" fill="currentColor" />
      <circle cx="11.5" cy="3" r="1.3" fill="currentColor" />
    </svg>
  );
}

function IconRect() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2.5" y="3.5" width="9" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconFib() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 3.5h10M2 7h10M2 10.5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3 11.5L11 2.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" opacity="0.7" />
    </svg>
  );
}

function IconEraser() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M8.2 2.4l3.4 3.4-5.8 5.8H2.4L8.2 2.4z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M5.2 11.6H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconMagnet() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 2.5v4.2a3.5 3.5 0 007 0V2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M3.5 2.5h2.2v3H3.5zM8.3 2.5H10.5v3H8.3z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function IconClear() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconObjectTree() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 3.5h8M3 7h8M3 10.5h5.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="11.2" cy="10.5" r="1.15" fill="currentColor" />
    </svg>
  );
}

function IconEye({ open }: { open: boolean }) {
  if (!open) {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="M1.5 6s1.8-3 4.5-3 4.5 3 4.5 3-1.8 3-4.5 3-4.5-3-4.5-3z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M2 10L10 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M1.5 6s1.8-3 4.5-3 4.5 3 4.5 3-1.8 3-4.5 3-4.5-3-4.5-3z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="6" cy="6" r="1.35" fill="currentColor" />
    </svg>
  );
}
