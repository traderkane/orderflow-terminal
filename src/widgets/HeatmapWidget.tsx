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
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, w, h);

    if (!heatmap.length) {
      ctx.fillStyle = '#565d6a';
      ctx.font = '11px IBM Plex Mono, monospace';
      ctx.fillText('Building liquidity heatmap…', 10, 20);
      return;
    }

    const frames = heatmap.slice(-160);
    const levels = frames[frames.length - 1]?.prices.length || frames[0].prices.length;
    const cellW = w / Math.max(frames.length, 1);
    const cellH = h / Math.max(levels, 1);

    let peak = 0;
    for (const frame of frames) {
      for (let y = 0; y < levels; y++) {
        peak = Math.max(peak, frame.bids[y] ?? 0, frame.asks[y] ?? 0);
      }
    }
    const invPeak = peak > 0 ? 1 / peak : 1;

    for (let x = 0; x < frames.length; x++) {
      const frame = frames[x];
      for (let y = 0; y < levels; y++) {
        const bid = frame.bids[y] ?? 0;
        const ask = frame.asks[y] ?? 0;
        const raw = Math.max(bid, ask) * invPeak;
        if (raw < 0.012) continue;
        const intensity = Math.min(1, Math.pow(raw, 0.52));
        const isBid = bid >= ask;
        const alpha = 0.16 + intensity * 0.84;
        ctx.fillStyle = isBid
          ? `rgba(14, 203, 129, ${alpha})`
          : `rgba(246, 70, 93, ${alpha})`;
        const py = h - (y + 1) * cellH;
        ctx.fillRect(
          Math.floor(x * cellW),
          Math.floor(py),
          Math.ceil(cellW) + 1,
          Math.ceil(cellH) + 1,
        );
      }
    }

    if (mid && frames.length) {
      const prices = frames[frames.length - 1].prices;
      const lo = prices[0];
      const hi = prices[prices.length - 1];
      const t = (mid - lo) / (hi - lo || 1);
      const y = h - t * h;
      ctx.strokeStyle = 'rgba(244, 244, 245, 0.4)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '10px IBM Plex Mono, monospace';
      ctx.fillText(mid.toFixed(2), 6, Math.max(12, y - 4));
    }
  }, [heatmap, mid]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-[2px] bg-black/55 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        t → · px ↑ · bid / ask
      </div>
    </div>
  );
}
