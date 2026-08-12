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
    <div className="layout-tabs flex h-5 shrink-0 items-center gap-0.5 border-b border-terminal-border bg-terminal-chrome px-1.5">
      <div className="mr-1 hidden font-mono text-[8px] font-medium uppercase tracking-[0.1em] text-terminal-label sm:block">
        Layout
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-px overflow-x-auto">
        {tabs.map((tab) => {
          const active = activeLayoutId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => applyLayoutTab(tab.id)}
              title={tab.builtin ? `${tab.name} layout` : `Load “${tab.name}”`}
              data-active={active ? 'true' : 'false'}
              className="layout-tab h-full max-w-[8.5rem] shrink-0 truncate px-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] transition-colors"
            >
              {tab.name}
            </button>
          );
        })}

        {adding ? (
          <div className="ml-0.5 flex h-4 items-center gap-0.5">
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
              className="chrome-input h-4 w-24 rounded-[2px] border border-terminal-border bg-terminal-elevated px-1 font-mono text-[10px] text-[color:inherit] outline-none"
            />
            <button
              type="button"
              onClick={onSave}
              disabled={!name.trim()}
              className="h-4 rounded-[2px] bg-accent/15 px-1.5 text-[8px] font-medium uppercase tracking-wider text-accent enabled:hover:bg-accent/25 disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setName('');
              }}
              className="h-4 rounded-[2px] px-1 text-[8px] uppercase tracking-wider text-terminal-muted hover:text-[color:inherit]"
            >
              Esc
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="Save current layout as a new tab"
            className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] text-[11px] leading-none text-terminal-muted transition-colors hover:bg-white/[0.04] hover:text-[color:inherit]"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
