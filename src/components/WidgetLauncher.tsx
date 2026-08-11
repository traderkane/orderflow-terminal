import { useTerminalStore, WIDGET_META } from '../store/useTerminalStore';
import type { WidgetType } from '../types/market';

const TYPES = Object.keys(WIDGET_META) as WidgetType[];

export function WidgetLauncher() {
  const open = useTerminalStore((s) => s.launcherOpen);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);
  const addWidget = useTerminalStore((s) => s.addWidget);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg border border-terminal-border bg-terminal-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-terminal-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-zinc-100">Add widget</div>
            <div className="text-xs text-zinc-500">Drop another panel onto the grid</div>
          </div>
          <button
            type="button"
            onClick={() => setLauncherOpen(false)}
            className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Esc
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addWidget(type)}
              className="rounded border border-terminal-border bg-[#0d1118] px-3 py-3 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5"
            >
              <div className="text-sm font-medium text-zinc-100">{WIDGET_META[type].title}</div>
              <div className="mt-1 text-xs text-zinc-500">{WIDGET_META[type].description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
