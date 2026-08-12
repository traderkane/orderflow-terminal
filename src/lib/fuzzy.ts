/** Tiny subsequence fuzzy matcher for the command palette. */

export interface FuzzyHit<T> {
  item: T;
  score: number;
  /** Matched character indices into `text` (for optional highlight). */
  indices: number[];
}

/**
 * Score how well `query` matches `text` (case-insensitive).
 * Higher is better. Returns null when any query char is missing.
 */
export function fuzzyMatch(
  text: string,
  query: string,
): { score: number; indices: number[] } | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };

  const t = text.toLowerCase();
  let ti = 0;
  let score = 0;
  let consecutive = 0;
  const indices: number[] = [];

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch) {
        found = j;
        break;
      }
    }
    if (found < 0) return null;

    const gap = found - ti;
    consecutive =
      gap === 0 || (indices.length > 0 && found === indices[indices.length - 1]! + 1)
        ? consecutive + 1
        : 1;
    score += 12 + consecutive * 6 - Math.min(gap, 8);
    if (found === 0 || /[\s/_\-.:]/.test(t[found - 1] ?? '')) score += 10;
    indices.push(found);
    ti = found + 1;
  }

  score -= Math.max(0, t.length - q.length) * 0.15;
  return { score, indices };
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
): FuzzyHit<T>[] {
  const q = query.trim();
  if (!q) {
    return items.map((item) => ({ item, score: 0, indices: [] }));
  }

  const hits: FuzzyHit<T>[] = [];
  for (const item of items) {
    const m = fuzzyMatch(getText(item), q);
    if (!m) continue;
    hits.push({ item, score: m.score, indices: m.indices });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}
