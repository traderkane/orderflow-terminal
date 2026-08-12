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
        background: { type: ColorType.Solid, color: '#0a0e15' },
        textColor: '#8b93a7',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a2030' },
        horzLines: { color: '#1a2030' },
      },
      rightPriceScale: { borderColor: '#1f2937' },
      timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#3dd68c',
      downColor: '#f07178',
      borderUpColor: '#3dd68c',
      borderDownColor: '#f07178',
      wickUpColor: '#3dd68c',
      wickDownColor: '#f07178',
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const vwap = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const cvd = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 1,
      priceScaleId: 'cvd',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale('cvd').applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.55 },
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
        color: c.close >= c.open ? 'rgba(61,214,140,0.4)' : 'rgba(240,113,120,0.4)',
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
          color: l.side === 'long' ? '#ef4444' : '#22c55e',
          shape: l.side === 'long' ? 'arrowUp' : 'arrowDown',
          text: `Liq ${l.size.toFixed(1)}`,
        }));
        // lightweight-charts requires sorted unique times; keep latest per bucket
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
      <div className="absolute left-2 top-2 z-10 flex gap-1">
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
      className={`rounded border px-1.5 py-0.5 text-[10px] ${
        on
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : 'border-terminal-border bg-black/40 text-zinc-500'
      }`}
    >
      {label}
    </button>
  );
}
