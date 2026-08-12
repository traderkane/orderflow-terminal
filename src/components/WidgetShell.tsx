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
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-sm border border-terminal-border bg-terminal-panel shadow-panel ${className ?? ''}`}
    >
      <div className="drag-handle flex h-7 shrink-0 cursor-move items-center justify-between border-b border-terminal-border bg-terminal-panel/90 px-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              title="Remove widget"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
