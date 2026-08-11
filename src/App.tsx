import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { TerminalGrid } from './components/TerminalGrid';
import { WidgetLauncher } from './components/WidgetLauncher';
import { useTerminalStore } from './store/useTerminalStore';

export default function App() {
  const initFeed = useTerminalStore((s) => s.initFeed);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);

  useEffect(() => initFeed(), [initFeed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLauncherOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLauncherOpen]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-terminal-bg text-zinc-100">
      <TopBar />
      <TerminalGrid />
      <WidgetLauncher />
    </div>
  );
}
