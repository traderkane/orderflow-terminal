import { useEffect, useRef, useState } from 'react';
import {
  HEATMAP_CRAFT_EVENT,
  heatmapCellColor,
  loadHeatmapCraft,
  peakPercentile,
  rebinHeatLevels,
  splatBlend,
  type HeatmapCraftPrefs,
} from '../lib/heatmapCraft';
import { useTerminalStore } from '../store/useTerminalStore';

export function HeatmapWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heatmap = useTerminalStore((s) => s.feed?.heatmap) ?? [];
  const mid = useTerminalStore((s) => s.feed?.stats.mid) ?? 0;
  const [craft, setCraft] = useState<HeatmapCraftPrefs>(() => loadHeatmapCraft());

  useEffect(() => {
    const sync = () => setCraft(loadHeatmapCraft());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'flow-terminal-heatmap-craft-v1') sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(HEATMAP_CRAFT_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(HEATMAP_CRAFT_EVENT, sync as EventListener);
    };
  }, []);

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
    const samples: number[] = [];
    const rebinnedFrames = frames.map((frame) =>
      rebinHeatLevels(frame.prices, frame.bids, frame.asks, craft.binMode),
    );
    for (const frame of rebinnedFrames) {
      for (let y = 0; y < frame.prices.length; y++) {
        const v = Math.max(frame.bids[y] ?? 0, frame.asks[y] ?? 0);
        if (v > 0.001) samples.push(v);
      }
    }
    samples.sort((a, b) => a - b);
    const pct = peakPercentile(craft.peakIntensity);
    const peak =
      samples.length > 0
        ? samples[Math.min(samples.length - 1, Math.floor(samples.length * pct))]
        : 1;
    const invPeak = peak > 0 ? 1 / peak : 1;
    const levels = rebinnedFrames[rebinnedFrames.length - 1]?.prices.length || 1;
    const cellW = w / Math.max(frames.length, 1);
    const cellH = h / Math.max(levels, 1);
    const isSplat = craft.style === 'splat';
    const gamma = isSplat ? 0.62 : 0.52;
    const alphaScale = isSplat ? 0.42 : 0.52;
    const alphaFloor = isSplat ? 0.06 : 0.08;

    if (isSplat) {
      ctx.save();
      ctx.filter = 'blur(0.5px)';
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.9;
    }

    for (let x = 0; x < rebinnedFrames.length; x++) {
      const frame = rebinnedFrames[x];
      const prev = x > 0 ? rebinnedFrames[x - 1] : frame;
      const next = x + 1 < rebinnedFrames.length ? rebinnedFrames[x + 1] : frame;
      const t = x / Math.max(1, rebinnedFrames.length - 1);
      const ease = t * t * (3 - 2 * t);
      const extendPad = craft.extendLive ? 0.18 + ease * 0.08 : 0.08;
      const xLeft = x * cellW - cellW * (isSplat ? 0.2 : 0.12);
      const xRight = (x + 1) * cellW + cellW * extendPad;
      const drawW = Math.max(1, xRight - xLeft);
      const n = frame.prices.length;

      for (let y = 0; y < n; y++) {
        let bidRaw: number;
        let askRaw: number;
        if (isSplat) {
          bidRaw = splatBlend(
            frame.bids[y] ?? 0,
            prev.bids[y] ?? frame.bids[y] ?? 0,
            next.bids[y] ?? frame.bids[y] ?? 0,
            frame.bids[y - 1] ?? frame.bids[y] ?? 0,
            frame.bids[y + 1] ?? frame.bids[y] ?? 0,
          );
          askRaw = splatBlend(
            frame.asks[y] ?? 0,
            prev.asks[y] ?? frame.asks[y] ?? 0,
            next.asks[y] ?? frame.asks[y] ?? 0,
            frame.asks[y - 1] ?? frame.asks[y] ?? 0,
            frame.asks[y + 1] ?? frame.asks[y] ?? 0,
          );
        } else {
          bidRaw =
            (frame.bids[y] ?? 0) * 0.5 +
            (prev.bids[y] ?? frame.bids[y] ?? 0) * 0.2 +
            (next.bids[y] ?? frame.bids[y] ?? 0) * 0.2 +
            (frame.bids[y - 1] ?? frame.bids[y] ?? 0) * 0.05 +
            (frame.bids[y + 1] ?? frame.bids[y] ?? 0) * 0.05;
          askRaw =
            (frame.asks[y] ?? 0) * 0.5 +
            (prev.asks[y] ?? frame.asks[y] ?? 0) * 0.2 +
            (next.asks[y] ?? frame.asks[y] ?? 0) * 0.2 +
            (frame.asks[y - 1] ?? frame.asks[y] ?? 0) * 0.05 +
            (frame.asks[y + 1] ?? frame.asks[y] ?? 0) * 0.05;
        }

        const rawBid = Math.min(1.4, bidRaw * invPeak);
        const rawAsk = Math.min(1.4, askRaw * invPeak);
        if (rawBid < craft.lowIntensity && rawAsk < craft.lowIntensity) continue;

        const bidI = Math.min(1, Math.pow(Math.max(0, rawBid), gamma));
        const askI = Math.min(1, Math.pow(Math.max(0, rawAsk), gamma));
        const py = h - (y + 1) * cellH;
        const drawH = Math.ceil(cellH) + (isSplat ? 2 : 1);

        if (bidI >= askI) {
          ctx.fillStyle = heatmapCellColor(
            craft.colormap,
            'bid',
            bidI,
            alphaFloor + bidI * alphaScale,
          );
          ctx.fillRect(Math.floor(xLeft), Math.floor(py), Math.ceil(drawW) + 1, drawH);
          if (askI > Math.max(0.07, craft.lowIntensity)) {
            ctx.fillStyle = heatmapCellColor(
              craft.colormap,
              'ask',
              askI,
              0.06 + askI * 0.28,
            );
            ctx.fillRect(Math.floor(xLeft), Math.floor(py), Math.ceil(drawW) + 1, drawH);
          }
        } else {
          ctx.fillStyle = heatmapCellColor(
            craft.colormap,
            'ask',
            askI,
            alphaFloor + askI * alphaScale,
          );
          ctx.fillRect(Math.floor(xLeft), Math.floor(py), Math.ceil(drawW) + 1, drawH);
          if (bidI > Math.max(0.07, craft.lowIntensity)) {
            ctx.fillStyle = heatmapCellColor(
              craft.colormap,
              'bid',
              bidI,
              0.06 + bidI * 0.28,
            );
            ctx.fillRect(Math.floor(xLeft), Math.floor(py), Math.ceil(drawW) + 1, drawH);
          }
        }
      }
    }

    if (isSplat) ctx.restore();

    if (mid && frames.length) {
      const prices = rebinnedFrames[rebinnedFrames.length - 1].prices;
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
  }, [heatmap, mid, craft]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-[2px] bg-black/55 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        {craft.binMode.toUpperCase()} · {craft.style} · {craft.colormap}
      </div>
    </div>
  );
}
