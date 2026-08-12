/** Footprint visual grading modes — same clusters, different emphasis. */

export type FootprintGradeMode = 'volume' | 'delta' | 'total';

export const FOOTPRINT_GRADE_KEY = 'flow-terminal-footprint-grade-v1';
export const FOOTPRINT_GRADE_EVENT = 'flow-terminal-footprint-grade';

export const FOOTPRINT_GRADE_MODES: {
  id: FootprintGradeMode;
  label: string;
  short: string;
  hint: string;
}[] = [
  { id: 'volume', label: 'Volume', short: 'Vol', hint: 'Heat each side by buy/sell volume' },
  { id: 'delta', label: 'Delta', short: 'Δ', hint: 'Emphasize per-level delta sign & magnitude' },
  { id: 'total', label: 'Total', short: 'Tot', hint: 'Heat both sides by total volume at level' },
];

export function isFootprintGradeMode(v: unknown): v is FootprintGradeMode {
  return v === 'volume' || v === 'delta' || v === 'total';
}

export function loadFootprintGrade(): FootprintGradeMode {
  try {
    const raw = localStorage.getItem(FOOTPRINT_GRADE_KEY);
    if (isFootprintGradeMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'volume';
}

export function persistFootprintGrade(mode: FootprintGradeMode) {
  try {
    localStorage.setItem(FOOTPRINT_GRADE_KEY, mode);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(FOOTPRINT_GRADE_EVENT, { detail: mode }),
    );
  } catch {
    /* ignore */
  }
}

export interface FootprintCellTone {
  buyBg: string;
  sellBg: string;
  imbalance: 'buy' | 'sell' | null;
}

const IMBALANCE_RATIO = 3;

function imbalanceOf(
  buy: number,
  sell: number,
  maxSide: number,
): 'buy' | 'sell' | null {
  if (buy > 0 && sell > 0) {
    if (buy / sell >= IMBALANCE_RATIO) return 'buy';
    if (sell / buy >= IMBALANCE_RATIO) return 'sell';
  } else if (buy > 0 && sell === 0 && buy > maxSide * 0.12) {
    return 'buy';
  } else if (sell > 0 && buy === 0 && sell > maxSide * 0.12) {
    return 'sell';
  }
  return null;
}

/**
 * Coloring / emphasis for a footprint cell under the active grade mode.
 * Cluster data is unchanged — only the visual language shifts.
 */
export function footprintCellTone(
  mode: FootprintGradeMode,
  buy: number,
  sell: number,
  maxSide: number,
  maxAbsDelta: number,
  maxTotal: number,
): FootprintCellTone {
  const imbalance = imbalanceOf(buy, sell, maxSide);
  const delta = buy - sell;
  const total = buy + sell;

  if (mode === 'delta') {
    const mag =
      maxAbsDelta > 0 ? Math.min(1, Math.abs(delta) / maxAbsDelta) : 0;
    const strong = 0.1 + mag * 0.72;
    const weak = 0.04 + mag * 0.08;
    if (delta >= 0) {
      return {
        buyBg: `rgba(14, 203, 129, ${strong})`,
        sellBg: `rgba(246, 70, 93, ${weak})`,
        imbalance,
      };
    }
    return {
      buyBg: `rgba(14, 203, 129, ${weak})`,
      sellBg: `rgba(246, 70, 93, ${strong})`,
      imbalance,
    };
  }

  if (mode === 'total') {
    const tNorm = maxTotal > 0 ? Math.min(1, total / maxTotal) : 0;
    const a = 0.1 + tNorm * 0.62;
    // Keep side identity; intensity follows total at the level.
    const buyShare = total > 0 ? buy / total : 0.5;
    const sellShare = total > 0 ? sell / total : 0.5;
    return {
      buyBg: `rgba(14, 203, 129, ${a * (0.55 + buyShare * 0.45)})`,
      sellBg: `rgba(246, 70, 93, ${a * (0.55 + sellShare * 0.45)})`,
      imbalance,
    };
  }

  // volume (default)
  const buyA = maxSide > 0 ? 0.1 + (buy / maxSide) * 0.62 : 0.06;
  const sellA = maxSide > 0 ? 0.1 + (sell / maxSide) * 0.62 : 0.06;
  return {
    buyBg: `rgba(14, 203, 129, ${buyA})`,
    sellBg: `rgba(246, 70, 93, ${sellA})`,
    imbalance,
  };
}

/** Canvas alphas for chart footprint cells (mirrors footprintCellTone). */
export function footprintCellAlphas(
  mode: FootprintGradeMode,
  buy: number,
  sell: number,
  maxSide: number,
  maxAbsDelta: number,
  maxTotal: number,
): { buyA: number; sellA: number } {
  const delta = buy - sell;
  const total = buy + sell;

  if (mode === 'delta') {
    const mag =
      maxAbsDelta > 0 ? Math.min(1, Math.abs(delta) / maxAbsDelta) : 0;
    const strong = 0.14 + mag * 0.7;
    const weak = 0.06 + mag * 0.08;
    return delta >= 0
      ? { buyA: strong, sellA: weak }
      : { buyA: weak, sellA: strong };
  }

  if (mode === 'total') {
    const tNorm = maxTotal > 0 ? Math.min(1, total / maxTotal) : 0;
    const a = 0.14 + tNorm * 0.62;
    const buyShare = total > 0 ? buy / total : 0.5;
    const sellShare = total > 0 ? sell / total : 0.5;
    return {
      buyA: a * (0.55 + buyShare * 0.45),
      sellA: a * (0.55 + sellShare * 0.45),
    };
  }

  return {
    buyA: maxSide > 0 ? 0.14 + (buy / maxSide) * 0.62 : 0.1,
    sellA: maxSide > 0 ? 0.14 + (sell / maxSide) * 0.62 : 0.1,
  };
}
