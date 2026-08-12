import { useEffect, useRef } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';

export function ToastStack() {
  const toasts = useTerminalStore((s) => s.toasts);
  const dismissToast = useTerminalStore((s) => s.dismissToast);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    for (const t of toasts) {
      if (seen.current.has(t.id)) continue;
      seen.current.add(t.id);
      const ms = t.kind === 'alert' ? 8000 : 4000;
      window.setTimeout(() => {
        dismissToast(t.id);
        seen.current.delete(t.id);
      }, ms);
    }
  }, [toasts, dismissToast]);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[60] flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto overflow-hidden rounded-[2px] border shadow-panel ${
            t.kind === 'alert'
              ? 'border-accent/40 bg-[#12100a]'
              : 'border-terminal-border bg-terminal-panel'
          }`}
        >
          <div className="flex items-start gap-2 px-2.5 py-2">
            <span
              className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                t.kind === 'alert' ? 'bg-accent' : 'bg-up'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-zinc-100">{t.title}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-zinc-400">{t.body}</div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="rounded-[2px] px-1 text-[11px] text-zinc-600 hover:text-zinc-300"
            >
              ×
            </button>
          </div>
          {t.kind === 'alert' && <div className="h-0.5 bg-accent/70" />}
        </div>
      ))}
    </div>
  );
}
