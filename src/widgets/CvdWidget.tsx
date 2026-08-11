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
        background: { type: ColorType.Solid, color: '#0d1118' },
        textColor: '#8b93a7',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      },
      grid: {
        vertLines: { color: '#1a2030' },
        horzLines: { color: '#1a2030' },
      },
      rightPriceScale: { borderColor: '#1f2937' },
      timeScale: { borderColor: '#1f2937', timeVisible: true },
    });

    const line = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      priceLineVisible: false,
    });
    const hist = chart.addSeries(HistogramSeries, {
      priceScaleId: 'delta',
      priceFormat: { type: 'volume' },
    });
    chart.priceScale('delta').applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
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
        color: p.delta >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)',
      })),
    );
  }, [cvd]);

  return <div ref={containerRef} className="h-full w-full" />;
}
