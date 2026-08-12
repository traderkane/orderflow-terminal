/** Safe numeric formatters for terminal widgets. */

export function fmtNum(
  n: number | null | undefined,
  decimals = 2,
  opts?: { compact?: boolean },
): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPrice(n: number | null | undefined, decimals = 2): string {
  return fmtNum(n, decimals);
}

export function fmtSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return fmtNum(n, 2, { compact: true });
  if (abs >= 100) return fmtNum(n, 2);
  if (abs >= 1) return fmtNum(n, 3);
  return fmtNum(n, 4);
}

export function fmtPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

export function fmtTime(ms: number, withMs = false): string {
  const d = new Date(ms);
  const base = d.toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  if (!withMs) return base;
  return `${base}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}
