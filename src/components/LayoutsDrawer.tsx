import { useMemo, useState } from 'react';
import {
  LAYOUT_TAB_DEFAULT_ID,
  LAYOUT_TAB_PROFILE_ID,
  LAYOUT_TAB_SCALP_ID,
  useTerminalStore,
  WIDGET_META,
} from '../store/useTerminalStore';
import { BUILTIN_TEMPLATES } from '../lib/layoutPresets';
import { fmtTime } from '../lib/format';
import {
  SideDrawer,
  drawerEmpty,
  drawerField,
  drawerGhostBtn,
  drawerPrimaryBtn,
  drawerSectionLabel,
} from './SideDrawer';

type PresetRow = {
  id: string;
  name: string;
  blurb: string;
  kind: 'preset' | 'default';
};

const PRESET_ROWS: PresetRow[] = [
  {
    id: LAYOUT_TAB_SCALP_ID,
    name: 'Scalp',
    blurb: 'Chart + DOM + tape',
    kind: 'preset',
  },
  {
    id: LAYOUT_TAB_PROFILE_ID,
    name: 'Profile',
    blurb: 'Chart + TPO + VPVR + footprint',
    kind: 'preset',
  },
  {
    id: LAYOUT_TAB_DEFAULT_ID,
    name: 'Default',
    blurb: 'Full workspace reset',
    kind: 'default',
  },
];

export function LayoutsDrawer() {
  const open = useTerminalStore((s) => s.openPanel === 'layouts');
  const setOpenPanel = useTerminalStore((s) => s.setOpenPanel);
  const userTemplates = useTerminalStore((s) => s.userTemplates);
  const widgets = useTerminalStore((s) => s.widgets);
  const activeLayoutId = useTerminalStore((s) => s.activeLayoutId);
  const saveTemplate = useTerminalStore((s) => s.saveTemplate);
  const loadTemplate = useTerminalStore((s) => s.loadTemplate);
  const deleteTemplate = useTerminalStore((s) => s.deleteTemplate);
  const applyLayoutTab = useTerminalStore((s) => s.applyLayoutTab);

  const [name, setName] = useState('');

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of widgets) {
      counts.set(w.type, (counts.get(w.type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(
        ([type, n]) =>
          `${WIDGET_META[type as keyof typeof WIDGET_META]?.title ?? type}${n > 1 ? `×${n}` : ''}`,
      )
      .slice(0, 6)
      .join(' · ');
  }, [widgets]);

  const builtinCount = useMemo(() => {
    const map = new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t.widgets.length]));
    return map;
  }, []);

  const onSave = () => {
    if (!name.trim()) return;
    saveTemplate(name);
    setName('');
  };

  const loadBuiltin = (id: string) => {
    applyLayoutTab(id);
    setOpenPanel(null);
  };

  return (
    <SideDrawer
      open={open}
      title="Layouts"
      subtitle={`${widgets.length} panels · matches layout tabs`}
      onClose={() => setOpenPanel(null)}
      closeLabel="Close layouts"
    >
      <div className="space-y-1.5 border-b border-terminal-border px-2.5 py-2">
        <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-terminal-label">
          Save current
        </div>
        <div className="truncate font-mono text-[9px] text-terminal-muted">
          {summary || 'Empty grid'}
        </div>
        <div className="flex gap-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave();
            }}
            maxLength={40}
            placeholder="Name"
            className={`${drawerField} flex-1`}
          />
          <button
            type="button"
            onClick={onSave}
            disabled={!name.trim()}
            className={drawerPrimaryBtn}
          >
            Save
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <section>
          <div className={drawerSectionLabel}>Layout tabs</div>
          <ul className="mx-2 mb-2 flex flex-col gap-0.5 rounded-[2px] bg-terminal-chrome p-0.5">
            {PRESET_ROWS.map((row) => {
              const active = activeLayoutId === row.id;
              const count =
                row.kind === 'preset' ? (builtinCount.get(row.id) ?? 0) : widgets.length;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => loadBuiltin(row.id)}
                    title={
                      row.kind === 'default'
                        ? 'Reset to default workspace'
                        : `Load ${row.name} layout`
                    }
                    className={`flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left transition-colors ${
                      active
                        ? 'bg-white/[0.08] text-zinc-100'
                        : 'text-terminal-muted hover:bg-white/[0.03] hover:text-zinc-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium tracking-wide">{row.name}</span>
                        {active && (
                          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-up">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[9px] text-terminal-label">
                        {row.blurb}
                        {row.kind === 'preset' ? ` · ${count} widgets` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-terminal-label">
                      {row.kind === 'default' ? 'Reset' : 'Load'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="pb-3">
          <div className={drawerSectionLabel}>Saved ({userTemplates.length})</div>
          {userTemplates.length === 0 ? (
            <div className={drawerEmpty}>
              No saved tabs — arrange widgets, then save a name (or use + on the tab bar).
            </div>
          ) : (
            <ul className="mx-2 mb-1 flex flex-col gap-0.5 rounded-[2px] bg-terminal-chrome p-0.5">
              {userTemplates.map((t) => {
                const active = activeLayoutId === t.id;
                return (
                  <li
                    key={t.id}
                    className={`flex items-center gap-1 rounded-[2px] px-1.5 py-1 ${
                      active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        loadTemplate(t.id);
                        setOpenPanel(null);
                      }}
                      className="min-w-0 flex-1 truncate px-0.5 text-left"
                      title={`Load “${t.name}”`}
                    >
                      <div
                        className={`truncate text-[11px] font-medium tracking-wide ${
                          active ? 'text-zinc-100' : 'text-zinc-300'
                        }`}
                      >
                        {t.name}
                        {active && (
                          <span className="ml-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-up">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[9px] text-terminal-label">
                        {t.widgets.length} widgets · {fmtTime(t.createdAt)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        loadTemplate(t.id);
                        setOpenPanel(null);
                      }}
                      className={drawerGhostBtn}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate(t.id)}
                      className={`${drawerGhostBtn} text-down/70 hover:text-down`}
                    >
                      Del
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </SideDrawer>
  );
}
