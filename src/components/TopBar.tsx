import { useTerminalStore } from "../store/useTerminalStore";
import type { ExchangeId, SymbolId } from "../types/market";
import type { FeedMode } from "../data/feedTypes";

const SYMBOLS: SymbolId[] = ["BTC/USD", "ETH/USD"];
const EXCHANGES: ExchangeId[] = ["Binance", "Bybit", "OKX"];

export function TopBar() {
  const symbol = useTerminalStore((s) => s.symbol);
  const exchanges = useTerminalStore((s) => s.exchanges);
  const speed = useTerminalStore((s) => s.speed);
  const status = useTerminalStore((s) => s.status);
  const feedMode = useTerminalStore((s) => s.feedMode);
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const setFeedMode = useTerminalStore((s) => s.setFeedMode);
  const toggleExchange = useTerminalStore((s) => s.toggleExchange);
  const setSpeed = useTerminalStore((s) => s.setSpeed);
  const toggleFeed = useTerminalStore((s) => s.toggleFeed);
  const resetLayout = useTerminalStore((s) => s.resetLayout);
  const setLauncherOpen = useTerminalStore((s) => s.setLauncherOpen);
  const stats = useTerminalStore((s) => s.feed?.stats);

  const up = (stats?.change24h ?? 0) >= 0;
  const live = feedMode === "live";

  const statusDot =
    status === "live"
      ? "animate-pulse bg-emerald-400"
      : status === "connecting"
        ? "animate-pulse bg-sky-400"
        : status === "error"
          ? "bg-rose-500"
          : "bg-amber-400";

  return (
    <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-terminal-border bg-[#080b11] px-2.5">
      <div className="flex items-center gap-2 pr-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-emerald-500/15 text-xs font-bold text-emerald-400">
          Φ
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-wide text-zinc-100">Flow Terminal</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Orderflow</div>
        </div>
      </div>

      <div className="h-6 w-px bg-terminal-border" />

      <select
        value={symbol}
        onChange={(e) => setSymbol(e.target.value as SymbolId)}
        className="rounded border border-terminal-border bg-terminal-panel px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-500/50"
      >
        {SYMBOLS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <div className="flex overflow-hidden rounded border border-terminal-border">
        {([
          ["live", "Live"],
          ["mock", "Mock"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setFeedMode(mode as FeedMode)}
            className={`px-2 py-1 text-[11px] ${
              feedMode === mode
                ? mode === "live"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            title={mode === "live" ? "Binance USDT-M futures (public WS)" : "Local simulated feed"}
          >
            {label}
          </button>
        ))}
      </div>

      {live ? (
        <span className="hidden rounded border border-terminal-border px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 sm:inline">
          Binance USDT-M
        </span>
      ) : (
        <div className="flex items-center gap-1">
          {EXCHANGES.map((ex) => {
            const on = exchanges.includes(ex);
            return (
              <button
                key={ex}
                type="button"
                onClick={() => toggleExchange(ex)}
                className={`rounded border px-2 py-1 text-[11px] ${
                  on
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-terminal-border bg-transparent text-zinc-500"
                }`}
              >
                {ex}
              </button>
            );
          })}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {stats && (
          <div className="hidden items-baseline gap-2 md:flex">
            <span className="font-mono text-sm text-zinc-100">
              {stats.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className={`font-mono text-xs ${up ? "text-up" : "text-down"}`}>
              {up ? "+" : ""}
              {stats.changePct24h.toFixed(2)}%
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 rounded border border-terminal-border px-2 py-1">
          <span className={`h-2 w-2 rounded-full ${statusDot}`} />
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">{status}</span>
        </div>

        <button
          type="button"
          onClick={toggleFeed}
          className="rounded border border-terminal-border px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
        >
          {status === "live" || status === "connecting" ? "Pause" : "Start"}
        </button>

        {!live && (
          <div className="flex overflow-hidden rounded border border-terminal-border">
            {([1, 2] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 text-[11px] ${
                  speed === s ? "bg-zinc-800 text-zinc-100" : "text-zinc-500"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setLauncherOpen(true)}
          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20"
        >
          + Widget
        </button>

        <button
          type="button"
          onClick={resetLayout}
          className="rounded border border-terminal-border px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Reset layout
        </button>
      </div>
    </header>
  );
}
