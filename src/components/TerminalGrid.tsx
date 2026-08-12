import { useMemo, type RefObject } from 'react';
import GridLayout, { useContainerWidth } from 'react-grid-layout';
import { useTerminalStore, WIDGET_META } from '../store/useTerminalStore';
import { WidgetShell } from './WidgetShell';
import { ChartWidget } from '../widgets/ChartWidget';
import { OrderBookWidget } from '../widgets/OrderBookWidget';
import { TradesTapeWidget } from '../widgets/TradesTapeWidget';
import { HeatmapWidget } from '../widgets/HeatmapWidget';
import { CvdWidget } from '../widgets/CvdWidget';
import { VolumeProfileWidget } from '../widgets/VolumeProfileWidget';
import { LiquidationsWidget } from '../widgets/LiquidationsWidget';
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
    case 'liquidations':
      return <LiquidationsWidget />;
    case 'stats':
      return <StatsWidget />;
  }
}

export function TerminalGrid() {
  const widgets = useTerminalStore((s) => s.widgets);
  const layout = useTerminalStore((s) => s.layout);
  const setLayout = useTerminalStore((s) => s.setLayout);
  const removeWidget = useTerminalStore((s) => s.removeWidget);
  const { width, containerRef, mounted } = useContainerWidth();
  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);

  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement>}
      className="min-h-0 flex-1 overflow-auto bg-terminal-bg p-1"
    >
      {mounted && (
        <GridLayout
          className="layout"
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 32, margin: [4, 4], containerPadding: [0, 0] }}
          dragConfig={{ enabled: true, handle: '.drag-handle' }}
          resizeConfig={{ enabled: true }}
          onLayoutChange={(next) => {
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
            return (
              <div key={item.i} className="h-full">
                <WidgetShell
                  title={WIDGET_META[widget.type].title}
                  onClose={() => removeWidget(widget.id)}
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
