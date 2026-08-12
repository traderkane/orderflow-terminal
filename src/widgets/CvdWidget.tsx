import { useEffect, useRef } from 'react';
import {
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import { useTerminalStore } from '../store/useTerminalStore';

export function CvdWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const histRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const cvd = useTerminalStore((s) => s.feed?.cvd);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0c10' },
        textColor: '#6b7280',
        fontSize: 10,
        fontFamily: 'IBM Plex Mono, JetBrains Mono, ui-monospace, monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#12161e' },
        horzLines: { color: '#12161e' },
      },
      rightPriceScale: { borderColor: '#161a22' },
      timeScale: { borderColor: '#161a22', timeVisible: true },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(212,212,216,0.28)', style: 2, labelBackgroundColor: '#1a2030' },
        horzLine: { color: 'rgba(212,212,216,0.28)', style: 2, labelBackgroundColor: '#1a2030' },
      },
    });

    const line = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 1,
      priceLineVisible: false,
    });
    const hist = chart.addSeries(HistogramSeries, {
      priceScaleId: 'delta',
      priceFormat: { type: 'volume' },
    });
    chart.priceScale('delta').applyOptions({
      scaleMargins: { top: 0.72, bottom: 0 },
      borderVisible: false,
    });

    chartRef.current = chart;
    lineRef.current = line;
    histRef.current = hist;

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
    };
  }, []);

  useEffect(() => {
    if (!cvd || !lineRef.current || !histRef.current) return;
    lineRef.current.setData(cvd.map((p) => ({ time: p.time as Time, value: p.value })));
    histRef.current.setData(
      cvd.map((p) => ({
        time: p.time as Time,
        value: p.delta,
        color: p.delta >= 0 ? 'rgba(14,203,129,0.7)' : 'rgba(246,70,93,0.7)',
      })),
    );
  }, [cvd]);

  return <div ref={containerRef} className="h-full w-full" />;
}
