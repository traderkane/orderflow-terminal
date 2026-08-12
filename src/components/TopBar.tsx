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

const ghostBtn =
  "h-6 rounded-[2px] px-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-terminal-muted transition-colors hover:bg-white/[0.04] hover:text-zinc-300";

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
    <header className="topbar flex h-8 shrink-0 items-center gap-1.5 border-b border-terminal-border bg-[#06080c] px-2">
      {/* Mark */}
      <div className="flex items-center gap-1.5 pr-1" title="Flow Terminal">
        <div className="flex h-4 w-4 items-center justify-center rounded-[2px] bg-up/15 text-[10px] font-bold leading-none text-up">
          Φ
        </div>
        <span className="hidden text-[11px] font-semibold tracking-wide text-zinc-300 sm:inline">
          Flow
        </span>
      </div>

      <div className="h-3.5 w-px shrink-0 bg-terminal-border" />

      {/* Dominant: symbol + last + change */}
      <div className="flex min-w-0 items-baseline gap-2">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value as SymbolId)}
          className="h-6 max-w-[7.5rem] cursor-pointer appearance-none rounded-[2px] border-0 bg-transparent py-0 pl-0.5 pr-4 font-mono text-[12px] font-semibold tracking-wide text-zinc-100 outline-none hover:bg-white/[0.03] focus:bg-white/[0.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='%236b7280' d='M1.5 2.5L4 5.5L6.5 2.5'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 2px center",
          }}
          aria-label="Symbol"
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {stats ? (
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[13px] font-semibold tabular-nums leading-none text-zinc-50">
              {fmtPrice(stats.last, 2)}
            </span>
            <span
              className={`font-mono text-[11px] tabular-nums leading-none ${
                up ? "text-up" : "text-down"
              }`}
            >
              {fmtPct(stats.changePct24h)}
            </span>
          </div>
        ) : (
          <span className="font-mono text-[11px] text-terminal-muted">—</span>
        )}
      </div>

      <div className="mx-0.5 h-3.5 w-px shrink-0 bg-terminal-border" />

      {/* Feed mode — quiet segmented */}
      <div className="flex h-5 items-stretch overflow-hidden rounded-[2px] bg-white/[0.03]">
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
            className={`px-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
              feedMode === mode
                ? mode === "live"
                  ? "bg-up/15 text-up"
                  : "bg-zinc-800/80 text-zinc-100"
                : "text-terminal-muted hover:text-zinc-400"
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

      {/* Venues — quiet chips */}
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
              className={`flex h-5 items-center gap-1 rounded-[2px] px-1.5 text-[9px] font-medium uppercase tracking-wider transition-colors ${
                on
                  ? "bg-up/[0.1] text-up"
                  : "text-terminal-muted hover:bg-white/[0.03] hover:text-zinc-400"
              }`}
            >
              {live && (
                <span className={`h-1 w-1 rounded-full ${venueDot(vStatus, on)}`} />
              )}
              {ex.slice(0, 3)}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        {/* Status pill — refined */}
        <div
          className="mr-1 flex h-5 items-center gap-1.5 rounded-[2px] bg-white/[0.03] px-1.5"
          title={`Feed status: ${status}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
          <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-terminal-muted">
            {status}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleFeed}
          className={ghostBtn}
          title={status === "live" || status === "connecting" ? "Pause feed" : "Start feed"}
        >
          {status === "live" || status === "connecting" ? "Pause" : "Start"}
        </button>

        {!live && (
          <div className="ml-0.5 flex h-5 overflow-hidden rounded-[2px] bg-white/[0.03]">
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

        <div className="mx-1 h-3.5 w-px shrink-0 bg-terminal-border" />

        <button
          type="button"
          onClick={() => setOpenPanel(openPanel === "alerts" ? null : "alerts")}
          className={`relative ${
            openPanel === "alerts"
              ? "h-6 rounded-[2px] bg-accent/10 px-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-accent"
              : ghostBtn
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
          className={
            openPanel === "layouts"
              ? "h-6 rounded-[2px] bg-white/[0.06] px-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-100"
              : ghostBtn
          }
          title="Layout templates"
        >
          Layouts
        </button>

        <button
          type="button"
          onClick={() => setLauncherOpen(true)}
          className="h-6 rounded-[2px] px-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-up/90 transition-colors hover:bg-up/[0.1] hover:text-up"
          title="Add widget"
        >
          + Widget
        </button>

        <button
          type="button"
          onClick={resetLayout}
          className={ghostBtn}
          title="Reset to Scalp layout"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
