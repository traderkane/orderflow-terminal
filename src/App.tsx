import { useEffect } from 'react';
import { AppRail } from './components/AppRail';
import { TopBar } from './components/TopBar';
import { LayoutTabs } from './components/LayoutTabs';
import { WatchlistStrip } from './components/WatchlistStrip';
import { TerminalGrid } from './components/TerminalGrid';
import { WidgetLauncher } from './components/WidgetLauncher';
import { AlertsDrawer } from './components/AlertsDrawer';
import { LayoutsDrawer } from './components/LayoutsDrawer';
import { CommandPalette } from './components/CommandPalette';
import { ToastStack } from './components/ToastStack';
import { useTerminalStore } from './store/useTerminalStore';

export default function App() {
  const initFeed = useTerminalStore((s) => s.initFeed);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);
  const setOpenPanel = useTerminalStore((s) => s.setOpenPanel);
  const setCommandPaletteOpen = useTerminalStore((s) => s.setCommandPaletteOpen);
  const setChartMaximized = useTerminalStore((s) => s.setChartMaximized);

  useEffect(() => initFeed(), [initFeed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen(!useTerminalStore.getState().commandPaletteOpen);
        return;
      }
      if (e.key !== 'Escape') return;

      // Chart drawing tools/selection clear first (ChartWidget capture handler).
      // Then: palette → unmaximize → drawers/launcher.
      const state = useTerminalStore.getState();
      if (state.commandPaletteOpen) {
        setCommandPaletteOpen(false);
        return;
      }
      if (state.chartMaximized) {
        e.preventDefault();
        setChartMaximized(false);
        return;
      }
      setLauncherOpen(false);
      setOpenPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLauncherOpen, setOpenPanel, setCommandPaletteOpen, setChartMaximized]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-terminal-bg text-[color:inherit]">
      <AppRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <WatchlistStrip />
        <LayoutTabs />
        <TerminalGrid />
      </div>
      <WidgetLauncher />
      <AlertsDrawer />
      <LayoutsDrawer />
      <CommandPalette />
      <ToastStack />
    </div>
  );
}
