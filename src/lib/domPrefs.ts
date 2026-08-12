/** DOM / order-book ladder preferences (MMT-style). */

export type DomGroupMult = 1 | 2 | 5 | 10;
export type DomSizeUnit = 'coin' | 'usd';
/** center = pin last; auto = recenter when drifted; free = manual scroll only */
export type DomScrollMode = 'center' | 'auto' | 'free';

export const DOM_GROUP_MULTS: DomGroupMult[] = [1, 2, 5, 10];

export const DOM_PREFS_KEY = 'flow-terminal-dom-prefs-v1';

export interface DomPrefs {
  groupMult: DomGroupMult;
  sizeUnit: DomSizeUnit;
  scrollMode: DomScrollMode;
  /** Hide book / session sizes below this; units follow sizeUnit (COIN or USD). */
  minSize: number;
}

const DEFAULTS: DomPrefs = {
  groupMult: 1,
  sizeUnit: 'coin',
  scrollMode: 'center',
  minSize: 0,
};

function isGroupMult(v: unknown): v is DomGroupMult {
  return v === 1 || v === 2 || v === 5 || v === 10;
}

function isSizeUnit(v: unknown): v is DomSizeUnit {
  return v === 'coin' || v === 'usd';
}

function isScrollMode(v: unknown): v is DomScrollMode {
  return v === 'center' || v === 'auto' || v === 'free';
}

function sanitizeMin(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return DEFAULTS.minSize;
  return n;
}

export function loadDomPrefs(): DomPrefs {
  try {
    const raw = localStorage.getItem(DOM_PREFS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<DomPrefs>;
    return {
      groupMult: isGroupMult(parsed.groupMult) ? parsed.groupMult : DEFAULTS.groupMult,
      sizeUnit: isSizeUnit(parsed.sizeUnit) ? parsed.sizeUnit : DEFAULTS.sizeUnit,
      scrollMode: isScrollMode(parsed.scrollMode) ? parsed.scrollMode : DEFAULTS.scrollMode,
      minSize: sanitizeMin(parsed.minSize),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function persistDomPrefs(prefs: DomPrefs) {
  try {
    localStorage.setItem(DOM_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Absolute dust floor so micro sizes never dominate the ladder. */
export function domDustFloor(unit: DomSizeUnit): number {
  return unit === 'usd' ? 1 : 0.001;
}

/** Display size in the active unit (coin qty or notional USD). */
export function domDisplaySize(
  coinSize: number,
  price: number,
  unit: DomSizeUnit,
): number {
  if (!(coinSize > 0)) return 0;
  return unit === 'usd' ? coinSize * price : coinSize;
}
