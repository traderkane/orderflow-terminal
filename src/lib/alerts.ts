import type { AlertCondition, MarketStats, PriceAlert, SymbolId } from '../types/market';
import { fmtNum, fmtPct, fmtPrice } from './format';

export const ALERT_CONDITIONS: {
  id: AlertCondition;
  label: string;
  group: 'price' | 'funding' | 'oi';
}[] = [
  { id: 'price_above', label: 'Price above', group: 'price' },
  { id: 'price_below', label: 'Price below', group: 'price' },
  { id: 'funding_above', label: 'Funding above', group: 'funding' },
  { id: 'funding_below', label: 'Funding below', group: 'funding' },
  { id: 'oi_above', label: 'OI above', group: 'oi' },
  { id: 'oi_below', label: 'OI below', group: 'oi' },
];

export function conditionLabel(c: AlertCondition): string {
  return ALERT_CONDITIONS.find((x) => x.id === c)?.label ?? c;
}

export function readMetric(stats: MarketStats, condition: AlertCondition): number {
  switch (condition) {
    case 'price_above':
    case 'price_below':
      return stats.last;
    case 'funding_above':
    case 'funding_below':
      return stats.fundingRate;
    case 'oi_above':
    case 'oi_below':
      return stats.openInterest;
  }
}

function isAbove(condition: AlertCondition): boolean {
  return condition.endsWith('_above');
}

/** True when value has crossed the threshold vs previous sample. */
export function crossedThreshold(
  condition: AlertCondition,
  prev: number | null,
  curr: number,
  threshold: number,
): boolean {
  if (!Number.isFinite(curr) || !Number.isFinite(threshold)) return false;
  if (prev == null || !Number.isFinite(prev)) {
    // No prior sample — fire only if already on the wrong side of a tight band
    // would spam; require a real cross.
    return false;
  }
  if (isAbove(condition)) {
    return prev <= threshold && curr > threshold;
  }
  return prev >= threshold && curr < threshold;
}

export function formatThreshold(condition: AlertCondition, n: number): string {
  switch (condition) {
    case 'price_above':
    case 'price_below':
      return fmtPrice(n, 2);
    case 'funding_above':
    case 'funding_below':
      return fmtPct(n * 100, 4);
    case 'oi_above':
    case 'oi_below':
      return fmtNum(n, 0, { compact: true });
  }
}

export function formatMetric(condition: AlertCondition, n: number): string {
  return formatThreshold(condition, n);
}

export function alertMessage(
  alert: Pick<PriceAlert, 'symbol' | 'condition' | 'threshold'>,
  value: number,
): string {
  return `${alert.symbol} ${conditionLabel(alert.condition).toLowerCase()} ${formatThreshold(alert.condition, alert.threshold)} (now ${formatMetric(alert.condition, value)})`;
}

export function notifyBrowser(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: `flow-alert-${Date.now()}` });
  } catch {
    /* ignore */
  }
}

export async function ensureNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function defaultThreshold(symbol: SymbolId, condition: AlertCondition, last?: number): number {
  if (condition.startsWith('price')) {
    const base = last && Number.isFinite(last) ? last : symbol.startsWith('ETH') ? 3500 : 95000;
    return Math.round(base * 100) / 100;
  }
  if (condition.startsWith('funding')) return 0.0001;
  return 50_000;
}
