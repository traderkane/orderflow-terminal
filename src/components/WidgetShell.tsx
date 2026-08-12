import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function WidgetShell({ title, onClose, actions, children, className }: Props) {
  return (
    <div
      className={`widget-shell flex h-full min-h-0 flex-col overflow-hidden rounded-[2px] border border-terminal-border bg-terminal-panel shadow-panel ${className ?? ''}`}
    >
      <div className="drag-handle group flex h-6 shrink-0 cursor-grab items-center justify-between border-b border-terminal-border/80 bg-[#080a0e] px-1.5 active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="drag-grip" aria-hidden>
            <span /><span /><span /><span /><span /><span />
          </span>
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-1 py-0.5 text-[11px] leading-none text-zinc-600 opacity-60 transition hover:bg-white/[0.04] hover:text-zinc-300 hover:opacity-100 group-hover:opacity-100"
              title="Remove widget"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-terminal-panel">{children}</div>
    </div>
  );
}
