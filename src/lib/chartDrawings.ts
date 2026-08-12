/** Chart drawing tools — types, persistence, hit-test, canvas render. */

import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { SymbolId } from '../types/market';

export const DRAWINGS_STORAGE_KEY = 'flow-terminal-drawings-v1';

export type DrawingTool = 'hline' | 'trend' | null;

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

export type ChartDrawing = HorizontalDrawing | TrendDrawing;

export type DrawingsBySymbol = Partial<Record<SymbolId, ChartDrawing[]>>;

export type TrendDraft = {
  t1: number;
  p1: number;
  t2?: number;
  p2?: number;
};

const LINE = 'rgba(212, 212, 216, 0.55)';
const LINE_SEL = 'rgba(240, 185, 11, 0.85)';
const LABEL_BG = 'rgba(10, 12, 16, 0.82)';
const LABEL_FG = 'rgba(228, 228, 231, 0.92)';
const HIT_PX = 7;

export function newDrawingId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

export function hitTestDrawing(
  drawings: ChartDrawing[],
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  x: number,
  y: number,
): ChartDrawing | null {
  const timeScale = chart.timeScale();
  // Top-most (last) wins.
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (d.type === 'hline') {
      const yy = series.priceToCoordinate(d.price);
      if (yy == null || !Number.isFinite(yy)) continue;
      if (Math.abs(y - yy) <= HIT_PX) return d;
    } else {
      const x1 = timeScale.timeToCoordinate(Math.floor(d.t1) as Time);
      const y1 = series.priceToCoordinate(d.p1);
      const x2 = timeScale.timeToCoordinate(Math.floor(d.t2) as Time);
      const y2 = series.priceToCoordinate(d.p2);
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
        continue;
      }
      if (distPointToSeg(x, y, x1, y1, x2, y2) <= HIT_PX) return d;
    }
  }
  return null;
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
  const timeScale = chart.timeScale();
  const x1 = timeScale.timeToCoordinate(Math.floor(drawing.t1) as Time);
  const y1 = series.priceToCoordinate(drawing.p1);
  const x2 = timeScale.timeToCoordinate(Math.floor(drawing.t2) as Time);
  const y2 = series.priceToCoordinate(drawing.p2);
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
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

export function drawChartDrawings(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  paneW: number,
  paneH: number,
  drawings: ChartDrawing[],
  selectedId: string | null,
  draft: TrendDraft | null,
): void {
  const timeScale = chart.timeScale();
  const plotW = timeScale.width() || paneW;

  for (const d of drawings) {
    const selected = d.id === selectedId;
    if (d.type === 'hline') {
      drawHLine(ctx, series, d.price, plotW, paneH, selected);
    } else {
      drawTrend(ctx, chart, series, d, selected);
    }
  }

  if (draft && draft.t2 != null && draft.p2 != null) {
    drawTrend(
      ctx,
      chart,
      series,
      {
        id: '__draft__',
        type: 'trend',
        t1: draft.t1,
        p1: draft.p1,
        t2: draft.t2,
        p2: draft.p2,
      },
      false,
      true,
    );
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
  ctx.lineWidth = selected ? 1.25 : 1;
  ctx.setLineDash(selected ? [] : [5, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(plotW, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // End cap
  ctx.fillStyle = selected ? LINE_SEL : LINE;
  ctx.beginPath();
  ctx.arc(4, y, selected ? 2.5 : 2, 0, Math.PI * 2);
  ctx.fill();

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
  const timeScale = chart.timeScale();
  const x1 = timeScale.timeToCoordinate(Math.floor(d.t1) as Time);
  const y1 = series.priceToCoordinate(d.p1);
  const x2 = timeScale.timeToCoordinate(Math.floor(d.t2) as Time);
  const y2 = series.priceToCoordinate(d.p2);
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
    return;
  }

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

  const r = selected || draft ? 3 : 2.25;
  ctx.fillStyle = draft || selected ? LINE_SEL : LINE;
  ctx.beginPath();
  ctx.arc(x1, y1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x2, y2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
