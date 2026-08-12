import { useTerminalStore } from "../store/useTerminalStore";
import type { ExchangeId, FeedStatus, SymbolId } from "../types/market";
import type { FeedMode } from "../data/feedTypes";
import { fmtPct, fmtPrice } from "../lib/format";

const SYMBOLS: SymbolId[] = ["BTC/USD", "ETH/USD"];
const EXCHANGES: ExchangeId[] = ["Binance", "Bybit", "OKX"];

function venueDot(status: FeedStatus | undefined, selected: boolean) {
  if (!selected) return "bg-zinc-700";
  if (status === "live") return "bg-up";
  if (status === "connecting") return "animate-pulse bg-sky-400";
  if (status === "error") return "bg-down";
  return "bg-amber-400";
}

export function TopBar() {
  const symbol = useTerminalStore((s) => s.symbol);
  const exchanges = useTerminalStore((s) => s.exchanges);
  const speed = useTerminalStore((s) => s.speed);
  const status = useTerminalStore((s) => s.status);
  const venueStatus = useTerminalStore((s) => s.venueStatus);
  const feedMode = useTerminalStore((s) => s.feedMode);
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const setFeedMode = useTerminalStore((s) => s.setFeedMode);
  const toggleExchange = useTerminalStore((s) => s.toggleExchange);
  const setSpeed = useTerminalStore((s) => s.setSpeed);
  const toggleFeed = useTerminalStore((s) => s.toggleFeed);
  const resetLayout = useTerminalStore((s) => s.resetLayout);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);
  const setOpenPanel = useTerminalStore((s) => s.setOpenPanel);
  const openPanel = useTerminalStore((s) => s.openPanel);
  const armedAlerts = useTerminalStore(
    (s) => s.alerts.filter((a) => a.enabled && !a.triggered).length,
  );
  const stats = useTerminalStore((s) => s.feed?.stats);

  const up = (stats?.change24h ?? 0) >= 0;
  const live = feedMode === "live";

  const statusDot =
    status === "live"
      ? "animate-pulse bg-up"
      : status === "connecting"
        ? "animate-pulse bg-sky-400"
        : status === "error"
          ? "bg-down"
          : "bg-amber-400";

  return (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-terminal-border bg-[#07090d] px-2">
      <div className="flex items-center gap-1.5 pr-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-[2px] bg-up/15 text-[11px] font-bold text-up">
          Φ
        </div>
        <div className="leading-none">
          <div className="text-[12px] font-semibold tracking-wide text-zinc-100">Flow</div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-terminal-label">Terminal</div>
        </div>
      </div>

      <div className="h-4 w-px bg-terminal-border" />

      <select
        value={symbol}
        onChange={(e) => setSymbol(e.target.value as SymbolId)}
        className="h-6 rounded-[2px] border border-terminal-border bg-terminal-elevated px-1.5 font-mono text-[11px] text-zinc-100 outline-none focus:border-up/40"
      >
        {SYMBOLS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <div className="flex h-6 overflow-hidden rounded-[2px] border border-terminal-border">
        {(
          [
            ["live", "Live"],
            ["mock", "Mock"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setFeedMode(mode as FeedMode)}
            className={`px-2 text-[10px] font-medium uppercase tracking-wider ${
              feedMode === mode
                ? mode === "live"
                  ? "bg-up/15 text-up"
                  : "bg-zinc-800 text-zinc-100"
                : "text-terminal-muted hover:text-zinc-300"
            }`}
            title={
              mode === "live"
                ? "Multi-venue public WS (Binance / Bybit / OKX)"
                : "Local simulated feed"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-0.5">
        {EXCHANGES.map((ex) => {
          const on = exchanges.includes(ex);
          const vStatus = venueStatus[ex];
          return (
            <button
              key={ex}
              type="button"
              onClick={() => toggleExchange(ex)}
              title={
                live
                  ? on
                    ? `${ex}: ${vStatus}`
                    : `${ex}: off (click to subscribe)`
                  : on
                    ? `${ex} mock tag on`
                    : `${ex} mock tag off`
              }
              className={`flex h-6 items-center gap-1 rounded-[2px] border px-1.5 text-[10px] ${
                on
                  ? "border-up/30 bg-up/[0.08] text-up"
                  : "border-transparent text-terminal-muted hover:border-terminal-border hover:text-zinc-400"
              }`}
            >
              {live && <span className={`h-1.5 w-1.5 rounded-full ${venueDot(vStatus, on)}`} />}
              {ex.slice(0, 3)}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {stats && (
          <div className="hidden items-baseline gap-2 md:flex">
            <span className="font-mono text-[13px] font-medium tabular-nums text-zinc-100">
              {fmtPrice(stats.last, 2)}
            </span>
            <span className={`font-mono text-[11px] tabular-nums ${up ? "text-up" : "text-down"}`}>
              {fmtPct(stats.changePct24h)}
            </span>
          </div>
        )}

        <div className="flex h-6 items-center gap-1.5 rounded-[2px] border border-terminal-border px-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          <span className="text-[10px] uppercase tracking-wider text-terminal-muted">{status}</span>
        </div>

        <button
          type="button"
          onClick={toggleFeed}
          className="h-6 rounded-[2px] border border-terminal-border px-2 text-[10px] uppercase tracking-wider text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
        >
          {status === "live" || status === "connecting" ? "Pause" : "Start"}
        </button>

        {!live && (
          <div className="flex h-6 overflow-hidden rounded-[2px] border border-terminal-border">
            {([1, 2] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`px-1.5 font-mono text-[10px] ${
                  speed === s ? "bg-zinc-800 text-zinc-100" : "text-terminal-muted"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpenPanel(openPanel === "alerts" ? null : "alerts")}
          className={`relative h-6 rounded-[2px] border px-2 text-[10px] font-medium uppercase tracking-wider ${
            openPanel === "alerts"
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-terminal-border text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
          }`}
          title="Price / funding / OI alerts"
        >
          Alerts
          {armedAlerts > 0 && (
            <span className="ml-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent/20 px-1 font-mono text-[9px] text-accent">
              {armedAlerts}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setOpenPanel(openPanel === "layouts" ? null : "layouts")}
          className={`h-6 rounded-[2px] border px-2 text-[10px] font-medium uppercase tracking-wider ${
            openPanel === "layouts"
              ? "border-up/40 bg-up/10 text-up"
              : "border-terminal-border text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
          }`}
          title="Layout templates"
        >
          Layouts
        </button>

        <button
          type="button"
          onClick={() => setLauncherOpen(true)}
          className="h-6 rounded-[2px] border border-up/25 bg-up/[0.08] px-2 text-[10px] font-medium uppercase tracking-wider text-up hover:bg-up/15"
        >
          + Widget
        </button>

        <button
          type="button"
          onClick={resetLayout}
          className="h-6 rounded-[2px] border border-terminal-border px-2 text-[10px] uppercase tracking-wider text-terminal-muted hover:bg-white/[0.03] hover:text-zinc-300"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
