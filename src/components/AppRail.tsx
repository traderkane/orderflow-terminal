import { useEffect, useState, type ReactNode } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';

const THEME_KEY = 'flow-terminal-theme-v1';
type ThemeId = 'dark' | 'light';

function loadTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

type RailId = 'terminal' | 'layouts' | 'alerts' | 'widget' | 'theme';

export function AppRail() {
  const openPanel = useTerminalStore((s) => s.openPanel);
  const setOpenPanel = useTerminalStore((s) => s.setOpenPanel);
  const launcherOpen = useTerminalStore((s) => s.launcherOpen);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);
  const armedAlerts = useTerminalStore(
    (s) => s.alerts.filter((a) => a.enabled && !a.triggered).length,
  );

  const [theme, setTheme] = useState<ThemeId>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const active: RailId =
    launcherOpen ? 'widget' : openPanel === 'layouts' ? 'layouts' : openPanel === 'alerts' ? 'alerts' : 'terminal';

  const focusWorkspace = () => {
    setOpenPanel(null);
    setLauncherOpen(false);
    const el = document.querySelector('.terminal-workspace') as HTMLElement | null;
    el?.focus?.();
  };

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  return (
    <aside
      className="app-rail flex w-10 shrink-0 flex-col items-center border-r border-terminal-border bg-terminal-chrome py-1.5"
      aria-label="App rail"
    >
      <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-[2px] bg-up/15 text-[11px] font-bold leading-none text-up" title="Flow Terminal">
        Φ
      </div>

      <div className="my-1 h-px w-5 bg-terminal-border" />

      <RailButton
        title="Terminal / workspace"
        active={active === 'terminal'}
        onClick={focusWorkspace}
      >
        <IconTerminal />
      </RailButton>

      <RailButton
        title="Layouts"
        active={active === 'layouts'}
        onClick={() => setOpenPanel(openPanel === 'layouts' ? null : 'layouts')}
      >
        <IconLayouts />
      </RailButton>

      <RailButton
        title="Alerts"
        active={active === 'alerts'}
        onClick={() => setOpenPanel(openPanel === 'alerts' ? null : 'alerts')}
        badge={armedAlerts > 0 ? armedAlerts : undefined}
      >
        <IconAlerts />
      </RailButton>

      <div className="my-1 h-px w-5 bg-terminal-border" />

      <RailButton
        title="Add widget"
        active={active === 'widget'}
        accent
        onClick={() => setLauncherOpen(!launcherOpen)}
      >
        <IconPlus />
      </RailButton>

      <div className="mt-auto flex flex-col items-center gap-0.5">
        <RailButton
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          active={theme === 'light'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <IconMoon /> : <IconSun />}
        </RailButton>
      </div>
    </aside>
  );
}

function RailButton({
  title,
  active,
  onClick,
  children,
  badge,
  accent,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: number;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`relative mb-0.5 flex h-8 w-8 items-center justify-center rounded-[2px] transition-colors ${
        active
          ? accent
            ? 'bg-up/15 text-up ring-1 ring-up/35'
            : 'bg-white/[0.06] text-zinc-100 ring-1 ring-white/10'
          : accent
            ? 'text-up/80 hover:bg-up/[0.1] hover:text-up'
            : 'text-terminal-muted hover:bg-white/[0.04] hover:text-zinc-200'
      }`}
    >
      {children}
      {badge != null && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent/25 px-0.5 font-mono text-[8px] font-semibold leading-none text-accent">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function IconTerminal() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <rect x="1.5" y="2" width="12" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M4 5.5l2 1.5L4 8.5M7.5 9.5H11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLayouts() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <rect x="1.5" y="2" width="5.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="8.5" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.25" />
      <rect x="8.5" y="8.5" width="5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function IconAlerts() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path
        d="M7.5 1.75a3.75 3.75 0 00-3.75 3.75v2.1l-.85 1.7a.6.6 0 00.54.9h8.12a.6.6 0 00.54-.9l-.85-1.7V5.5A3.75 3.75 0 007.5 1.75z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M6.2 12.25a1.4 1.4 0 002.6 0" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M7.5 3.5v8M3.5 7.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path
        d="M12.2 9.1A5.25 5.25 0 015.9 2.8 5.4 5.4 0 0012.2 9.1z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <circle cx="7.5" cy="7.5" r="2.4" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M7.5 1.75v1.3M7.5 12v1.25M1.75 7.5h1.3M12 7.5h1.25M3.4 3.4l.9.9M10.7 10.7l.9.9M11.6 3.4l-.9.9M4.3 10.7l-.9.9"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
