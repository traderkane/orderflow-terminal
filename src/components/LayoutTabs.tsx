import { useMemo, useState } from 'react';
import {
  LAYOUT_TAB_DEFAULT_ID,
  LAYOUT_TAB_PROFILE_ID,
  LAYOUT_TAB_SCALP_ID,
  useTerminalStore,
} from '../store/useTerminalStore';

type Tab = { id: string; name: string; builtin?: boolean };

const BUILTIN_TABS: Tab[] = [
  { id: LAYOUT_TAB_SCALP_ID, name: 'Scalp', builtin: true },
  { id: LAYOUT_TAB_PROFILE_ID, name: 'Profile', builtin: true },
  { id: LAYOUT_TAB_DEFAULT_ID, name: 'Default', builtin: true },
];

export function LayoutTabs() {
  const activeLayoutId = useTerminalStore((s) => s.activeLayoutId);
  const userTemplates = useTerminalStore((s) => s.userTemplates);
  const applyLayoutTab = useTerminalStore((s) => s.applyLayoutTab);
  const saveTemplate = useTerminalStore((s) => s.saveTemplate);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const tabs = useMemo<Tab[]>(
    () => [
      ...BUILTIN_TABS,
      ...userTemplates.map((t) => ({ id: t.id, name: t.name, builtin: false })),
    ],
    [userTemplates],
  );

  const onSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveTemplate(trimmed);
    setName('');
    setAdding(false);
  };

  return (
    <div className="layout-tabs flex h-6 shrink-0 items-center gap-0.5 border-b border-terminal-border bg-terminal-chrome px-2">
      <div className="mr-1 hidden font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-terminal-label sm:block">
        Layout
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const active = activeLayoutId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => applyLayoutTab(tab.id)}
              title={tab.builtin ? `${tab.name} layout` : `Load “${tab.name}”`}
              className={`h-5 max-w-[9rem] shrink-0 truncate rounded-[2px] px-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                active
                  ? 'bg-white/[0.08] text-zinc-100'
                  : 'text-terminal-muted hover:bg-white/[0.03] hover:text-zinc-300'
              }`}
            >
              {tab.name}
            </button>
          );
        })}

        {adding ? (
          <div className="ml-0.5 flex h-5 items-center gap-0.5">
            <input
              type="text"
              value={name}
              autoFocus
              maxLength={40}
              placeholder="Name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setName('');
                }
              }}
              className="h-5 w-24 rounded-[2px] border border-terminal-border bg-terminal-elevated px-1.5 font-mono text-[10px] text-zinc-100 outline-none focus:border-up/35"
            />
            <button
              type="button"
              onClick={onSave}
              disabled={!name.trim()}
              className="h-5 rounded-[2px] bg-up/15 px-1.5 text-[9px] font-medium uppercase tracking-wider text-up enabled:hover:bg-up/25 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setName('');
              }}
              className="h-5 rounded-[2px] px-1 text-[9px] uppercase tracking-wider text-terminal-muted hover:text-zinc-300"
            >
              Esc
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="Save current layout as a new tab"
            className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] text-[12px] leading-none text-terminal-muted transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
