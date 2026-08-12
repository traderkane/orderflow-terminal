import { useEffect, useMemo, useRef } from 'react';
import { buildLiquidationMapFromStats } from '../data/liquidationMap';
import { useTerminalStore } from '../store/useTerminalStore';

/**
 * MMT-inspired modelled liquidation map.
 * Horizontal density by price: longs below (green) / shorts above (red).
 */
export function LiquidationMapWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stats = useTerminalStore((s) => s.feed?.stats);

  const map = useMemo(() => {
    if (!stats) return null;
    return buildLiquidationMapFromStats(stats, 56);
  }, [stats]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0e15';
    ctx.fillRect(0, 0, w, h);

    if (!map || !map.levels.length || map.maxDensity <= 0) {
      ctx.fillStyle = '#52525b';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText('Waiting for mark / OI…', 12, 24);
      return;
    }

    const padL = 58;
    const padR = 8;
    const padT = 8;
    const padB = 18;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const midX = padL + plotW / 2;
    const levels = map.levels;
    const n = levels.length;
    const rowH = plotH / n;
    const invMax = 1 / map.maxDensity;
    const priceLo = levels[0].price;
    const priceHi = levels[n - 1].price;

    // Center gutter
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(midX - 1, padT, 2, plotH);

    for (let i = 0; i < n; i++) {
      const lvl = levels[i];
      // levels[0] is lowest price → draw at bottom
      const y = padT + plotH - (i + 1) * rowH;
      const barH = Math.max(1, Math.ceil(rowH) - 1);

      const longI = Math.min(1, Math.pow(lvl.longDensity * invMax, 0.55));
      const shortI = Math.min(1, Math.pow(lvl.shortDensity * invMax, 0.55));
      const maxBar = (plotW / 2) * 0.92;

      if (longI > 0.02) {
        const bw = Math.max(1, longI * maxBar);
        ctx.fillStyle = `rgba(61, 214, 140, ${0.2 + longI * 0.75})`;
        ctx.fillRect(midX - bw, y, bw, barH);
      }
      if (shortI > 0.02) {
        const bw = Math.max(1, shortI * maxBar);
        ctx.fillStyle = `rgba(240, 113, 120, ${0.2 + shortI * 0.75})`;
        ctx.fillRect(midX, y, bw, barH);
      }
    }

    // Mark / last line
    const t = (map.mark - priceLo) / (priceHi - priceLo || 1);
    const markY = padT + plotH - t * plotH;
    ctx.strokeStyle = 'rgba(250, 250, 250, 0.45)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, markY);
    ctx.lineTo(padL + plotW, markY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#e4e4e7';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(map.mark.toFixed(2), padL + 4, Math.max(padT + 10, markY - 3));

    // Price labels (lo / mid / hi)
    ctx.fillStyle = '#71717a';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    const labels = [
      { p: priceHi, y: padT + 9 },
      { p: map.mark, y: Math.min(h - padB - 2, Math.max(padT + 9, markY + 3)) },
      { p: priceLo, y: padT + plotH },
    ];
    for (const { p, y } of labels) {
      ctx.fillText(p.toFixed(1), padL - 4, y);
    }

    // Axis captions
    ctx.textAlign = 'center';
    ctx.fillStyle = '#52525b';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText('LONG liq ↓', padL + plotW * 0.25, h - 4);
    ctx.fillText('SHORT liq ↑', padL + plotW * 0.75, h - 4);
  }, [map]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/50 px-2 py-1 text-[9px] uppercase tracking-wider text-zinc-500">
        modelled · 5–100× ladder
      </div>
    </div>
  );
}
