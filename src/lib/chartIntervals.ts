/** Chart candle timeframes supported by the TF selector. */
export type ChartInterval = '1m' | '5m' | '15m' | '1h';

export const CHART_INTERVALS: ChartInterval[] = ['1m', '5m', '15m', '1h'];

export const CHART_INTERVAL_KEY = 'flow-terminal-chart-interval-v1';

const SEC: Record<ChartInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
};

export function isChartInterval(v: unknown): v is ChartInterval {
  return v === '1m' || v === '5m' || v === '15m' || v === '1h';
}

export function loadChartInterval(): ChartInterval {
  try {
    const raw = localStorage.getItem(CHART_INTERVAL_KEY);
    if (isChartInterval(raw)) return raw;
  } catch {
    /* ignore */
  }
  return '1m';
}

export function persistChartInterval(interval: ChartInterval) {
  try {
    localStorage.setItem(CHART_INTERVAL_KEY, interval);
  } catch {
    /* ignore */
  }
}

export function intervalToSec(interval: ChartInterval): number {
  return SEC[interval];
}

/** Binance REST/WS interval string (same as ChartInterval). */
export function binanceKlineInterval(interval: ChartInterval): string {
  return interval;
}

/** Bybit linear kline interval minutes. */
export function bybitKlineInterval(interval: ChartInterval): string {
  switch (interval) {
    case '1m':
      return '1';
    case '5m':
      return '5';
    case '15m':
      return '15';
    case '1h':
      return '60';
  }
}

/** OKX candle bar id. */
export function okxKlineBar(interval: ChartInterval): string {
  switch (interval) {
    case '1m':
      return '1m';
    case '5m':
      return '5m';
    case '15m':
      return '15m';
    case '1h':
      return '1H';
  }
}
