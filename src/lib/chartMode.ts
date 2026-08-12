/** Main chart render mode: classic candles vs clustered footprint. */
export type ChartMode = 'candles' | 'footprint';

export const CHART_MODE_KEY = 'flow-terminal-chart-mode-v1';

export function isChartMode(v: unknown): v is ChartMode {
  return v === 'candles' || v === 'footprint';
}

export function loadChartMode(): ChartMode {
  try {
    const raw = localStorage.getItem(CHART_MODE_KEY);
    if (isChartMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'candles';
}

export function persistChartMode(mode: ChartMode) {
  try {
    localStorage.setItem(CHART_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
