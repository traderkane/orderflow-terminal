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
import {
  SideDrawer,
  drawerEmpty,
  drawerField,
  drawerGhostBtn,
  drawerPrimaryBtn,
  drawerSectionLabel,
} from './SideDrawer';

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
    <SideDrawer
      open={open}
      title="Alerts"
      subtitle={`${armedCount} armed · last / funding / OI`}
      onClose={() => setOpenPanel(null)}
      closeLabel="Close alerts"
    >
      <div className="space-y-1.5 border-b border-terminal-border px-2.5 py-2">
        <div className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-terminal-label">
          New alert
        </div>
        <div className="grid grid-cols-2 gap-1">
          <select
            value={formSymbol}
            onChange={(e) => setFormSymbol(e.target.value as SymbolId)}
            className={drawerField}
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
            className={`${drawerField} font-sans`}
          >
            {ALERT_CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          <input
            type="number"
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className={`${drawerField} flex-1`}
            placeholder="Threshold"
          />
          <button
            type="button"
            onClick={() => {
              if (last != null && condition.startsWith('price')) {
                setThreshold(String(Math.round(last * 100) / 100));
              }
            }}
            className={drawerGhostBtn}
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
          className={`${drawerField} w-full font-sans`}
        />
        <div className="flex items-center gap-1">
          <button type="button" onClick={onCreate} className={`${drawerPrimaryBtn} flex-1`}>
            Create
          </button>
          <button
            type="button"
            onClick={requestNotify}
            className={drawerGhostBtn}
            title="Enable browser notifications"
          >
            Notify
          </button>
        </div>
        {notifyHint && (
          <div className="font-mono text-[9px] text-terminal-label">{notifyHint}</div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <section>
          <div className={drawerSectionLabel}>Active ({alerts.length})</div>
          {alerts.length === 0 ? (
            <div className={drawerEmpty}>No alerts — create a price above / below cross.</div>
          ) : (
            <ul className="divide-y divide-terminal-border/80 border-y border-terminal-border/80">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-2 px-2.5 py-1.5 hover:bg-white/[0.015]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="font-mono text-[11px] text-zinc-100">{a.symbol}</span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-terminal-muted">
                        {conditionLabel(a.condition)}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-zinc-300">
                        {formatThreshold(a.condition, a.threshold)}
                      </span>
                    </div>
                    {a.note && (
                      <div className="mt-0.5 truncate text-[10px] text-terminal-muted">{a.note}</div>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className={`font-mono text-[9px] uppercase tracking-wider ${
                          a.triggered
                            ? 'text-accent'
                            : a.enabled
                              ? 'text-up'
                              : 'text-terminal-label'
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
                  <div className="flex shrink-0 flex-col gap-px">
                    {a.triggered ? (
                      <button
                        type="button"
                        onClick={() => rearmAlert(a.id)}
                        className={drawerGhostBtn}
                      >
                        Rearm
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleAlertEnabled(a.id)}
                        className={drawerGhostBtn}
                      >
                        {a.enabled ? 'Pause' : 'Arm'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteAlert(a.id)}
                      className={`${drawerGhostBtn} text-down/70 hover:text-down`}
                    >
                      Del
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pb-3">
          <div className={`${drawerSectionLabel} flex items-center justify-between`}>
            <span>Recent fires ({history.length})</span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearAlertHistory}
                className="font-mono text-[9px] uppercase tracking-wider text-terminal-muted hover:text-zinc-300"
              >
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className={drawerEmpty}>No triggers yet.</div>
          ) : (
            <ul className="divide-y divide-terminal-border/70">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start justify-between gap-2 px-2.5 py-1.5 hover:bg-white/[0.015]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-zinc-300">{h.message}</div>
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
    </SideDrawer>
  );
}
