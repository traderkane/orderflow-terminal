import { useEffect, useMemo, type RefObject } from 'react';
import GridLayout, { useContainerWidth } from 'react-grid-layout';
import { useTerminalStore, WIDGET_META } from '../store/useTerminalStore';
import { WidgetShell } from './WidgetShell';
import { ChartWidget } from '../widgets/ChartWidget';
import { OrderBookWidget } from '../widgets/OrderBookWidget';
import { TradesTapeWidget } from '../widgets/TradesTapeWidget';
import { HeatmapWidget } from '../widgets/HeatmapWidget';
import { CvdWidget } from '../widgets/CvdWidget';
import { VolumeProfileWidget } from '../widgets/VolumeProfileWidget';
import { FootprintWidget } from '../widgets/FootprintWidget';
import { LiquidationsWidget } from '../widgets/LiquidationsWidget';
import { LiquidationMapWidget } from '../widgets/LiquidationMapWidget';
import { TpoWidget } from '../widgets/TpoWidget';
import { StatsWidget } from '../widgets/StatsWidget';
import type { LayoutItem, WidgetType } from '../types/market';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

function renderWidget(type: WidgetType) {
  switch (type) {
    case 'chart':
      return <ChartWidget />;
    case 'orderbook':
      return <OrderBookWidget />;
    case 'trades':
      return <TradesTapeWidget />;
    case 'heatmap':
      return <HeatmapWidget />;
    case 'cvd':
      return <CvdWidget />;
    case 'volumeProfile':
      return <VolumeProfileWidget />;
    case 'footprint':
      return <FootprintWidget />;
    case 'liquidations':
      return <LiquidationsWidget />;
    case 'liquidationMap':
      return <LiquidationMapWidget />;
    case 'tpo':
      return <TpoWidget />;
    case 'stats':
      return <StatsWidget />;
  }
}

function ChartMaximizeButton() {
  const chartMaximized = useTerminalStore((s) => s.chartMaximized);
  const toggleChartMaximized = useTerminalStore((s) => s.toggleChartMaximized);
  return (
    <button
      type="button"
      title={chartMaximized ? 'Restore chart (F / Esc)' : 'Maximize chart (F)'}
      onClick={(e) => {
        e.stopPropagation();
        toggleChartMaximized();
      }}
      className="flex h-5 w-5 items-center justify-center rounded-[2px] text-zinc-500 opacity-70 transition hover:bg-white/[0.05] hover:text-zinc-200 hover:opacity-100"
    >
      {chartMaximized ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 4V2h2M8 2h2v2M10 8v2H8M4 10H2V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M4 4h4v4H4z" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 4V2h2M8 2h2v2M10 8v2H8M4 10H2V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

export function TerminalGrid() {
  const widgets = useTerminalStore((s) => s.widgets);
  const layout = useTerminalStore((s) => s.layout);
  const setLayout = useTerminalStore((s) => s.setLayout);
  const removeWidget = useTerminalStore((s) => s.removeWidget);
  const chartMaximized = useTerminalStore((s) => s.chartMaximized);
  const setChartMaximized = useTerminalStore((s) => s.setChartMaximized);
  const { width, containerRef, mounted } = useContainerWidth();
  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);

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
      if (e.key === 'f' || e.key === 'F') {
        // Toggle maximize when a chart exists
        const hasChart = widgets.some((w) => w.type === 'chart');
        if (!hasChart) return;
        e.preventDefault();
        useTerminalStore.getState().toggleChartMaximized();
        return;
      }
      if (e.key === 'Escape' && chartMaximized) {
        e.preventDefault();
        setChartMaximized(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [widgets, chartMaximized, setChartMaximized]);

  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement>}
      tabIndex={-1}
      className={`min-h-0 flex-1 overflow-auto terminal-workspace outline-none ${
        chartMaximized ? 'grid-chart-maximized' : ''
      }`}
    >
      {mounted && (
        <GridLayout
          className="layout"
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 28, margin: [1, 1], containerPadding: [1, 1] }}
          dragConfig={{ enabled: !chartMaximized, handle: '.drag-handle' }}
          resizeConfig={{ enabled: !chartMaximized }}
          onLayoutChange={(next) => {
            if (chartMaximized) return;
            const cleaned: LayoutItem[] = next.map((item) => ({
              i: item.i,
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
              minW: item.minW,
              minH: item.minH,
            }));
            setLayout(cleaned);
          }}
        >
          {layout.map((item) => {
            const widget = byId.get(item.i);
            if (!widget) return <div key={item.i} />;
            const isChart = widget.type === 'chart';
            return (
              <div
                key={item.i}
                className={`h-full ${isChart ? 'is-chart-widget' : 'is-side-widget'}`}
              >
                <WidgetShell
                  title={WIDGET_META[widget.type].title}
                  onClose={
                    chartMaximized && isChart
                      ? undefined
                      : () => removeWidget(widget.id)
                  }
                  actions={isChart ? <ChartMaximizeButton /> : undefined}
                >
                  {renderWidget(widget.type)}
                </WidgetShell>
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
}
