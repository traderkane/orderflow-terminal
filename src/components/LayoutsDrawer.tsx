import { useMemo, useState } from 'react';
import { useTerminalStore, WIDGET_META } from '../store/useTerminalStore';
import { BUILTIN_TEMPLATES } from '../lib/layoutPresets';
import { fmtTime } from '../lib/format';

export function LayoutsDrawer() {
  const open = useTerminalStore((s) => s.openPanel === 'layouts');
  const setOpenPanel = useTerminalStore((s) => s.setOpenPanel);
  const userTemplates = useTerminalStore((s) => s.userTemplates);
  const widgets = useTerminalStore((s) => s.widgets);
  const saveTemplate = useTerminalStore((s) => s.saveTemplate);
  const loadTemplate = useTerminalStore((s) => s.loadTemplate);
  const deleteTemplate = useTerminalStore((s) => s.deleteTemplate);
  const resetLayout = useTerminalStore((s) => s.resetLayout);

  const [name, setName] = useState('');

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of widgets) {
      counts.set(w.type, (counts.get(w.type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([type, n]) => `${WIDGET_META[type as keyof typeof WIDGET_META]?.title ?? type}${n > 1 ? `×${n}` : ''}`)
      .slice(0, 6)
      .join(' · ');
  }, [widgets]);

  if (!open) return null;

  const onSave = () => {
    if (!name.trim()) return;
    saveTemplate(name);
    setName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[1px]">
      <button
        type="button"
        className="h-full flex-1 cursor-default"
        aria-label="Close layouts"
        onClick={() => setOpenPanel(null)}
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-terminal-border bg-terminal-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-terminal-border px-3 py-2.5">
          <div>
            <div className="text-sm font-medium text-zinc-100">Layouts</div>
            <div className="text-[11px] text-terminal-muted">
              Save / load widget templates · {widgets.length} panels now
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenPanel(null)}
            className="rounded border border-terminal-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:border-terminal-border-strong hover:text-zinc-200"
          >
            Esc
          </button>
        </div>

        <div className="space-y-2 border-b border-terminal-border p-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
            Save current
          </div>
          <div className="truncate text-[10px] text-terminal-muted">{summary || 'Empty grid'}</div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
              }}
              maxLength={40}
              placeholder="Template name"
              className="h-7 min-w-0 flex-1 rounded-[2px] border border-terminal-border bg-terminal-elevated px-2 text-[11px] text-zinc-100 outline-none focus:border-up/40"
            />
            <button
              type="button"
              onClick={onSave}
              disabled={!name.trim()}
              className="h-7 rounded-[2px] border border-up/30 bg-up/[0.1] px-3 text-[10px] font-medium uppercase tracking-wider text-up enabled:hover:bg-up/20 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <section className="border-b border-terminal-border p-3">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
              Built-in presets
            </div>
            <ul className="space-y-1.5">
              {BUILTIN_TEMPLATES.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium text-zinc-100">{t.name}</span>
                      <span className="rounded bg-up/10 px-1 py-px text-[9px] uppercase tracking-wider text-up">
                        Preset
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-terminal-muted">
                      {t.id === 'builtin-scalp'
                        ? 'Chart + DOM + tape heavy'
                        : 'Chart + TPO + VPVR + footprint'}
                      {' · '}
                      {t.widgets.length} widgets
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      loadTemplate(t.id);
                      setOpenPanel(null);
                    }}
                    className="h-7 shrink-0 rounded-[2px] border border-up/25 bg-up/[0.08] px-2.5 text-[10px] font-medium uppercase tracking-wider text-up hover:bg-up/15"
                  >
                    Load
                  </button>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2 rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2">
                <div>
                  <div className="text-[12px] font-medium text-zinc-100">Default</div>
                  <div className="mt-0.5 text-[10px] text-terminal-muted">
                    Full workspace reset
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetLayout();
                    setOpenPanel(null);
                  }}
                  className="h-7 shrink-0 rounded-[2px] border border-terminal-border px-2.5 text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
                >
                  Reset
                </button>
              </li>
            </ul>
          </section>

          <section className="p-3">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
              Saved ({userTemplates.length})
            </div>
            {userTemplates.length === 0 ? (
              <div className="rounded border border-dashed border-terminal-border px-3 py-4 text-center text-[11px] text-terminal-muted">
                No saved templates — arrange widgets, then save a name.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {userTemplates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-zinc-100">{t.name}</div>
                      <div className="mt-0.5 font-mono text-[9px] text-terminal-label">
                        {t.widgets.length} widgets · {fmtTime(t.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          loadTemplate(t.id);
                          setOpenPanel(null);
                        }}
                        className="h-7 rounded-[2px] border border-up/25 bg-up/[0.08] px-2 text-[10px] font-medium uppercase tracking-wider text-up hover:bg-up/15"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(t.id)}
                        className="h-7 rounded-[2px] border border-terminal-border px-2 text-[10px] uppercase tracking-wider text-down/80 hover:bg-down/10 hover:text-down"
                      >
                        Del
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
