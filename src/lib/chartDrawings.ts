/** Chart drawing tools — types, persistence, hit-test, canvas render. */

import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { SymbolId } from '../types/market';

export const DRAWINGS_STORAGE_KEY = 'flow-terminal-drawings-v1';

/** null / 'select' = cursor mode; eraser deletes on click. */
export type DrawingTool = 'select' | 'hline' | 'hray' | 'trend' | 'rect' | 'fib' | 'eraser' | null;

export const DRAWING_COLORS = [
  '#d4d4d8',
  '#f0b90b',
  '#0ecb81',
  '#f6465d',
  '#38bdf8',
  '#a78bfa',
  '#fb923c',
  '#ffffff',
] as const;

export const DEFAULT_DRAWING_COLOR = DRAWING_COLORS[0];
export const DEFAULT_LINE_WIDTH = 1;
export const LINE_WIDTHS = [1, 2, 3] as const;

export type DrawingStyle = {
  color: string;
  lineWidth: number;
};

type DrawingBase = DrawingStyle & {
  id: string;
  /** When false, drawing is hidden (Object Tree / props). Default true. */
  visible?: boolean;
};

export type HorizontalDrawing = DrawingBase & {
  type: 'hline';
  price: number;
  extendLeft: boolean;
  extendRight: boolean;
};

/** Horizontal ray — anchored at t1, extends infinitely to the right. */
export type HorizontalRayDrawing = DrawingBase & {
  type: 'hray';
  price: number;
  t1: number;
};

export type TrendDrawing = DrawingBase & {
  type: 'trend';
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  extendLeft: boolean;
  extendRight: boolean;
};

export type RectDrawing = DrawingBase & {
  type: 'rect';
  t1: number;
  p1: number;
  t2: number;
  p2: number;
};

export type FibDrawing = DrawingBase & {
  type: 'fib';
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  extendRight?: boolean;
  /** Active fib ratios; omit = all FIB_LEVELS. 0 and 1 are always kept. */
  levels?: number[];
};

export type ChartDrawing =
  | HorizontalDrawing
  | HorizontalRayDrawing
  | TrendDrawing
  | RectDrawing
  | FibDrawing;

export type DrawingsBySymbol = Partial<Record<SymbolId, ChartDrawing[]>>;

/** Shared two-point rubber-band draft (trend / rect / fib). */
export type TwoPointDraft = {
  type: 'trend' | 'rect' | 'fib';
  t1: number;
  p1: number;
  t2?: number;
  p2?: number;
};

/** @deprecated alias — prefer TwoPointDraft */
export type TrendDraft = TwoPointDraft;

export type HandleId = 'body' | 'p1' | 'p2';

export type DrawingHit = {
  drawing: ChartDrawing;
  handle: HandleId;
};

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
/** Levels users can toggle in fib props (0 & 1 always on). */
export const FIB_TOGGLE_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786] as const;

const LINE_SEL = 'rgba(240, 185, 11, 0.85)';
const LABEL_BG = 'rgba(10, 12, 16, 0.82)';
const LABEL_FG = 'rgba(228, 228, 231, 0.92)';
const HIT_PX = 7;
const HANDLE_HIT = 9;
export const MAGNET_PX = 8;

export function defaultDrawingStyle(): DrawingStyle {
  return { color: DEFAULT_DRAWING_COLOR, lineWidth: DEFAULT_LINE_WIDTH };
}

export function normalizeFibLevels(levels?: number[]): number[] {
  const base = Array.isArray(levels) && levels.length
    ? levels.filter((n) => typeof n === 'number' && Number.isFinite(n))
    : [...FIB_LEVELS];
  const set = new Set<number>(base);
  set.add(0);
  set.add(1);
  return [...FIB_LEVELS].filter((l) => set.has(l));
}

export function activeFibLevels(d: FibDrawing): number[] {
  return normalizeFibLevels(d.levels);
}

export function isDrawingVisible(d: ChartDrawing): boolean {
  return d.visible !== false;
}

export function withDrawingDefaults<T extends ChartDrawing>(d: T): T {
  const style = defaultDrawingStyle();
  const color = typeof (d as DrawingStyle).color === 'string' && (d as DrawingStyle).color
    ? (d as DrawingStyle).color
    : style.color;
  const lw = Number((d as DrawingStyle).lineWidth);
  const lineWidth = Number.isFinite(lw) && lw >= 1 ? Math.min(4, Math.round(lw)) : style.lineWidth;
  const visible = d.visible !== false;

  if (d.type === 'hline') {
    return {
      ...d,
      color,
      lineWidth,
      visible,
      extendLeft: d.extendLeft ?? true,
      extendRight: d.extendRight ?? true,
    };
  }
  if (d.type === 'hray') {
    return {
      ...d,
      color,
      lineWidth,
      visible,
      t1: Number.isFinite(d.t1) ? d.t1 : 0,
    };
  }
  if (d.type === 'trend') {
    return {
      ...d,
      color,
      lineWidth,
      visible,
      extendLeft: d.extendLeft ?? false,
      extendRight: d.extendRight ?? false,
    };
  }
  if (d.type === 'fib') {
    return {
      ...d,
      color,
      lineWidth,
      visible,
      extendRight: d.extendRight ?? false,
      levels: normalizeFibLevels(d.levels),
    };
  }
  return { ...d, color, lineWidth, visible };
}

function strokeFor(d: DrawingStyle, selected: boolean, draft = false): string {
  if (draft) return 'rgba(240,185,11,0.65)';
  if (selected) return d.color || LINE_SEL;
  return d.color || DEFAULT_DRAWING_COLOR;
}

function widthFor(d: DrawingStyle, selected: boolean, draft = false): number {
  const base = Number.isFinite(d.lineWidth) ? d.lineWidth : 1;
  return selected || draft ? Math.max(base, base + 0.25) : base;
}

function hexToRgba(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith('rgba') || c.startsWith('rgb')) return c;
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    let r: number, g: number, b: number;
    if (c.length === 7) {
      r = parseInt(c.slice(1, 3), 16);
      g = parseInt(c.slice(3, 5), 16);
      b = parseInt(c.slice(5, 7), 16);
    } else {
      r = parseInt(c[1] + c[1], 16);
      g = parseInt(c[2] + c[2], 16);
      b = parseInt(c[3] + c[3], 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(212, 212, 216, ${alpha})`;
}

export function newDrawingId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isPlaceTool(
  tool: DrawingTool,
): tool is 'hline' | 'hray' | 'trend' | 'rect' | 'fib' {
  return (
    tool === 'hline' ||
    tool === 'hray' ||
    tool === 'trend' ||
    tool === 'rect' ||
    tool === 'fib'
  );
}

export function drawingTypeLabel(d: ChartDrawing): string {
  switch (d.type) {
    case 'hline':
      return 'H-Line';
    case 'hray':
      return 'H-Ray';
    case 'trend':
      return 'Trend';
    case 'rect':
      return 'Rect';
    case 'fib':
      return 'Fib';
    default:
      return 'Draw';
  }
}

export function drawingTypeShort(d: ChartDrawing): string {
  switch (d.type) {
    case 'hline':
      return 'H';
    case 'hray':
      return 'Ray';
    case 'trend':
      return 'Tr';
    case 'rect':
      return 'R';
    case 'fib':
      return 'Fib';
    default:
      return '?';
  }
}

export function isSelectTool(tool: DrawingTool): boolean {
  return tool == null || tool === 'select';
}

export function loadDrawings(): DrawingsBySymbol {
  try {
    const raw = localStorage.getItem(DRAWINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DrawingsBySymbol;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: DrawingsBySymbol = {};
    for (const [sym, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue;
      out[sym as SymbolId] = list
        .filter((d): d is ChartDrawing => !!d && typeof d === 'object' && typeof (d as ChartDrawing).id === 'string')
        .map((d) => withDrawingDefaults(d as ChartDrawing));
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDrawings(all: DrawingsBySymbol): void {
  try {
    localStorage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
}

export function getSymbolDrawings(
  all: DrawingsBySymbol,
  symbol: SymbolId,
): ChartDrawing[] {
  return all[symbol] ?? [];
}

export function setSymbolDrawings(
  all: DrawingsBySymbol,
  symbol: SymbolId,
  drawings: ChartDrawing[],
): DrawingsBySymbol {
  return { ...all, [symbol]: drawings };
}

export function formatDrawingPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  const abs = Math.abs(price);
  const decimals = abs >= 1000 ? 1 : abs >= 100 ? 2 : abs >= 1 ? 3 : 4;
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function distPointToSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function coordsForTwoPoint(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  t1: number,
  p1: number,
  t2: number,
  p2: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const timeScale = chart.timeScale();
  const x1 = timeScale.timeToCoordinate(Math.floor(t1) as Time);
  const y1 = series.priceToCoordinate(p1);
  const x2 = timeScale.timeToCoordinate(Math.floor(t2) as Time);
  const y2 = series.priceToCoordinate(p2);
  if (
    x1 == null ||
    y1 == null ||
    x2 == null ||
    y2 == null ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2)
  ) {
    return null;
  }
  return { x1, y1, x2, y2 };
}

function hlineSpan(
  plotW: number,
  extendLeft: boolean,
  extendRight: boolean,
): { x0: number; x1: number } {
  const mid = plotW * 0.5;
  const half = Math.min(90, Math.max(36, plotW * 0.12));
  let x0 = mid - half;
  let x1 = mid + half;
  if (extendLeft) x0 = 0;
  if (extendRight) x1 = plotW;
  if (!extendLeft && !extendRight && x1 - x0 < 24) {
    x0 = mid - 24;
    x1 = mid + 24;
  }
  return { x0, x1 };
}

/** Extend a segment toward chart edges (TradingView-style rays). */
function extendedSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  plotW: number,
  plotH: number,
  extendLeft: boolean,
  extendRight: boolean,
): { x1: number; y1: number; x2: number; y2: number } {
  if (!extendLeft && !extendRight) return { x1, y1, x2, y2 };
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { x1, y1, x2, y2 };

  const ts: number[] = [];
  if (Math.abs(dx) > 1e-9) {
    ts.push((0 - x1) / dx);
    ts.push((plotW - x1) / dx);
  }
  if (Math.abs(dy) > 1e-9) {
    ts.push((0 - y1) / dy);
    ts.push((plotH - y1) / dy);
  }

  const valid = ts
    .filter((t) => Number.isFinite(t))
    .filter((t) => {
      const x = x1 + t * dx;
      const y = y1 + t * dy;
      return x >= -2 && x <= plotW + 2 && y >= -2 && y <= plotH + 2;
    })
    .sort((a, b) => a - b);

  if (valid.length < 2) return { x1, y1, x2, y2 };

  let tA = 0;
  let tB = 1;
  if (extendLeft) tA = valid[0];
  if (extendRight) tB = valid[valid.length - 1];
  // Keep anchors if not extending that side
  if (!extendLeft) tA = 0;
  if (!extendRight) tB = 1;

  return {
    x1: x1 + tA * dx,
    y1: y1 + tA * dy,
    x2: x1 + tB * dx,
    y2: y1 + tB * dy,
  };
}

export type MagnetCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/** Snap pointer to nearby candle OHLC / mid within a few px. */
export function magnetSnap(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  candles: MagnetCandle[],
  x: number,
  y: number,
  price: number,
  time: number,
  thresholdPx: number = MAGNET_PX,
): { price: number; time: number } {
  if (!candles.length) return { price, time };
  const timeScale = chart.timeScale();

  let bestDist = thresholdPx + 0.01;
  let bestPrice = price;
  let bestTime = time;

  for (const c of candles) {
    const cx = timeScale.timeToCoordinate(Math.floor(c.time) as Time);
    if (cx == null || !Number.isFinite(cx)) continue;
    if (Math.abs(cx - x) > thresholdPx * 4) continue;
    const mid = (c.high + c.low) / 2;
    for (const p of [c.open, c.high, c.low, c.close, mid]) {
      const py = series.priceToCoordinate(p);
      if (py == null || !Number.isFinite(py)) continue;
      const dist = Math.hypot(cx - x, py - y);
      if (dist <= bestDist) {
        bestDist = dist;
        bestPrice = p;
        bestTime = c.time;
      }
    }
  }

  if (bestDist <= thresholdPx) return { price: bestPrice, time: bestTime };
  return { price, time };
}

function hitRect(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  const onBorder =
    distPointToSeg(x, y, left, top, right, top) <= HIT_PX ||
    distPointToSeg(x, y, left, bot, right, bot) <= HIT_PX ||
    distPointToSeg(x, y, left, top, left, bot) <= HIT_PX ||
    distPointToSeg(x, y, right, top, right, bot) <= HIT_PX;
  return onBorder;
}

function hitFib(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  levels: readonly number[],
  extendRight: boolean,
  plotW: number,
): boolean {
  const left = Math.min(x1, x2);
  const right = extendRight ? plotW : Math.max(x1, x2);
  const xPad = 4;
  if (x < left - xPad || x > right + xPad) return false;
  for (const level of levels) {
    const yy = y1 + (y2 - y1) * level;
    if (Math.abs(y - yy) <= HIT_PX) return true;
  }
  return distPointToSeg(x, y, x1, y1, x2, y2) <= HIT_PX;
}

/** Detailed hit-test: prefers endpoint handles when selected / near. */
export function hitTestDrawingDetailed(
  drawings: ChartDrawing[],
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  x: number,
  y: number,
  preferredId?: string | null,
): DrawingHit | null {
  // Prefer handles on the preferred (selected) drawing first.
  if (preferredId) {
    const pref = drawings.find((d) => d.id === preferredId);
    if (pref && isDrawingVisible(pref)) {
      const handle = hitHandles(pref, chart, series, x, y);
      if (handle) return { drawing: pref, handle };
    }
  }

  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (!isDrawingVisible(d)) continue;
    const handle = hitHandles(d, chart, series, x, y);
    if (handle) return { drawing: d, handle };

    if (d.type === 'hline') {
      const yy = series.priceToCoordinate(d.price);
      if (yy == null || !Number.isFinite(yy)) continue;
      if (Math.abs(y - yy) > HIT_PX) continue;
      const plotW = chart.timeScale().width() || 0;
      const span = hlineSpan(plotW, d.extendLeft, d.extendRight);
      if (x >= span.x0 - HIT_PX && x <= span.x1 + HIT_PX) {
        return { drawing: d, handle: 'body' };
      }
      continue;
    }

    if (d.type === 'hray') {
      const yy = series.priceToCoordinate(d.price);
      if (yy == null || !Number.isFinite(yy)) continue;
      if (Math.abs(y - yy) > HIT_PX) continue;
      const plotW = chart.timeScale().width() || 0;
      const ax = chart.timeScale().timeToCoordinate(Math.floor(d.t1) as Time);
      const x0 = ax == null || !Number.isFinite(ax) ? 0 : ax;
      if (x >= x0 - HIT_PX && x <= plotW + HIT_PX) {
        return { drawing: d, handle: 'body' };
      }
      continue;
    }

    const c = coordsForTwoPoint(chart, series, d.t1, d.p1, d.t2, d.p2);
    if (!c) continue;

    if (d.type === 'trend') {
      const plotW = chart.timeScale().width() || 0;
      const paneH = chart.chartElement()?.clientHeight || 800;
      const ext = extendedSegment(
        c.x1,
        c.y1,
        c.x2,
        c.y2,
        plotW,
        paneH,
        d.extendLeft,
        d.extendRight,
      );
      if (distPointToSeg(x, y, ext.x1, ext.y1, ext.x2, ext.y2) <= HIT_PX) {
        return { drawing: d, handle: 'body' };
      }
    } else if (d.type === 'rect') {
      if (hitRect(x, y, c.x1, c.y1, c.x2, c.y2)) {
        return { drawing: d, handle: 'body' };
      }
    } else if (d.type === 'fib') {
      const plotW = chart.timeScale().width() || 0;
      if (
        hitFib(
          x,
          y,
          c.x1,
          c.y1,
          c.x2,
          c.y2,
          activeFibLevels(d),
          !!d.extendRight,
          plotW,
        )
      ) {
        return { drawing: d, handle: 'body' };
      }
    }
  }
  return null;
}

function hitHandles(
  d: ChartDrawing,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  x: number,
  y: number,
): HandleId | null {
  if (d.type === 'hline') return null;
  if (d.type === 'hray') {
    const yy = series.priceToCoordinate(d.price);
    const ax = chart.timeScale().timeToCoordinate(Math.floor(d.t1) as Time);
    if (yy == null || ax == null || !Number.isFinite(yy) || !Number.isFinite(ax)) {
      return null;
    }
    if (Math.hypot(x - ax, y - yy) <= HANDLE_HIT) return 'p1';
    return null;
  }
  const c = coordsForTwoPoint(chart, series, d.t1, d.p1, d.t2, d.p2);
  if (!c) return null;
  if (Math.hypot(x - c.x1, y - c.y1) <= HANDLE_HIT) return 'p1';
  if (Math.hypot(x - c.x2, y - c.y2) <= HANDLE_HIT) return 'p2';
  return null;
}

export function hitTestDrawing(
  drawings: ChartDrawing[],
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  x: number,
  y: number,
): ChartDrawing | null {
  return hitTestDrawingDetailed(drawings, chart, series, x, y)?.drawing ?? null;
}

/** Apply a drag delta (price / time) to a drawing given the grabbed handle. */
export function applyDrawingDrag(
  drawing: ChartDrawing,
  handle: HandleId,
  priceDelta: number,
  timeDelta: number,
): ChartDrawing {
  if (drawing.type === 'hline') {
    return { ...drawing, price: drawing.price + priceDelta };
  }
  if (drawing.type === 'hray') {
    if (handle === 'p1') {
      return {
        ...drawing,
        t1: drawing.t1 + timeDelta,
        price: drawing.price + priceDelta,
      };
    }
    return { ...drawing, price: drawing.price + priceDelta };
  }

  if (handle === 'p1') {
    return {
      ...drawing,
      t1: drawing.t1 + timeDelta,
      p1: drawing.p1 + priceDelta,
    };
  }
  if (handle === 'p2') {
    return {
      ...drawing,
      t2: drawing.t2 + timeDelta,
      p2: drawing.p2 + priceDelta,
    };
  }
  // body — translate both anchors
  return {
    ...drawing,
    t1: drawing.t1 + timeDelta,
    p1: drawing.p1 + priceDelta,
    t2: drawing.t2 + timeDelta,
    p2: drawing.p2 + priceDelta,
  };
}

/** Screen position for the delete (X) control of a selected drawing. */
export function deleteControlAnchor(
  drawing: ChartDrawing,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  paneW: number,
): { x: number; y: number } | null {
  if (drawing.type === 'hline' || drawing.type === 'hray') {
    const y = series.priceToCoordinate(drawing.price);
    if (y == null || !Number.isFinite(y)) return null;
    return { x: Math.max(24, paneW - 28), y };
  }
  const c = coordsForTwoPoint(
    chart,
    series,
    drawing.t1,
    drawing.p1,
    drawing.t2,
    drawing.p2,
  );
  if (!c) return null;
  return { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 };
}

export function drawChartDrawings(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  paneW: number,
  paneH: number,
  drawings: ChartDrawing[],
  selectedId: string | null,
  draft: TwoPointDraft | null,
): void {
  const timeScale = chart.timeScale();
  const plotW = timeScale.width() || paneW;

  for (const d of drawings) {
    if (!isDrawingVisible(d)) continue;
    const selected = d.id === selectedId;
    if (d.type === 'hline') {
      drawHLine(ctx, series, d, plotW, paneH, selected);
    } else if (d.type === 'hray') {
      drawHRay(ctx, chart, series, d, plotW, selected);
    } else if (d.type === 'trend') {
      drawTrend(ctx, chart, series, d, selected, false, paneH);
    } else if (d.type === 'rect') {
      drawRect(ctx, chart, series, d, selected);
    } else if (d.type === 'fib') {
      drawFib(ctx, chart, series, d, selected);
    }
  }

  if (draft && draft.t2 != null && draft.p2 != null) {
    const common = {
      id: '__draft__',
      t1: draft.t1,
      p1: draft.p1,
      t2: draft.t2,
      p2: draft.p2,
    };
    if (draft.type === 'trend') {
      drawTrend(ctx, chart, series, { ...common, type: 'trend', ...defaultDrawingStyle(), extendLeft: false, extendRight: false }, false, true, paneH);
    } else if (draft.type === 'rect') {
      drawRect(ctx, chart, series, { ...common, type: 'rect', ...defaultDrawingStyle() }, false, true);
    } else if (draft.type === 'fib') {
      drawFib(ctx, chart, series, { ...common, type: 'fib', ...defaultDrawingStyle() }, false, true);
    }
  } else if (draft) {
    const x = timeScale.timeToCoordinate(Math.floor(draft.t1) as Time);
    const y = series.priceToCoordinate(draft.p1);
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
      ctx.save();
      ctx.fillStyle = LINE_SEL;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  selected: boolean,
  draft = false,
): void {
  const r = selected || draft ? 4 : 2.25;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = draft || selected ? LINE_SEL : DEFAULT_DRAWING_COLOR;
  ctx.fill();
  if (selected) {
    ctx.strokeStyle = 'rgba(10,12,16,0.9)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(240,185,11,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawHLine(
  ctx: CanvasRenderingContext2D,
  series: ISeriesApi<'Candlestick'>,
  d: HorizontalDrawing,
  plotW: number,
  _paneH: number,
  selected: boolean,
): void {
  const y = series.priceToCoordinate(d.price);
  if (y == null || !Number.isFinite(y)) return;
  const span = hlineSpan(plotW, d.extendLeft, d.extendRight);

  ctx.save();
  ctx.strokeStyle = strokeFor(d, selected);
  ctx.globalAlpha = selected ? 1 : 0.92;
  ctx.lineWidth = widthFor(d, selected);
  const fullyExtended = d.extendLeft && d.extendRight;
  ctx.setLineDash(selected || fullyExtended ? [] : [5, 4]);
  ctx.beginPath();
  ctx.moveTo(span.x0, y);
  ctx.lineTo(span.x1, y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (selected) {
    drawHandle(ctx, span.x0 + 10, y, true);
    drawHandle(ctx, Math.max(span.x0 + 24, span.x1 - 14), y, true);
  } else {
    ctx.fillStyle = strokeFor(d, false);
    ctx.beginPath();
    ctx.arc(span.x0 + 3, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const label = formatDrawingPrice(d.price);
  ctx.font = '600 9px IBM Plex Mono, JetBrains Mono, monospace';
  const tw = ctx.measureText(label).width;
  const padX = 5;
  const boxW = tw + padX * 2;
  const boxH = 14;
  const bx = Math.min(Math.max(4, span.x1 - boxW - 4), Math.max(4, plotW - boxW - 6));
  const by = y - boxH / 2;

  ctx.fillStyle = LABEL_BG;
  ctx.strokeStyle = selected ? 'rgba(240,185,11,0.55)' : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(bx, by, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = selected ? 'rgba(240,185,11,0.95)' : LABEL_FG;
  ctx.fillText(label, bx + padX, by + 10);
  ctx.restore();
}

function drawHRay(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  d: HorizontalRayDrawing,
  plotW: number,
  selected: boolean,
): void {
  const y = series.priceToCoordinate(d.price);
  if (y == null || !Number.isFinite(y)) return;
  const ax = chart.timeScale().timeToCoordinate(Math.floor(d.t1) as Time);
  const x0 = ax == null || !Number.isFinite(ax) ? 0 : Math.max(0, ax);
  const x1 = plotW;

  ctx.save();
  ctx.strokeStyle = strokeFor(d, selected);
  ctx.globalAlpha = selected ? 1 : 0.92;
  ctx.lineWidth = widthFor(d, selected);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();

  // Arrow tip at right edge
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x1 - 7, y - 3.5);
  ctx.lineTo(x1 - 7, y + 3.5);
  ctx.closePath();
  ctx.fillStyle = strokeFor(d, selected);
  ctx.fill();

  if (selected) {
    drawHandle(ctx, x0, y, true);
    drawHandle(ctx, Math.max(x0 + 24, x1 - 18), y, true);
  } else {
    ctx.fillStyle = strokeFor(d, false);
    ctx.beginPath();
    ctx.arc(x0, y, 2.25, 0, Math.PI * 2);
    ctx.fill();
  }

  const label = formatDrawingPrice(d.price);
  ctx.font = '600 9px IBM Plex Mono, JetBrains Mono, monospace';
  const tw = ctx.measureText(label).width;
  const padX = 5;
  const boxW = tw + padX * 2;
  const boxH = 14;
  const bx = Math.min(Math.max(4, x1 - boxW - 10), Math.max(4, plotW - boxW - 6));
  const by = y - boxH / 2;

  ctx.fillStyle = LABEL_BG;
  ctx.strokeStyle = selected ? 'rgba(240,185,11,0.55)' : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(bx, by, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = selected ? 'rgba(240,185,11,0.95)' : LABEL_FG;
  ctx.fillText(label, bx + padX, by + 10);
  ctx.restore();
}

function drawTrend(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  d: TrendDrawing,
  selected: boolean,
  draft = false,
  paneH = 800,
): void {
  const c = coordsForTwoPoint(chart, series, d.t1, d.p1, d.t2, d.p2);
  if (!c) return;
  const plotW = chart.timeScale().width() || 0;
  const ext = extendedSegment(
    c.x1,
    c.y1,
    c.x2,
    c.y2,
    plotW,
    paneH,
    draft ? false : d.extendLeft,
    draft ? false : d.extendRight,
  );

  ctx.save();
  ctx.strokeStyle = strokeFor(d, selected, draft);
  ctx.globalAlpha = draft ? 0.85 : 1;
  ctx.lineWidth = widthFor(d, selected, draft);
  ctx.setLineDash(draft ? [4, 3] : []);
  ctx.beginPath();
  ctx.moveTo(ext.x1, ext.y1);
  ctx.lineTo(ext.x2, ext.y2);
  ctx.stroke();
  ctx.setLineDash([]);

  drawHandle(ctx, c.x1, c.y1, selected, draft);
  drawHandle(ctx, c.x2, c.y2, selected, draft);
  ctx.restore();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  d: RectDrawing,
  selected: boolean,
  draft = false,
): void {
  const c = coordsForTwoPoint(chart, series, d.t1, d.p1, d.t2, d.p2);
  if (!c) return;
  const left = Math.min(c.x1, c.x2);
  const right = Math.max(c.x1, c.x2);
  const top = Math.min(c.y1, c.y2);
  const bot = Math.max(c.y1, c.y2);
  const w = Math.max(1, right - left);
  const h = Math.max(1, bot - top);

  ctx.save();
  ctx.fillStyle = hexToRgba(d.color || DEFAULT_DRAWING_COLOR, draft || selected ? 0.1 : 0.06);
  ctx.fillRect(left, top, w, h);

  ctx.strokeStyle = strokeFor(d, selected, draft);
  ctx.globalAlpha = draft ? 0.9 : 1;
  ctx.lineWidth = widthFor(d, selected, draft);
  ctx.setLineDash(draft ? [4, 3] : []);
  ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
  ctx.setLineDash([]);

  for (const [cx, cy] of [
    [c.x1, c.y1],
    [c.x2, c.y2],
    [c.x1, c.y2],
    [c.x2, c.y1],
  ] as const) {
    drawHandle(ctx, cx, cy, selected, draft);
  }
  ctx.restore();
}

function formatFibLevel(level: number): string {
  if (level === 0) return '0';
  if (level === 1) return '1';
  if (level === 0.5) return '0.5';
  return level.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function drawFib(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  d: FibDrawing,
  selected: boolean,
  draft = false,
): void {
  const c = coordsForTwoPoint(chart, series, d.t1, d.p1, d.t2, d.p2);
  if (!c) return;
  const left = Math.min(c.x1, c.x2);
  const rightAnchor = Math.max(c.x1, c.x2);
  const plotW = chart.timeScale().width() || rightAnchor + 40;
  const right = !draft && d.extendRight ? plotW : rightAnchor;
  const levels = draft ? [...FIB_LEVELS] : activeFibLevels(d);

  ctx.save();

  const top = Math.min(c.y1, c.y2);
  const bot = Math.max(c.y1, c.y2);
  ctx.fillStyle = hexToRgba(d.color || DEFAULT_DRAWING_COLOR, draft || selected ? 0.08 : 0.04);
  ctx.fillRect(left, top, Math.max(1, rightAnchor - left), Math.max(1, bot - top));

  ctx.strokeStyle = hexToRgba(d.color || DEFAULT_DRAWING_COLOR, draft || selected ? 0.55 : 0.35);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(c.x1, c.y1);
  ctx.lineTo(c.x2, c.y2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '600 9px IBM Plex Mono, JetBrains Mono, monospace';

  for (const level of levels) {
    const price = d.p1 + (d.p2 - d.p1) * level;
    const y = c.y1 + (c.y2 - c.y1) * level;
    const isExtreme = level === 0 || level === 1;

    ctx.strokeStyle = strokeFor(d, selected || isExtreme, draft);
    ctx.globalAlpha = draft ? 0.9 : isExtreme ? 1 : 0.85;
    ctx.lineWidth = widthFor(d, selected || isExtreme, draft);
    ctx.setLineDash(draft && !isExtreme ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const levelTxt = formatFibLevel(level);
    const priceTxt = formatDrawingPrice(price);
    const label = `${levelTxt}  ${priceTxt}`;
    const tw = ctx.measureText(label).width;
    const padX = 4;
    const boxW = tw + padX * 2;
    const boxH = 13;
    const bx = right + 4;
    const labelX = bx + boxW > plotW - 2 ? left - boxW - 4 : bx;
    const by = y - boxH / 2;

    ctx.fillStyle = LABEL_BG;
    ctx.strokeStyle = selected
      ? 'rgba(240,185,11,0.45)'
      : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(labelX, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = selected
      ? 'rgba(240,185,11,0.95)'
      : isExtreme
        ? LABEL_FG
        : 'rgba(212,212,216,0.78)';
    ctx.fillText(label, labelX + padX, by + 9.5);
  }

  drawHandle(ctx, c.x1, c.y1, selected, draft);
  drawHandle(ctx, c.x2, c.y2, selected, draft);

  ctx.restore();
}

/** Visible magnet snap affordance — ring at MAGNET_PX, stronger when snapped. */
export function drawMagnetPreview(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  snapped: boolean,
  radiusPx: number = MAGNET_PX,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  ctx.strokeStyle = snapped
    ? 'rgba(240,185,11,0.75)'
    : 'rgba(240,185,11,0.28)';
  ctx.lineWidth = snapped ? 1.35 : 1;
  ctx.setLineDash(snapped ? [] : [2.5, 2.5]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (snapped) {
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240,185,11,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,185,11,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - radiusPx - 2, y);
    ctx.lineTo(x - 3.5, y);
    ctx.moveTo(x + 3.5, y);
    ctx.lineTo(x + radiusPx + 2, y);
    ctx.moveTo(x, y - radiusPx - 2);
    ctx.lineTo(x, y - 3.5);
    ctx.moveTo(x, y + 3.5);
    ctx.lineTo(x, y + radiusPx + 2);
    ctx.stroke();
  }
  ctx.restore();
}
