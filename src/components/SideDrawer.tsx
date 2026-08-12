import type { ReactNode } from 'react';

interface SideDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Accessible name for the dismiss scrim */
  closeLabel?: string;
}

/**
 * Right slide-over panel that sits beside the AppRail (does not cover it),
 * so rail open/close toggles stay usable. Soft scrim — not a Bootstrap modal.
 */
export function SideDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  closeLabel = 'Close panel',
}: SideDrawerProps) {
  return (
    <div
      className={`fixed inset-y-0 left-10 right-0 z-40 ${
        open ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label={closeLabel}
        onClick={onClose}
        className={`side-drawer-scrim absolute inset-0 cursor-default bg-black/45 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`side-drawer-panel absolute inset-y-0 right-0 flex w-full max-w-[20rem] flex-col border-l border-terminal-border bg-[#06080c] shadow-[-12px_0_32px_rgba(0,0,0,0.45)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-terminal-border px-2.5">
          <div className="min-w-0">
            <div className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-200">
              {title}
            </div>
            {subtitle && (
              <div className="truncate font-mono text-[9px] leading-none text-terminal-label">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label={`Close ${title}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] font-mono text-[13px] leading-none text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
          >
            ×
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </aside>
    </div>
  );
}

export const drawerSectionLabel =
  'px-2.5 pt-2.5 pb-1 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-terminal-label';

export const drawerField =
  'h-6 min-w-0 rounded-[2px] border border-terminal-border bg-[#080a0e] px-1.5 font-mono text-[10px] text-zinc-200 outline-none placeholder:text-terminal-label focus:border-terminal-border-strong';

export const drawerGhostBtn =
  'h-6 shrink-0 rounded-[2px] px-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-terminal-muted transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-35';

export const drawerPrimaryBtn =
  'h-6 shrink-0 rounded-[2px] bg-up/[0.12] px-2 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-up transition-colors hover:bg-up/20 disabled:opacity-35';

export const drawerEmpty =
  'px-2.5 py-3 text-center font-mono text-[10px] leading-relaxed text-terminal-muted';
