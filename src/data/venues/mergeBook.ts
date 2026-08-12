import type { BookLevel, OrderBook } from '../../types/market';
import type { VenueDepth, VenueLevel } from './types';

const BOOK_LEVELS = 22;

function accumulate(
  sides: VenueLevel[][],
  descending: boolean,
): BookLevel[] {
  const map = new Map<number, number>();
  for (const levels of sides) {
    for (const { price, size } of levels) {
      if (!(price > 0) || !(size > 0)) continue;
      map.set(price, (map.get(price) ?? 0) + size);
    }
  }
  const prices = [...map.keys()].sort((a, b) => (descending ? b - a : a - b));
  const out: BookLevel[] = [];
  let total = 0;
  for (const price of prices) {
    const size = map.get(price)!;
    total += size;
    out.push({ price, size, total });
    if (out.length >= BOOK_LEVELS) break;
  }
  return out;
}

/** Merge per-venue depth books by summing size at identical prices. */
export function mergeVenueBooks(
  depths: Iterable<VenueDepth>,
  fallbackMid = 0,
): { book: OrderBook; depthBids: VenueLevel[]; depthAsks: VenueLevel[] } {
  const list = [...depths];
  const bids = accumulate(
    list.map((d) => d.bids),
    true,
  );
  const asks = accumulate(
    list.map((d) => d.asks),
    false,
  );

  // Full depth (uncapped) for heatmap
  const bidMap = new Map<number, number>();
  const askMap = new Map<number, number>();
  for (const d of list) {
    for (const b of d.bids) {
      if (b.size > 0) bidMap.set(b.price, (bidMap.get(b.price) ?? 0) + b.size);
    }
    for (const a of d.asks) {
      if (a.size > 0) askMap.set(a.price, (askMap.get(a.price) ?? 0) + a.size);
    }
  }
  const depthBids = [...bidMap.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => b.price - a.price);
  const depthAsks = [...askMap.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => a.price - b.price);

  const bestBid = bids[0]?.price ?? depthBids[0]?.price ?? fallbackMid;
  const bestAsk = asks[0]?.price ?? depthAsks[0]?.price ?? fallbackMid;
  const mid =
    bestBid && bestAsk ? (bestBid + bestAsk) / 2 : fallbackMid || bestBid || bestAsk;

  return {
    book: {
      bids,
      asks,
      spread: bestBid && bestAsk ? Math.max(0, bestAsk - bestBid) : 0,
      mid,
    },
    depthBids,
    depthAsks,
  };
}
