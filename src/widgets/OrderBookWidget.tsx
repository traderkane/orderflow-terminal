import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { fmtPrice, fmtSize } from '../lib/format';
import {
  DOM_GROUP_MULTS,
  domDisplaySize,
  domDustFloor,
  loadDomPrefs,
  persistDomPrefs,
  type DomGroupMult,
  type DomScrollMode,
  type DomSizeUnit,
} from '../lib/domPrefs';
import type { BookLevel } from '../types/market';

const ROW_H = 15;

type SessionBucket = { buys: number; sells: number };

type LadderRowModel = {
  price: number;
  bidSize: number;
  askSize: number;
  buys: number;
  sells: number;
  delta: number;
  isLast: boolean;
  isMidBand: boolean;
};

export function OrderBookWidget() {
  const book = useTerminalStore((s) => s.feed?.book);
  const trades = useTerminalStore((s) => s.feed?.trades);
  const last = useTerminalStore((s) => s.feed?.stats.last);
  const symbol = useTerminalStore((s) => s.symbol);
  const hoverPrice = useTerminalStore((s) => s.hoverPrice);
  const setHoverPrice = useTerminalStore((s) => s.setHoverPrice);

  const initialPrefs = useMemo(() => loadDomPrefs(), []);
  const [groupMult, setGroupMult] = useState<DomGroupMult>(initialPrefs.groupMult);
  const [sizeUnit, setSizeUnit] = useState<DomSizeUnit>(initialPrefs.sizeUnit);
  const [scrollMode, setScrollMode] = useState<DomScrollMode>(initialPrefs.scrollMode);
  const [minSize, setMinSize] = useState<number>(initialPrefs.minSize);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [visibleRows, setVisibleRows] = useState(28);

  // Session aggressor volume at fine tick keys (re-bucketed on group change).
  const sessionRef = useRef<Map<number, SessionBucket>>(new Map());
  const seenTradeIds = useRef<Set<string>>(new Set());
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const [flash, setFlash] = useState<{
    price: number;
    side: 'buy' | 'sell';
    key: string;
  } | null>(null);
  const lastFlashId = useRef<string | null>(null);

  // Persist prefs
  useEffect(() => {
    persistDomPrefs({ groupMult, sizeUnit, scrollMode, minSize });
  }, [groupMult, sizeUnit, scrollMode, minSize]);

  // Reset session on symbol change
  useEffect(() => {
    sessionRef.current = new Map();
    seenTradeIds.current = new Set();
    setSessionEpoch((e) => e + 1);
  }, [symbol]);

  // Accumulate session trades
  useEffect(() => {
    if (!trades?.length) return;
    let added = false;
    // Process oldest→newest so we don't miss mid-buffer items after trim
    for (let i = trades.length - 1; i >= 0; i--) {
      const t = trades[i]!;
      if (seenTradeIds.current.has(t.id)) continue;
      seenTradeIds.current.add(t.id);
      // Cap seen set
      if (seenTradeIds.current.size > 4000) {
        const keep = trades.map((x) => x.id);
        seenTradeIds.current = new Set(keep);
      }
      const key = t.price;
      const cur = sessionRef.current.get(key) ?? { buys: 0, sells: 0 };
      if (t.side === 'buy') cur.buys += t.size;
      else cur.sells += t.size;
      sessionRef.current.set(key, cur);
      added = true;
    }
    if (added) setSessionEpoch((e) => e + 1);

    const newest = trades[0];
    if (newest && lastFlashId.current !== newest.id) {
      lastFlashId.current = newest.id;
      setFlash({ price: newest.price, side: newest.side, key: newest.id });
    }
  }, [trades]);

  // Fit rows to height
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      const n = Math.max(10, Math.floor(h / ROW_H));
      setVisibleRows(n);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseTick = useMemo(() => {
    if (!book) return 0.5;
    return inferTick(book.bids, book.asks);
  }, [book]);

  const groupSize = useMemo(
    () => roundTick(baseTick * groupMult),
    [baseTick, groupMult],
  );

  const priceDecimals = useMemo(() => decimalsForStep(groupSize), [groupSize]);

  const resetSession = useCallback(() => {
    sessionRef.current = new Map();
    seenTradeIds.current = new Set();
    setSessionEpoch((e) => e + 1);
  }, []);

  const model = useMemo(() => {
    if (!book) return null;
    const mid = book.mid;
    const lastPx = last ?? mid;
    const rows = buildLadder(book, groupSize, sessionRef.current, lastPx, mid);
    if (!rows.length) return null;

    const dustCoin = sizeUnit === 'usd'
      ? Math.max(minSize, domDustFloor('usd')) / Math.max(mid, lastPx, 1)
      : Math.max(minSize, domDustFloor('coin'));
    let maxBook = 1;
    let maxSession = 1;
    for (const r of rows) {
      if (r.bidSize >= dustCoin) maxBook = Math.max(maxBook, r.bidSize);
      if (r.askSize >= dustCoin) maxBook = Math.max(maxBook, r.askSize);
      if (r.buys >= dustCoin) maxSession = Math.max(maxSession, r.buys);
      if (r.sells >= dustCoin) maxSession = Math.max(maxSession, r.sells);
    }

    const askDepth = rows.reduce((s, r) => s + r.askSize, 0);
    const bidDepth = rows.reduce((s, r) => s + r.bidSize, 0);
    const depthSum = askDepth + bidDepth || 1;
    const bidPct = (bidDepth / depthSum) * 100;

    return { rows, maxBook, maxSession, askDepth, bidDepth, bidPct, lastPx, mid };
    // sessionEpoch intentionally triggers rebuild when session map mutates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, last, groupSize, sessionEpoch, minSize, sizeUnit]);

  // Center / auto-recenter scroll
  const centerOnLast = useCallback(() => {
    const el = bodyRef.current;
    if (!el || !model) return;
    const idx = model.rows.findIndex((r) => r.isLast);
    if (idx < 0) return;
    const topPad = Math.max(0, (visibleRows / 2) * ROW_H);
    const rowTop = topPad + idx * ROW_H;
    const target = rowTop - el.clientHeight / 2 + ROW_H / 2;
    el.scrollTop = Math.max(0, target);
  }, [model, visibleRows]);

  useLayoutEffect(() => {
    if (!model || !bodyRef.current) return;
    if (scrollMode === 'center') {
      centerOnLast();
      return;
    }
    if (scrollMode === 'auto') {
      const el = bodyRef.current;
      const idx = model.rows.findIndex((r) => r.isLast);
      if (idx < 0) return;
      const topPad = Math.max(0, (visibleRows / 2) * ROW_H);
      const rowTop = topPad + idx * ROW_H;
      const viewTop = el.scrollTop;
      const viewBottom = viewTop + el.clientHeight;
      const midY = viewTop + el.clientHeight / 2;
      const band = el.clientHeight * 0.22;
      const lastCenter = rowTop + ROW_H / 2;
      const offScreen = rowTop < viewTop || rowTop + ROW_H > viewBottom;
      const drifted = Math.abs(lastCenter - midY) > band;
      if (offScreen || drifted) centerOnLast();
    }
  }, [model?.lastPx, model?.rows.length, scrollMode, centerOnLast, model, visibleRows]);

  // Initial center when book first arrives
  useEffect(() => {
    if (model && scrollMode !== 'free') {
      requestAnimationFrame(() => centerOnLast());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!model]);

  if (!book || !model) {
    return (
      <div className="p-2 font-mono text-[11px] text-terminal-muted">Waiting for book…</div>
    );
  }

  const { rows, maxBook, maxSession, bidPct, bidDepth, askDepth, lastPx, mid } = model;
  const spreadPct = mid > 0 ? (book.spread / mid) * 100 : 0;

  const syncPrice = (() => {
    if (hoverPrice == null) return null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (const r of rows) {
      const d = Math.abs(r.price - hoverPrice);
      if (d < bestDist) {
        bestDist = d;
        best = r.price;
      }
    }
    return best;
  })();

  const onRowEnter = (price: number) => setHoverPrice(price, 'dom');
  const onBookLeave = () => {
    const src = useTerminalStore.getState().hoverSource;
    if (src === 'dom') setHoverPrice(null, null);
  };

  const sizeFloor = Math.max(minSize, domDustFloor(sizeUnit));
  const displaySize = (coinSize: number, px: number) => {
    const disp = domDisplaySize(coinSize, px, sizeUnit);
    if (!(disp > 0) || disp < sizeFloor) return '';
    return fmtSize(disp);
  };
  const passSize = (coinSize: number, px: number) =>
    domDisplaySize(coinSize, px, sizeUnit) >= sizeFloor;

  return (
    <div
      className="dom-widget flex h-full flex-col font-mono text-[10px] leading-none"
      onMouseLeave={onBookLeave}
    >
      {/* Toolbar — nowrap + x-scroll so RESET stays reachable at ~1040px */}
      <div className="dom-toolbar flex shrink-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-terminal-border/80 px-1 py-0.5">
        <div className="dom-seg" role="group" aria-label="Price grouping">
          {DOM_GROUP_MULTS.map((m) => (
            <button
              key={m}
              type="button"
              className="dom-seg-btn"
              data-active={groupMult === m ? 'true' : 'false'}
              title={`Group ${m}× tick (${fmtPrice(baseTick * m, decimalsForStep(baseTick * m))})`}
              onClick={() => setGroupMult(m)}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="dom-seg" role="group" aria-label="Size unit">
          <button
            type="button"
            className="dom-seg-btn"
            data-active={sizeUnit === 'usd' ? 'true' : 'false'}
            onClick={() => setSizeUnit('usd')}
          >
            USD
          </button>
          <button
            type="button"
            className="dom-seg-btn"
            data-active={sizeUnit === 'coin' ? 'true' : 'false'}
            onClick={() => setSizeUnit('coin')}
          >
            COIN
          </button>
        </div>

        <div className="dom-seg" role="group" aria-label="Scroll mode">
          {(
            [
              ['center', 'Center'],
              ['auto', 'Auto'],
              ['free', 'Free'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className="dom-seg-btn"
              data-active={scrollMode === mode ? 'true' : 'false'}
              title={
                mode === 'center'
                  ? 'Pin last price to vertical center'
                  : mode === 'auto'
                    ? 'Recenter when last drifts off-center'
                    : 'Manual scroll only'
              }
              onClick={() => {
                setScrollMode(mode);
                if (mode !== 'free') requestAnimationFrame(() => centerOnLast());
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label
          className="tape-min flex shrink-0 items-center gap-1 rounded-[2px] border border-white/[0.06] bg-[#0c0f14] px-1 py-0.5"
          title={`Hide book/session sizes below this ${sizeUnit === 'usd' ? 'USD' : 'coin'} threshold`}
        >
          <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-zinc-600">
            Min
          </span>
          <input
            type="number"
            min={0}
            step={sizeUnit === 'usd' ? 10 : 0.01}
            value={minSize > 0 ? minSize : ''}
            placeholder="0"
            className="tape-min-input w-11 bg-transparent text-right font-mono text-[9px] tabular-nums text-zinc-300 outline-none placeholder:text-zinc-700"
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                setMinSize(0);
                return;
              }
              const n = Number(v);
              if (Number.isFinite(n) && n >= 0) setMinSize(n);
            }}
          />
        </label>

        <button
          type="button"
          className="dom-reset-btn ml-auto shrink-0"
          title="Clear session Buys / Sells / Delta"
          onClick={resetSession}
        >
          Reset
        </button>
      </div>

      {/* Imbalance */}
      <div className="shrink-0 border-b border-terminal-border/80 px-1.5 py-0.5">
        <div className="mb-0.5 flex items-center justify-between text-[9px] uppercase tracking-[0.12em] text-terminal-label">
          <span className="text-up">Bid {displaySize(bidDepth, mid) || fmtSize(bidDepth)}</span>
          <span className="normal-case tracking-normal text-zinc-600">
            Last{' '}
            <span
              className={`tabular-nums font-semibold ${lastPx >= mid ? 'text-up' : 'text-down'}`}
            >
              {fmtPrice(lastPx, priceDecimals)}
            </span>
            <span className="mx-1 text-zinc-700">·</span>
            Spr {fmtPrice(book.spread, book.spread < 1 ? 2 : priceDecimals)}
            <span className="ml-1 text-zinc-700">{spreadPct.toFixed(3)}%</span>
          </span>
          <span className="text-down">Ask {displaySize(askDepth, mid) || fmtSize(askDepth)}</span>
        </div>
        <div className="flex h-[4px] overflow-hidden rounded-[1px] bg-[#12161e]">
          <div className="bg-up/70 transition-[width] duration-150" style={{ width: `${bidPct}%` }} />
          <div
            className="bg-down/70 transition-[width] duration-150"
            style={{ width: `${100 - bidPct}%` }}
          />
        </div>
      </div>

      {/* Ladder scrolls both axes; min-width keeps Δ usable when panel is narrow */}
      <div
        ref={bodyRef}
        className="dom-ladder min-h-0 flex-1 overflow-auto"
      >
        <div className="dom-ladder-inner min-w-[300px]">
          <div className="dom-colhead sticky top-0 z-[1] grid shrink-0 grid-cols-[minmax(34px,0.85fr)_minmax(42px,0.95fr)_minmax(52px,1.15fr)_minmax(42px,0.95fr)_minmax(34px,0.85fr)_minmax(40px,0.75fr)] px-1 py-0.5 text-[9px] uppercase tracking-[0.1em] text-terminal-label">
            <span className="text-right">Buys</span>
            <span className="text-right">Bid</span>
            <span className="text-center">Price</span>
            <span className="text-left">Ask</span>
            <span className="text-left">Sells</span>
            <span className="text-right">Δ</span>
          </div>
          <div style={{ height: Math.max(0, (visibleRows / 2) * ROW_H) }} aria-hidden />
          {rows.map((row) => {
            const hit =
              flash && approxEq(flash.price, row.price, groupSize)
                ? { side: flash.side, key: flash.key }
                : null;
            const synced =
              syncPrice != null && approxEq(syncPrice, row.price, groupSize);
            return (
              <DomRow
                key={hit ? `${row.price}-${hit.key}` : String(row.price)}
                row={row}
                maxBook={maxBook}
                maxSession={maxSession}
                decimals={priceDecimals}
                displaySize={displaySize}
                passSize={passSize}
                flash={hit}
                synced={synced}
                onHoverPrice={onRowEnter}
              />
            );
          })}
          {/* Spacer so center mode can pin edge prices */}
          <div style={{ height: Math.max(0, (visibleRows / 2) * ROW_H) }} aria-hidden />
        </div>
      </div>
    </div>
  );
}

function DomRow({
  row,
  maxBook,
  maxSession,
  decimals,
  displaySize,
  passSize,
  flash,
  synced,
  onHoverPrice,
}: {
  row: LadderRowModel;
  maxBook: number;
  maxSession: number;
  decimals: number;
  displaySize: (coin: number, px: number) => string;
  passSize: (coin: number, px: number) => boolean;
  flash: { side: 'buy' | 'sell'; key: string } | null;
  synced: boolean;
  onHoverPrice: (price: number) => void;
}) {
  const showBid = passSize(row.bidSize, row.price);
  const showAsk = passSize(row.askSize, row.price);
  const showBuys = passSize(row.buys, row.price);
  const showSells = passSize(row.sells, row.price);
  const bidHeat = showBid ? heatAlpha(row.bidSize, maxBook) : 0;
  const askHeat = showAsk ? heatAlpha(row.askSize, maxBook) : 0;
  const buyHeat = showBuys ? heatAlpha(row.buys, maxSession, 0.08, 0.5) : 0;
  const sellHeat = showSells ? heatAlpha(row.sells, maxSession, 0.08, 0.5) : 0;

  const flashClass =
    flash == null ? '' : flash.side === 'buy' ? 'dom-flash-buy' : 'dom-flash-sell';
  const syncClass = synced ? 'dom-row-sync' : '';
  const lastClass = row.isLast ? 'dom-row-last' : '';

  const delta = row.delta;
  const deltaCls =
    delta > 0 ? 'text-up' : delta < 0 ? 'text-down' : 'text-zinc-600';

  return (
    <div
      className={`dom-row relative grid grid-cols-[minmax(34px,0.85fr)_minmax(42px,0.95fr)_minmax(52px,1.15fr)_minmax(42px,0.95fr)_minmax(34px,0.85fr)_minmax(40px,0.75fr)] items-center px-1 ${flashClass} ${syncClass} ${lastClass}`}
      style={{ height: ROW_H }}
      onMouseEnter={() => onHoverPrice(row.price)}
    >
      {/* Session buy heat (left of bid) */}
      <div
        className="relative flex h-full items-center justify-end"
        style={{ background: showBuys ? `rgba(14,203,129,${buyHeat})` : undefined }}
      >
        <span className="relative tabular-nums text-[9px] text-up/90">
          {showBuys ? displaySize(row.buys, row.price) : ''}
        </span>
      </div>

      {/* Bid size */}
      <div
        className="relative flex h-full items-center justify-end"
        style={{
          background:
            showBid
              ? `linear-gradient(to left, rgba(14,203,129,${bidHeat}) ${Math.min(100, (row.bidSize / maxBook) * 100)}%, transparent ${Math.min(100, (row.bidSize / maxBook) * 100)}%)`
              : undefined,
        }}
      >
        <span className="relative tabular-nums text-zinc-100">
          {showBid ? displaySize(row.bidSize, row.price) : ''}
        </span>
      </div>

      {/* Price */}
      <div className="relative flex h-full items-center justify-center">
        <span
          className={`tabular-nums text-[10px] font-medium ${
            row.isLast
              ? 'text-accent'
              : row.bidSize > 0 && row.askSize === 0
                ? 'text-up'
                : row.askSize > 0 && row.bidSize === 0
                  ? 'text-down'
                  : 'text-zinc-200'
          }`}
        >
          {fmtPrice(row.price, decimals)}
        </span>
      </div>

      {/* Ask size */}
      <div
        className="relative flex h-full items-center justify-start"
        style={{
          background:
            showAsk
              ? `linear-gradient(to right, rgba(246,70,93,${askHeat}) ${Math.min(100, (row.askSize / maxBook) * 100)}%, transparent ${Math.min(100, (row.askSize / maxBook) * 100)}%)`
              : undefined,
        }}
      >
        <span className="relative tabular-nums text-zinc-100">
          {showAsk ? displaySize(row.askSize, row.price) : ''}
        </span>
      </div>

      {/* Session sell heat */}
      <div
        className="relative flex h-full items-center justify-start"
        style={{ background: showSells ? `rgba(246,70,93,${sellHeat})` : undefined }}
      >
        <span className="relative tabular-nums text-[9px] text-down/90">
          {showSells ? displaySize(row.sells, row.price) : ''}
        </span>
      </div>

      {/* Delta */}
      <div className="relative flex h-full items-center justify-end">
        <span className={`tabular-nums text-[9px] ${deltaCls}`}>
          {delta === 0 || !passSize(Math.abs(delta), row.price)
            ? ''
            : `${delta > 0 ? '+' : '−'}${displaySize(Math.abs(delta), row.price)}`}
        </span>
      </div>
    </div>
  );
}

function buildLadder(
  book: { bids: BookLevel[]; asks: BookLevel[]; mid: number },
  groupSize: number,
  session: Map<number, SessionBucket>,
  lastPx: number,
  mid: number,
): LadderRowModel[] {
  const bidMap = new Map<number, number>();
  const askMap = new Map<number, number>();

  for (const lvl of book.bids) {
    if (!(lvl.size > 0)) continue;
    const key = bucketPrice(lvl.price, groupSize);
    bidMap.set(key, (bidMap.get(key) ?? 0) + lvl.size);
  }
  for (const lvl of book.asks) {
    if (!(lvl.size > 0)) continue;
    const key = bucketPrice(lvl.price, groupSize);
    askMap.set(key, (askMap.get(key) ?? 0) + lvl.size);
  }

  const sessionBuys = new Map<number, number>();
  const sessionSells = new Map<number, number>();
  for (const [px, v] of session) {
    const key = bucketPrice(px, groupSize);
    if (v.buys) sessionBuys.set(key, (sessionBuys.get(key) ?? 0) + v.buys);
    if (v.sells) sessionSells.set(key, (sessionSells.get(key) ?? 0) + v.sells);
  }

  const prices = new Set<number>([
    ...bidMap.keys(),
    ...askMap.keys(),
    ...sessionBuys.keys(),
    ...sessionSells.keys(),
  ]);

  if (!prices.size) {
    // Fallback: synthesize a few levels around mid
    const center = bucketPrice(lastPx || mid, groupSize);
    for (let i = -12; i <= 12; i++) {
      prices.add(roundTick(center + i * groupSize));
    }
  } else {
    // Fill gaps for a continuous ladder
    const sorted = [...prices].sort((a, b) => a - b);
    const lo = sorted[0]!;
    const hi = sorted[sorted.length - 1]!;
    const maxSteps = 200;
    const steps = Math.round((hi - lo) / groupSize);
    if (steps > 0 && steps <= maxSteps) {
      for (let p = lo; p <= hi + groupSize * 0.25; p = roundTick(p + groupSize)) {
        prices.add(bucketPrice(p, groupSize));
      }
    }
  }

  // Ensure last/mid buckets exist
  prices.add(bucketPrice(lastPx || mid, groupSize));
  prices.add(bucketPrice(mid, groupSize));

  const lastBucket = bucketPrice(lastPx || mid, groupSize);
  const midBucket = bucketPrice(mid, groupSize);

  return [...prices]
    .sort((a, b) => b - a)
    .map((price) => {
      const buys = sessionBuys.get(price) ?? 0;
      const sells = sessionSells.get(price) ?? 0;
      return {
        price,
        bidSize: bidMap.get(price) ?? 0,
        askSize: askMap.get(price) ?? 0,
        buys,
        sells,
        delta: buys - sells,
        isLast: approxEq(price, lastBucket, groupSize * 0.51),
        isMidBand: approxEq(price, midBucket, groupSize * 0.51),
      };
    });
}

function heatAlpha(
  size: number,
  max: number,
  minA = 0.12,
  maxA = 0.62,
): number {
  if (!(size > 0) || !(max > 0)) return 0;
  const t = Math.sqrt(size / max);
  return minA + Math.min(1, t) * (maxA - minA);
}

function inferTick(bids: BookLevel[], asks: BookLevel[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(bids.length, 8); i++) {
    const d = Math.abs(bids[i - 1]!.price - bids[i]!.price);
    if (d > 0) gaps.push(d);
  }
  for (let i = 1; i < Math.min(asks.length, 8); i++) {
    const d = Math.abs(asks[i]!.price - asks[i - 1]!.price);
    if (d > 0) gaps.push(d);
  }
  if (!gaps.length) return 0.5;
  gaps.sort((a, b) => a - b);
  return gaps[0]!;
}

function roundTick(n: number): number {
  return +n.toFixed(8);
}

function bucketPrice(price: number, groupSize: number): number {
  if (!(groupSize > 0)) return roundTick(price);
  return roundTick(Math.round(price / groupSize) * groupSize);
}

function decimalsForStep(step: number): number {
  if (!(step > 0)) return 2;
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  if (step >= 0.01) return 2;
  if (step >= 0.001) return 3;
  return 4;
}

function approxEq(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= Math.max(tol, 1e-8);
}

