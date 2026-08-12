import { useTerminalStore, WIDGET_META, LAUNCHABLE_WIDGET_TYPES } from '../store/useTerminalStore';

export function WidgetLauncher() {
  const open = useTerminalStore((s) => s.launcherOpen);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);
  const addWidget = useTerminalStore((s) => s.addWidget);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-10 backdrop-blur-[2px]">
      <div className="w-full max-w-xl overflow-hidden rounded border border-terminal-border bg-terminal-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-terminal-border px-3 py-2.5">
          <div>
            <div className="text-sm font-medium text-zinc-100">Add widget</div>
            <div className="text-[11px] text-terminal-muted">Drop another panel onto the grid</div>
          </div>
          <button
            type="button"
            onClick={() => setLauncherOpen(false)}
            className="rounded border border-terminal-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:border-terminal-border-strong hover:text-zinc-200"
          >
            Esc
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-2.5">
          {LAUNCHABLE_WIDGET_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addWidget(type)}
              className="rounded border border-terminal-border bg-terminal-elevated px-3 py-2.5 text-left transition hover:border-up/35 hover:bg-up/[0.04]"
            >
              <div className="text-[12px] font-medium text-zinc-100">{WIDGET_META[type].title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-terminal-muted">
                {WIDGET_META[type].description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
