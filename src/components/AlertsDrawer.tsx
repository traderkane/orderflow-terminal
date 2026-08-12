import { useMemo, useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import type { AlertCondition, SymbolId } from '../types/market';
import {
  ALERT_CONDITIONS,
  conditionLabel,
  defaultThreshold,
  ensureNotifyPermission,
  formatMetric,
  formatThreshold,
} from '../lib/alerts';
import { fmtTime } from '../lib/format';

const SYMBOLS: SymbolId[] = ['BTC/USD', 'ETH/USD'];

export function AlertsDrawer() {
  const open = useTerminalStore((s) => s.openPanel === 'alerts');
  const setOpenPanel = useTerminalStore((s) => s.setOpenPanel);
  const symbol = useTerminalStore((s) => s.symbol);
  const last = useTerminalStore((s) => s.feed?.stats.last);
  const alerts = useTerminalStore((s) => s.alerts);
  const history = useTerminalStore((s) => s.alertHistory);
  const addAlert = useTerminalStore((s) => s.addAlert);
  const deleteAlert = useTerminalStore((s) => s.deleteAlert);
  const toggleAlertEnabled = useTerminalStore((s) => s.toggleAlertEnabled);
  const rearmAlert = useTerminalStore((s) => s.rearmAlert);
  const clearAlertHistory = useTerminalStore((s) => s.clearAlertHistory);

  const [formSymbol, setFormSymbol] = useState<SymbolId>(symbol);
  const [condition, setCondition] = useState<AlertCondition>('price_above');
  const [threshold, setThreshold] = useState(() =>
    String(defaultThreshold(symbol, 'price_above', last)),
  );
  const [note, setNote] = useState('');
  const [notifyHint, setNotifyHint] = useState('');

  const armedCount = useMemo(
    () => alerts.filter((a) => a.enabled && !a.triggered).length,
    [alerts],
  );

  if (!open) return null;

  const onConditionChange = (c: AlertCondition) => {
    setCondition(c);
    setThreshold(String(defaultThreshold(formSymbol, c, last)));
  };

  const onCreate = () => {
    const n = Number(threshold);
    if (!Number.isFinite(n)) return;
    addAlert({
      symbol: formSymbol,
      condition,
      threshold: n,
      note: note.trim() || undefined,
    });
    setNote('');
  };

  const requestNotify = async () => {
    const perm = await ensureNotifyPermission();
    if (perm === 'granted') setNotifyHint('Browser notifications on');
    else if (perm === 'denied') setNotifyHint('Notifications blocked by browser');
    else if (perm === 'unsupported') setNotifyHint('Notifications unsupported');
    else setNotifyHint('Permission pending');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[1px]">
      <button
        type="button"
        className="h-full flex-1 cursor-default"
        aria-label="Close alerts"
        onClick={() => setOpenPanel(null)}
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-terminal-border bg-terminal-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-terminal-border px-3 py-2.5">
          <div>
            <div className="text-sm font-medium text-zinc-100">Alerts</div>
            <div className="text-[11px] text-terminal-muted">
              {armedCount} armed · cross on live last / funding / OI
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpenPanel(null)}
            className="rounded border border-terminal-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:border-terminal-border-strong hover:text-zinc-200"
          >
            Esc
          </button>
        </div>

        <div className="space-y-2 border-b border-terminal-border p-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
            New alert
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={formSymbol}
              onChange={(e) => setFormSymbol(e.target.value as SymbolId)}
              className="h-7 rounded-[2px] border border-terminal-border bg-terminal-elevated px-1.5 font-mono text-[11px] text-zinc-100 outline-none focus:border-up/40"
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={condition}
              onChange={(e) => onConditionChange(e.target.value as AlertCondition)}
              className="h-7 rounded-[2px] border border-terminal-border bg-terminal-elevated px-1.5 text-[11px] text-zinc-100 outline-none focus:border-up/40"
            >
              {ALERT_CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5">
            <input
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded-[2px] border border-terminal-border bg-terminal-elevated px-2 font-mono text-[11px] text-zinc-100 outline-none focus:border-up/40"
              placeholder="Threshold"
            />
            <button
              type="button"
              onClick={() => {
                if (last != null && condition.startsWith('price')) {
                  setThreshold(String(Math.round(last * 100) / 100));
                }
              }}
              className="h-7 shrink-0 rounded-[2px] border border-terminal-border px-2 text-[10px] uppercase tracking-wider text-terminal-muted hover:text-zinc-200"
              title="Use last price"
            >
              Last
            </button>
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={80}
            placeholder="Note (optional)"
            className="h-7 w-full rounded-[2px] border border-terminal-border bg-terminal-elevated px-2 text-[11px] text-zinc-100 outline-none focus:border-up/40"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCreate}
              className="h-7 flex-1 rounded-[2px] border border-up/30 bg-up/[0.1] text-[10px] font-medium uppercase tracking-wider text-up hover:bg-up/20"
            >
              Create
            </button>
            <button
              type="button"
              onClick={requestNotify}
              className="h-7 rounded-[2px] border border-terminal-border px-2 text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
              title="Enable browser notifications"
            >
              Notify
            </button>
          </div>
          {notifyHint && (
            <div className="text-[10px] text-terminal-muted">{notifyHint}</div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <section className="border-b border-terminal-border p-3">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
              Active ({alerts.length})
            </div>
            {alerts.length === 0 ? (
              <div className="rounded border border-dashed border-terminal-border px-3 py-4 text-center text-[11px] text-terminal-muted">
                No alerts yet — create a price above / below cross.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {alerts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded border border-terminal-border bg-terminal-elevated px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] text-zinc-100">{a.symbol}</span>
                          <span className="text-[10px] text-terminal-muted">
                            {conditionLabel(a.condition)}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-200">
                            {formatThreshold(a.condition, a.threshold)}
                          </span>
                        </div>
                        {a.note && (
                          <div className="mt-0.5 truncate text-[10px] text-terminal-muted">
                            {a.note}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={`rounded px-1 py-px text-[9px] uppercase tracking-wider ${
                              a.triggered
                                ? 'bg-accent/15 text-accent'
                                : a.enabled
                                  ? 'bg-up/15 text-up'
                                  : 'bg-zinc-800 text-terminal-muted'
                            }`}
                          >
                            {a.triggered ? 'Triggered' : a.enabled ? 'Armed' : 'Off'}
                          </span>
                          {a.triggeredAt && (
                            <span className="font-mono text-[9px] text-terminal-label">
                              {fmtTime(a.triggeredAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        {a.triggered ? (
                          <button
                            type="button"
                            onClick={() => rearmAlert(a.id)}
                            className="rounded border border-terminal-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-400 hover:text-zinc-100"
                          >
                            Rearm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleAlertEnabled(a.id)}
                            className="rounded border border-terminal-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-400 hover:text-zinc-100"
                          >
                            {a.enabled ? 'Pause' : 'Arm'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteAlert(a.id)}
                          className="rounded border border-terminal-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-down/80 hover:bg-down/10 hover:text-down"
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-terminal-label">
                Recent fires ({history.length})
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearAlertHistory}
                  className="text-[9px] uppercase tracking-wider text-terminal-muted hover:text-zinc-300"
                >
                  Clear
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="text-[11px] text-terminal-muted">No triggers yet.</div>
            ) : (
              <ul className="space-y-1">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-start justify-between gap-2 rounded border border-terminal-border/80 bg-[#080a0e] px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] text-zinc-200">{h.message}</div>
                      <div className="mt-0.5 font-mono text-[9px] text-terminal-label">
                        value {formatMetric(h.condition, h.value)}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-terminal-muted">
                      {fmtTime(h.firedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
