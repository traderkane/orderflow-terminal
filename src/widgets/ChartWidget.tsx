import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import { useTerminalStore } from '../store/useTerminalStore';
import type { HeatmapFrame } from '../types/market';

const UP = '#0ecb81';
const DOWN = '#f6465d';
const PANEL = '#0a0c10';
const GRID = '#12161e';
const TEXT = '#6b7280';

function frameTimeSec(t: number): number {
  // Live heatmap uses ms; mock uses unix seconds.
  return t > 1e12 ? t / 1000 : t;
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

  const feed = useTerminalStore((s) => s.feed);
  const showVwap = useTerminalStore((s) => s.showVwap);
  const showCvdOverlay = useTerminalStore((s) => s.showCvdOverlay);
  const showLiqMarkers = useTerminalStore((s) => s.showLiqMarkers);
  const showHeatmap = useTerminalStore((s) => s.showHeatmap);
  const setShowVwap = useTerminalStore((s) => s.setShowVwap);
  const setShowCvdOverlay = useTerminalStore((s) => s.setShowCvdOverlay);
  const setShowLiqMarkers = useTerminalStore((s) => s.setShowLiqMarkers);
  const setShowHeatmap = useTerminalStore((s) => s.setShowHeatmap);

  const drawHeatmap = () => {
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

    if (!showHeatmap) return;
    const frames = heatmapRef.current;
    if (!frames.length) return;

    const recent = frames.slice(-120);
    const timeScale = chart.timeScale();

    // Prefer true time alignment; if frames collapse into a thin strip
    // (sub-candle sampling), stretch them across the right plot area.
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

    // Right-side stretch window: leave room for older candles on the left.
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
          prev != null && Number.isFinite(prev) ? (x - prev) / 2 : Math.max(2, (x1 - x0) / recent.length / 2);
        const rightGap =
          next != null && Number.isFinite(next) ? (next - x) / 2 : Math.max(2, (x1 - x0) / recent.length / 2);
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

        // Approximate cell height from neighboring buckets.
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
        // Keep candles readable — soft overlay.
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

  const scheduleHeatmap = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawHeatmap();
    });
  };

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

    const onRange = () => scheduleHeatmap();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
      scheduleHeatmap();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
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
    scheduleHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, showVwap, showCvdOverlay, showLiqMarkers]);

  useEffect(() => {
    scheduleHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHeatmap]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="absolute left-1.5 top-1.5 z-10 flex overflow-hidden rounded-[2px] border border-terminal-border bg-black/55 backdrop-blur-[2px]">
        <Toggle label="Heatmap" on={showHeatmap} onClick={() => setShowHeatmap(!showHeatmap)} />
        <Toggle label="VWAP" on={showVwap} onClick={() => setShowVwap(!showVwap)} />
        <Toggle label="CVD" on={showCvdOverlay} onClick={() => setShowCvdOverlay(!showCvdOverlay)} />
        <Toggle label="Liqs" on={showLiqMarkers} onClick={() => setShowLiqMarkers(!showLiqMarkers)} />
      </div>
      <div ref={containerRef} className="h-full w-full" />
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden
      />
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        on
          ? 'bg-up/15 text-up'
          : 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
}
