import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { LayoutTabs } from './components/LayoutTabs';
import { TerminalGrid } from './components/TerminalGrid';
import { WidgetLauncher } from './components/WidgetLauncher';
import { AlertsDrawer } from './components/AlertsDrawer';
import { LayoutsDrawer } from './components/LayoutsDrawer';
import { ToastStack } from './components/ToastStack';
import { useTerminalStore } from './store/useTerminalStore';

export default function App() {
  const initFeed = useTerminalStore((s) => s.initFeed);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);
  const setOpenPanel = useTerminalStore((s) => s.setOpenPanel);

  useEffect(() => initFeed(), [initFeed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLauncherOpen(false);
        setOpenPanel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLauncherOpen, setOpenPanel]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-terminal-bg text-zinc-200">
      <TopBar />
      <LayoutTabs />
      <TerminalGrid />
      <WidgetLauncher />
      <AlertsDrawer />
      <LayoutsDrawer />
      <ToastStack />
    </div>
  );
}
