import { useEffect, useRef } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';

export function HeatmapWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatmap = useTerminalStore((s) => s.feed?.heatmap) ?? [];
  const mid = useTerminalStore((s) => s.feed?.stats.mid) ?? 0;

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

    if (!heatmap.length) {
      ctx.fillStyle = '#52525b';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText('Building liquidity heatmap…', 12, 24);
      return;
    }

    const frames = heatmap.slice(-80);
    const levels = frames[0].prices.length;
    const cellW = w / frames.length;
    const cellH = h / levels;

    for (let x = 0; x < frames.length; x++) {
      const frame = frames[x];
      for (let y = 0; y < levels; y++) {
        const bid = frame.bids[y] ?? 0;
        const ask = frame.asks[y] ?? 0;
        const intensity = Math.min(1, Math.max(bid, ask) * 1.2);
        if (intensity < 0.02) continue;
        const isBid = bid >= ask;
        const alpha = 0.15 + intensity * 0.75;
        ctx.fillStyle = isBid
          ? `rgba(61, 214, 140, ${alpha})`
          : `rgba(240, 113, 120, ${alpha})`;
        // y=0 is low price at bottom
        const py = h - (y + 1) * cellH;
        ctx.fillRect(x * cellW, py, Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
      }
    }

    // mid line
    if (mid && frames[0]) {
      const prices = frames[frames.length - 1].prices;
      const lo = prices[0];
      const hi = prices[prices.length - 1];
      const t = (mid - lo) / (hi - lo || 1);
      const y = h - t * h;
      ctx.strokeStyle = 'rgba(250, 250, 250, 0.35)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(mid.toFixed(2), 6, Math.max(12, y - 4));
    }
  }, [heatmap, mid]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-2 py-1 text-[10px] text-zinc-400">
        time → · price ↑ · green bid / red ask
      </div>
    </div>
  );
}
