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

    const frames = heatmap.slice(-200);
    const levels =
      frames[frames.length - 1]?.prices.length || frames[0].prices.length;
    // Slight overlap + ease so time axis reads as a trail, not stamps.
    const cellW = w / Math.max(frames.length, 1);
    const cellH = h / Math.max(levels, 1);

    const samples: number[] = [];
    for (const frame of frames) {
      for (let y = 0; y < levels; y++) {
        const v = Math.max(frame.bids[y] ?? 0, frame.asks[y] ?? 0);
        if (v > 0.001) samples.push(v);
      }
    }
    samples.sort((a, b) => a - b);
    const peak =
      samples.length > 0
        ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.94))]
        : 1;
    const invPeak = peak > 0 ? 1 / peak : 1;

    for (let x = 0; x < frames.length; x++) {
      const frame = frames[x];
      const prev = x > 0 ? frames[x - 1] : frame;
      const next = x + 1 < frames.length ? frames[x + 1] : frame;
      // Ease recent columns a touch wider visually via overlap
      const t = x / Math.max(1, frames.length - 1);
      const ease = t * t * (3 - 2 * t);
      const xLeft = x * cellW - cellW * 0.12;
      const xRight = (x + 1) * cellW + cellW * (0.18 + ease * 0.08);
      const drawW = Math.max(1, xRight - xLeft);

      for (let y = 0; y < levels; y++) {
        const bidRaw =
          (frame.bids[y] ?? 0) * 0.5 +
          (prev.bids[y] ?? frame.bids[y] ?? 0) * 0.2 +
          (next.bids[y] ?? frame.bids[y] ?? 0) * 0.2 +
          (frame.bids[y - 1] ?? frame.bids[y] ?? 0) * 0.05 +
          (frame.bids[y + 1] ?? frame.bids[y] ?? 0) * 0.05;
        const askRaw =
          (frame.asks[y] ?? 0) * 0.5 +
          (prev.asks[y] ?? frame.asks[y] ?? 0) * 0.2 +
          (next.asks[y] ?? frame.asks[y] ?? 0) * 0.2 +
          (frame.asks[y - 1] ?? frame.asks[y] ?? 0) * 0.05 +
          (frame.asks[y + 1] ?? frame.asks[y] ?? 0) * 0.05;

        const rawBid = Math.min(1.4, bidRaw * invPeak);
        const rawAsk = Math.min(1.4, askRaw * invPeak);
        if (rawBid < 0.01 && rawAsk < 0.01) continue;

        const bidI = Math.min(1, Math.pow(Math.max(0, rawBid), 0.46));
        const askI = Math.min(1, Math.pow(Math.max(0, rawAsk), 0.46));
        const py = h - (y + 1) * cellH;
        const drawH = Math.ceil(cellH) + 1;

        if (bidI >= askI) {
          ctx.fillStyle = `rgba(14, 203, 129, ${0.14 + bidI * 0.86})`;
          ctx.fillRect(Math.floor(xLeft), Math.floor(py), Math.ceil(drawW) + 1, drawH);
          if (askI > 0.07) {
            ctx.fillStyle = `rgba(246, 70, 93, ${0.06 + askI * 0.28})`;
            ctx.fillRect(Math.floor(xLeft), Math.floor(py), Math.ceil(drawW) + 1, drawH);
          }
        } else {
          ctx.fillStyle = `rgba(246, 70, 93, ${0.14 + askI * 0.86})`;
          ctx.fillRect(Math.floor(xLeft), Math.floor(py), Math.ceil(drawW) + 1, drawH);
          if (bidI > 0.07) {
            ctx.fillStyle = `rgba(14, 203, 129, ${0.06 + bidI * 0.28})`;
            ctx.fillRect(Math.floor(xLeft), Math.floor(py), Math.ceil(drawW) + 1, drawH);
          }
        }
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
