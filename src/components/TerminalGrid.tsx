import { useEffect, useMemo, useState, type RefObject } from 'react';
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
import { TabDockWidget } from '../widgets/TabDockWidget';
import type { LayoutItem, WidgetType } from '../types/market';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const GRID_COLS = 12;
const GRID_MARGIN: [number, number] = [1, 1];
const GRID_PADDING: [number, number] = [1, 1];
/** Floor so dense custom layouts still scroll instead of crushing panels. */
const MIN_ROW_HEIGHT = 18;

function layoutRows(layout: LayoutItem[]): number {
  let max = 0;
  for (const item of layout) {
    max = Math.max(max, item.y + item.h);
  }
  return max || 1;
}

/** Size rowHeight so the current layout bottom maps to the workspace height. */
function rowHeightForContainer(containerHeight: number, rows: number): number {
  if (containerHeight <= 0) return 28;
  const marginY = GRID_MARGIN[1];
  const padY = GRID_PADDING[1];
  // RGL: height = rows * rowHeight + (rows - 1) * marginY + 2 * padY
  const usable = containerHeight - (rows - 1) * marginY - padY * 2;
  return Math.max(MIN_ROW_HEIGHT, Math.floor(usable / rows));
}

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
    case 'tabDock':
      return null;
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
  const { width, containerRef, mounted } = useContainerWidth();
  const [containerHeight, setContainerHeight] = useState(0);
  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setContainerHeight(el.clientHeight);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const rows = useMemo(() => layoutRows(layout), [layout]);
  const rowHeight = useMemo(
    () => rowHeightForContainer(containerHeight, rows),
    [containerHeight, rows],
  );

  // First / main chart only — secondary chart widgets never enter maximize chrome.
  const mainChartId = useMemo(
    () => widgets.find((w) => w.type === 'chart')?.id ?? null,
    [widgets],
  );

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
        if (!mainChartId) return;
        e.preventDefault();
        useTerminalStore.getState().toggleChartMaximized();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mainChartId]);

  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement>}
      tabIndex={-1}
      className={`terminal-workspace flex min-h-0 flex-1 flex-col overflow-auto outline-none ${
        chartMaximized ? 'grid-chart-maximized' : ''
      }`}
    >
      {mounted && (
        <GridLayout
          className="layout min-h-full w-full flex-1"
          width={width}
          layout={layout}
          gridConfig={{
            cols: GRID_COLS,
            rowHeight,
            margin: GRID_MARGIN,
            containerPadding: GRID_PADDING,
          }}
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
            const isMainChart = widget.type === 'chart' && widget.id === mainChartId;
            if (widget.type === 'tabDock') {
              return (
                <div key={item.i} className="h-full is-side-widget">
                  <TabDockWidget
                    widget={widget}
                    renderPanel={renderWidget}
                    onClose={chartMaximized ? undefined : () => removeWidget(widget.id)}
                  />
                </div>
              );
            }
            return (
              <div
                key={item.i}
                className={`h-full ${isMainChart ? 'is-chart-widget' : 'is-side-widget'}`}
              >
                <WidgetShell
                  title={WIDGET_META[widget.type].title}
                  onClose={
                    chartMaximized && isMainChart
                      ? undefined
                      : () => removeWidget(widget.id)
                  }
                  actions={isMainChart ? <ChartMaximizeButton /> : undefined}
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
