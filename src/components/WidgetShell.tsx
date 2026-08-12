import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  onClose?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function WidgetShell({ title, onClose, actions, children, className }: Props) {
  return (
    <div
      className={`widget-shell flex h-full min-h-0 flex-col overflow-hidden border border-terminal-border bg-terminal-panel ${className ?? ''}`}
    >
      <div className="drag-handle group flex h-6 shrink-0 cursor-grab items-center justify-between border-b border-terminal-border bg-terminal-header px-1.5 active:cursor-grabbing">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <span className="drag-grip shrink-0" aria-hidden>
            <span /><span /><span /><span /><span /><span />
          </span>
          {typeof title === 'string' ? (
            <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
              {title}
            </span>
          ) : (
            title
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-5 w-5 items-center justify-center rounded-[2px] font-mono text-[12px] leading-none text-zinc-600 opacity-0 transition hover:bg-white/[0.05] hover:text-zinc-200 group-hover:opacity-100"
              title="Remove widget"
              aria-label="Remove widget"
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
