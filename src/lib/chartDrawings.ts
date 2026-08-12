/** Chart drawing tools — types, persistence, hit-test, canvas render. */

import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { SymbolId } from '../types/market';

export const DRAWINGS_STORAGE_KEY = 'flow-terminal-drawings-v1';

/** null / 'select' = cursor mode; eraser deletes on click. */
export type DrawingTool = 'select' | 'hline' | 'trend' | 'rect' | 'fib' | 'eraser' | null;

export type HorizontalDrawing = {
  id: string;
  type: 'hline';
  price: number;
};

export type TrendDrawing = {
  id: string;
  type: 'trend';
  t1: number;
  p1: number;
  t2: number;
  p2: number;
};

export type RectDrawing = {
  id: string;
  type: 'rect';
  t1: number;
  p1: number;
  t2: number;
  p2: number;
};

export type FibDrawing = {
  id: string;
  type: 'fib';
  t1: number;
  p1: number;
  t2: number;
  p2: number;
};

export type ChartDrawing =
  | HorizontalDrawing
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

const LINE = 'rgba(212, 212, 216, 0.55)';
const LINE_SEL = 'rgba(240, 185, 11, 0.85)';
const LABEL_BG = 'rgba(10, 12, 16, 0.82)';
const LABEL_FG = 'rgba(228, 228, 231, 0.92)';
const HIT_PX = 7;
const HANDLE_HIT = 9;
const RECT_FILL = 'rgba(212, 212, 216, 0.06)';
const RECT_FILL_SEL = 'rgba(240, 185, 11, 0.08)';
const FIB_FILL = 'rgba(240, 185, 11, 0.04)';

export function newDrawingId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isPlaceTool(
  tool: DrawingTool,
): tool is 'hline' | 'trend' | 'rect' | 'fib' {
  return tool === 'hline' || tool === 'trend' || tool === 'rect' || tool === 'fib';
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
    return parsed;
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
): boolean {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const xPad = 4;
  if (x < left - xPad || x > right + xPad) return false;
  for (const level of FIB_LEVELS) {
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
    if (pref) {
      const handle = hitHandles(pref, chart, series, x, y);
      if (handle) return { drawing: pref, handle };
    }
  }

  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    const handle = hitHandles(d, chart, series, x, y);
    if (handle) return { drawing: d, handle };

    if (d.type === 'hline') {
      const yy = series.priceToCoordinate(d.price);
      if (yy == null || !Number.isFinite(yy)) continue;
      if (Math.abs(y - yy) <= HIT_PX) return { drawing: d, handle: 'body' };
      continue;
    }

    const c = coordsForTwoPoint(chart, series, d.t1, d.p1, d.t2, d.p2);
    if (!c) continue;

    if (d.type === 'trend') {
      if (distPointToSeg(x, y, c.x1, c.y1, c.x2, c.y2) <= HIT_PX) {
        return { drawing: d, handle: 'body' };
      }
    } else if (d.type === 'rect') {
      if (hitRect(x, y, c.x1, c.y1, c.x2, c.y2)) {
        return { drawing: d, handle: 'body' };
      }
    } else if (d.type === 'fib') {
      if (hitFib(x, y, c.x1, c.y1, c.x2, c.y2)) {
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
  if (drawing.type === 'hline') {
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
    const selected = d.id === selectedId;
    if (d.type === 'hline') {
      drawHLine(ctx, series, d.price, plotW, paneH, selected);
    } else if (d.type === 'trend') {
      drawTrend(ctx, chart, series, d, selected);
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
      drawTrend(ctx, chart, series, { ...common, type: 'trend' }, false, true);
    } else if (draft.type === 'rect') {
      drawRect(ctx, chart, series, { ...common, type: 'rect' }, false, true);
    } else if (draft.type === 'fib') {
      drawFib(ctx, chart, series, { ...common, type: 'fib' }, false, true);
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
  ctx.fillStyle = draft || selected ? LINE_SEL : LINE;
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
  price: number,
  plotW: number,
  _paneH: number,
  selected: boolean,
): void {
  const y = series.priceToCoordinate(price);
  if (y == null || !Number.isFinite(y)) return;

  ctx.save();
  ctx.strokeStyle = selected ? LINE_SEL : LINE;
  ctx.globalAlpha = selected ? 1 : 0.9;
  ctx.lineWidth = selected ? 1.35 : 1;
  ctx.setLineDash(selected ? [] : [5, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(plotW, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Drag handles on the line when selected
  if (selected) {
    drawHandle(ctx, 14, y, true);
    drawHandle(ctx, Math.max(28, plotW - 48), y, true);
  } else {
    ctx.fillStyle = LINE;
    ctx.beginPath();
    ctx.arc(4, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const label = formatDrawingPrice(price);
  ctx.font = '600 9px IBM Plex Mono, JetBrains Mono, monospace';
  const tw = ctx.measureText(label).width;
  const padX = 5;
  const boxW = tw + padX * 2;
  const boxH = 14;
  const bx = Math.max(4, plotW - boxW - 6);
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
): void {
  const c = coordsForTwoPoint(chart, series, d.t1, d.p1, d.t2, d.p2);
  if (!c) return;
  const { x1, y1, x2, y2 } = c;

  ctx.save();
  ctx.strokeStyle = draft ? 'rgba(240,185,11,0.65)' : selected ? LINE_SEL : LINE;
  ctx.globalAlpha = draft ? 0.85 : 1;
  ctx.lineWidth = selected || draft ? 1.25 : 1;
  ctx.setLineDash(draft ? [4, 3] : []);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  drawHandle(ctx, x1, y1, selected, draft);
  drawHandle(ctx, x2, y2, selected, draft);
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
  ctx.fillStyle = draft || selected ? RECT_FILL_SEL : RECT_FILL;
  ctx.fillRect(left, top, w, h);

  ctx.strokeStyle = draft ? 'rgba(240,185,11,0.65)' : selected ? LINE_SEL : LINE;
  ctx.globalAlpha = draft ? 0.9 : 1;
  ctx.lineWidth = selected || draft ? 1.25 : 1;
  ctx.setLineDash(draft ? [4, 3] : []);
  ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
  ctx.setLineDash([]);

  // Corner handles — p1/p2 are the interactive anchors; show all 4 for polish
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
  const right = Math.max(c.x1, c.x2);
  const span = Math.max(1, right - left);

  ctx.save();

  const top = Math.min(c.y1, c.y2);
  const bot = Math.max(c.y1, c.y2);
  ctx.fillStyle = draft || selected ? 'rgba(240,185,11,0.06)' : FIB_FILL;
  ctx.fillRect(left, top, span, Math.max(1, bot - top));

  ctx.strokeStyle = draft
    ? 'rgba(240,185,11,0.45)'
    : selected
      ? 'rgba(240,185,11,0.45)'
      : 'rgba(212,212,216,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(c.x1, c.y1);
  ctx.lineTo(c.x2, c.y2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '600 9px IBM Plex Mono, JetBrains Mono, monospace';

  for (const level of FIB_LEVELS) {
    const price = d.p1 + (d.p2 - d.p1) * level;
    const y = c.y1 + (c.y2 - c.y1) * level;
    const isExtreme = level === 0 || level === 1;

    ctx.strokeStyle = draft
      ? 'rgba(240,185,11,0.7)'
      : selected
        ? LINE_SEL
        : isExtreme
          ? 'rgba(212,212,216,0.7)'
          : LINE;
    ctx.globalAlpha = draft ? 0.9 : 1;
    ctx.lineWidth = selected || isExtreme ? 1.15 : 1;
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
    const plotW = chart.timeScale().width() || right + boxW + 8;
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
