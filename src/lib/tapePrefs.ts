/** Trades tape preferences (MMT-style Tape v1.5). */

export type TapeSizeUnit = 'coin' | 'usd';

export const TAPE_PREFS_KEY = 'flow-terminal-tape-prefs-v1';

export interface TapePrefs {
  sizeUnit: TapeSizeUnit;
  /** Hide trades below this threshold; units follow sizeUnit (COIN or USD). */
  minSize: number;
}

const DEFAULTS: TapePrefs = {
  sizeUnit: 'coin',
  minSize: 0,
};

function isSizeUnit(v: unknown): v is TapeSizeUnit {
  return v === 'coin' || v === 'usd';
}

function sanitizeMin(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return DEFAULTS.minSize;
  return n;
}

export function loadTapePrefs(): TapePrefs {
  try {
    const raw = localStorage.getItem(TAPE_PREFS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<TapePrefs>;
    return {
      sizeUnit: isSizeUnit(parsed.sizeUnit) ? parsed.sizeUnit : DEFAULTS.sizeUnit,
      minSize: sanitizeMin(parsed.minSize),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function persistTapePrefs(prefs: TapePrefs) {
  try {
    localStorage.setItem(TAPE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Display size in the active unit (coin qty or notional USD). */
export function tapeDisplaySize(
  coinSize: number,
  price: number,
  unit: TapeSizeUnit,
): number {
  if (!(coinSize > 0)) return 0;
  return unit === 'usd' ? coinSize * price : coinSize;
}

/** Big / huge highlight thresholds in the active unit. */
export function tapeSizeTiers(unit: TapeSizeUnit): { big: number; huge: number } {
  return unit === 'usd' ? { big: 10_000, huge: 50_000 } : { big: 2, huge: 8 };
}
