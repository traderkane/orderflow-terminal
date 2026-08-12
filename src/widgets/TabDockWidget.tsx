import { useMemo, type ReactNode } from 'react';
import { WidgetShell } from '../components/WidgetShell';
import {
  WIDGET_META,
  WIDGET_TAB_LABEL,
  useTerminalStore,
} from '../store/useTerminalStore';
import type { WidgetInstance, WidgetType } from '../types/market';

interface Props {
  widget: WidgetInstance;
  renderPanel: (type: WidgetType) => ReactNode;
  onClose?: () => void;
}

function tabLabel(type: WidgetType): string {
  return WIDGET_TAB_LABEL[type] ?? WIDGET_META[type]?.title ?? type;
}

/** One chrome frame hosting multiple child widget types as MMT-style tabs. */
export function TabDockWidget({ widget, renderPanel, onClose }: Props) {
  const setDockActiveTab = useTerminalStore((s) => s.setDockActiveTab);
  const tabs = useMemo(
    () => (widget.tabs ?? []).filter((t) => t !== 'tabDock'),
    [widget.tabs],
  );
  const activeTab = Math.min(
    Math.max(0, widget.activeTab ?? 0),
    Math.max(0, tabs.length - 1),
  );
  const activeType = tabs[activeTab];

  const header = (
    <div className="tab-dock-tabs" role="tablist" aria-label="Dock panels">
      {tabs.map((type, index) => {
        const active = index === activeTab;
        return (
          <button
            key={`${type}-${index}`}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? 'true' : 'false'}
            title={WIDGET_META[type]?.title ?? type}
            className="tab-dock-tab"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!active) setDockActiveTab(widget.id, index);
            }}
          >
            {tabLabel(type)}
          </button>
        );
      })}
      {tabs.length === 0 && (
        <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
          Empty dock
        </span>
      )}
    </div>
  );

  return (
    <WidgetShell title={header} onClose={onClose} className="tab-dock-shell">
      {activeType ? (
        <div className="tab-dock-body h-full min-h-0" role="tabpanel">
          {renderPanel(activeType)}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-[11px] text-terminal-muted">
          No panels in this dock
        </div>
      )}
    </WidgetShell>
  );
}
