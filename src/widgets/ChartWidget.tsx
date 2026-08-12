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

const UP = '#0ecb81';
const DOWN = '#f6465d';
const PANEL = '#0a0c10';
const GRID = '#12161e';
const TEXT = '#6b7280';

export function ChartWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);
  const cvdRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<{ setMarkers: (m: SeriesMarker<Time>[]) => void } | null>(null);

  const feed = useTerminalStore((s) => s.feed);
  const showVwap = useTerminalStore((s) => s.showVwap);
  const showCvdOverlay = useTerminalStore((s) => s.showCvdOverlay);
  const showLiqMarkers = useTerminalStore((s) => s.showLiqMarkers);
  const setShowVwap = useTerminalStore((s) => s.setShowVwap);
  const setShowCvdOverlay = useTerminalStore((s) => s.setShowCvdOverlay);
  const setShowLiqMarkers = useTerminalStore((s) => s.setShowLiqMarkers);

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

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
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
          time: (Math.floor(l.time / 1000) as unknown as Time),
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
  }, [feed, showVwap, showCvdOverlay, showLiqMarkers]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="absolute left-1.5 top-1.5 z-10 flex overflow-hidden rounded-[2px] border border-terminal-border bg-black/55 backdrop-blur-[2px]">
        <Toggle label="VWAP" on={showVwap} onClick={() => setShowVwap(!showVwap)} />
        <Toggle label="CVD" on={showCvdOverlay} onClick={() => setShowCvdOverlay(!showCvdOverlay)} />
        <Toggle label="Liqs" on={showLiqMarkers} onClick={() => setShowLiqMarkers(!showLiqMarkers)} />
      </div>
      <div ref={containerRef} className="h-full w-full" />
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
