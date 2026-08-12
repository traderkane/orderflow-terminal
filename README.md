# Flow Terminal (Orderflow)

MMT-inspired browser crypto **order-flow trading terminal** with a dark multi-widget layout and slim left app rail (Terminal / Layouts / Alerts / +Widget / theme).

Data sources:

- **Live (default)** — multi-venue public WebSockets (Binance USDT-M, Bybit linear, OKX swap) + REST bootstrap (no API keys)
- **Mock** — local simulated feed for offline demo / fallback

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

Production build:

```bash
npm run build
npm run preview
```

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS (dark trading UI)
- lightweight-charts (candles / CVD)
- Zustand (state + feed subscription)
- react-grid-layout (resizable widget grid, persisted to localStorage)

## Widgets

1. **Chart** — TradingView/MMT-style workspace: **Candles | Footprint** mode switch; left icon drawing rail (select / H-Line / Trend / Rect / Fib / Magnet / Eraser / Clear), bottom **layer dock** (favorites **Heatmap / VWAP / CVD** + **Layers** checklist for Profile / Bubbles / Bars / Count / Liqs), TF pills **1m / 5m / 15m / 1h**; Footprint mode paints clustered sell|buy volumes inside each bar with delta tint + imbalance outlines + stacked/diagonal imbalance chains (≥3 bars, same or ±1 step) + naked POC diamonds until traded through (best at 1m; denser/compact on higher TFs); selected-drawing properties mini-panel (color / width / extend L-R / delete); magnet snap to candle OHLC+mid; maximize chart from header (**F** / Esc); drag-to-move drawings with handles; **session VWAP** (Day/Week/24h anchors, multi-plot) / **Bars** (volume|delta intensity) / **Count** (buy vs sell trade-count dual histogram); layer visibility persisted (`flow-terminal-chart-layers-v1`); drawings (+styles) persisted per symbol
2. **Order Book / DOM** — bids/asks, depth bars, spread; chart↔DOM↔tape hover cohesion (shared `hoverPrice` — chart crosshair highlights nearest ladder row; DOM/tape row hover draws a subtle chart price line)
3. **Trades Tape** — scrolling aggressor buys/sells with size highlighting; row hover syncs chart line + DOM highlight; click briefly flashes that price on the chart
4. **Order Book Heatmap** — canvas time × price liquidity
5. **CVD / Volume Delta** — cumulative delta line + per-bar histogram
6. **Volume Profile** — VPVR-style buy/sell profile with POC
7. **Footprint** — detail side table of clustered bid/ask volume (main chart also has Footprint mode)
8. **Liquidations** — forced order feed
9. **Liq Map** — modelled leverage-ladder liquidation density around mark
10. **TPO / Profile** — Market Profile letters (time spent at price), POC + value area
11. **Stats** — last, change, funding, OI, spread, volume

## Live multi-venue feed

`src/data/liveFeed.ts` aggregates selected venues from `src/data/venues/`:

| Venue | Instruments | Streams |
| --- | --- | --- |
| **Binance** | `btcusdt` / `ethusdt` USDT-M | `aggTrade`, `depth20@100ms`, `kline_{TF}`, `markPrice`, `!forceOrder@arr` |
| **Bybit** | `BTCUSDT` / `ETHUSDT` linear | `publicTrade`, `orderbook.50`, `tickers` |
| **OKX** | `BTC-USDT-SWAP` / `ETH-USDT-SWAP` | `trades`, `books5`, `funding-rate` |

Symbols: searchable top-bar picker (**BTC/USD** / **ETH/USD**, extend via `UI_SYMBOLS` in `venues/symbols.ts`) → each venue USDT perpetual id. Watchlist strip under the top bar switches the active symbol and caches last-seen prices/% change.

Live venue chips subscribe/unsubscribe that exchange. Multi-select merges trades tape (exchange tags), CVD, order book (sizes summed at price), and heatmap from the merged book. Single-venue still works.

### OKX gaps

- `books5` is top **5** levels only (thinner than Binance depth20 / Bybit 50).
- No OKX liquidation stream yet (Binance `forceOrder` when Binance is selected).
- Chart/24h bootstrap prefers Binance; else Bybit/OKX REST klines.

Resilience notes:

- Binance REST prefers `fapi.binance.com`, then `data-api.binance.vision` when futures REST is geo-blocked.
- Binance futures WS is primary; spot Vision fallback for tape/klines if futures aggTrade is filtered.
- If no selected venue becomes live within ~12s, the app falls back to mock.



## Session VWAP & bar stats

Chart layer dock (MMT-style):

- Favorites on the dock: **Heatmap**, **VWAP▾**, **CVD**
- **Layers** opens a compact checklist — **Overlays** (Profile, Bubbles, Bars) and **Studies** (Count, Liqs). Visibility for Heatmap / Profile / Bubbles / VWAP / CVD / Liqs persists as `flow-terminal-chart-layers-v1`.
- **VWAP** — session-anchored lines computed from candle typical price × volume (`(H+L+C)/3`). Anchors (multi-select, persisted as `flow-terminal-vwap-anchors-v1`):
  - **Session / Day** — resets at UTC midnight (solid gold)
  - **Week** — resets Monday 00:00 UTC (dashed violet)
  - **Rolling 24h** — trailing 24h window (dotted cyan)
  - Day + Week can plot together. History is capped by the rolling candle buffer (~240 bars), so Week/24h on low TFs only cover the available window.
- **Bars** — MMT-style bar-stats lite: grades candle body/wick intensity by **Volume** or **Delta** vs a 20-bar trailing average (persisted `flow-terminal-bar-stats-v1` / `…-metric-v1`). Direction stays green/red; brightness encodes relative size. Disabled visually in Footprint mode so clusters stay readable.
- **Count** — MMT-style trade counter: switches the bottom volume pane between **Volume** (default) and a dual histogram of per-candle **buy vs sell trade counts** (green up / red down). Counts accumulate from aggressor trades at the active chart TF (`flow-terminal-volume-pane-v1`). REST/synthetic history is volume-estimated until live ticks replace the current bar.

## Chart timeframes & modes

Toolbar on the chart: **Candles | Footprint** mode (stored as `flow-terminal-chart-mode-v1`) and TF pills **1m · 5m · 15m · 1h** (`flow-terminal-chart-interval-v1`).

- **Live** — Binance futures REST + WS klines rebootstrap/resubscribe for the selected interval (Bybit/OKX REST history when Binance is deselected).
- **Mock** — synthetic candles regenerated at the selected TF.
- **Footprint mode** — overlays clustered sell|buy at price on the main chart, aligned to the active TF (aggregates 1m footprint + recent trades; seeds coarse levels from candle volume when live cluster history is thin). Single-cell ≥3:1 imbalance outlines stay; **stacked/diagonal** same-side imbalances across adjacent bars (flat or ±1 price step, min 3) get brighter edges, wash, and a connector. **Naked POCs** (unfinished auctions): each bar’s max-volume price is marked with a gold diamond until a later candle’s range trades through that level.
- **Limitation** — the side Footprint widget table stays on **1m** buckets. Chart Footprint on 5m/15m/1h is denser and often number-less when bars are narrow; full MMT-style tick-perfect historical clusters need a dedicated footprint store (not just the rolling live window). TPO builds from the active chart candles.

## Mock feed

`src/data/mockFeed.ts` generates a random-walk mid, trades, book, candles, CVD, heatmap frames, and occasional liquidations.

- Start / pause from the top bar
- Speed **1x / 2x** (mock only)
- Venue multi-select: Binance / Bybit / OKX (mock tags)

## Alerts

App rail **Alerts** opens a right slide-over to create / list / delete alerts (persisted in `localStorage`).

- Conditions: **price above / below** (primary), plus optional **funding** and **OI** crosses
- Evaluated on each feed tick against live `stats.last` (and funding / OI)
- On fire: toast banner + optional browser `Notification` (click **Notify** to permit)
- Alert latches as triggered; **Rearm** to watch again; recent fires kept in history

## Layout

- Drag widgets from the header handle; resize from corners
- Layout + widget set persist in `localStorage` (`flow-terminal-layout-v9` / `flow-terminal-widgets-v9`)
- **Watchlist strip** under the top bar: multi-symbol chips (**BTC/USD**, **ETH/USD**) with last + % change; click to switch the active symbol; optional **+** adds from the symbol list; remove via chip **×**. Persists as `flow-terminal-watchlist-v1`; last-seen quotes cache as `flow-terminal-last-quotes-v1` (live for the active symbol, stale/cached for inactive).
- **Layout tabs** under the top bar: quick-switch **Scalp / Profile / Default** (+ user-saved templates); optional **+** saves current as a new tab
- **Layouts** drawer (app rail): slide-over matching layout-tab language — save current grid, load Scalp/Profile/Default or user tabs
- Built-in presets: **Scalp** (chart + right **Book | Tape** tab dock + bottom **Heatmap | CVD | Liqs | Stats** dock), **Profile** (chart + profile dock **TPO | VPVR | Footprint** + right **Book | Tape** + bottom **Heatmap | CVD**)
- **Tab docks** share one chrome frame with browser/MMT-style tabs; standalone widgets remain available via the launcher
- **Reset layout** restores the chart-dominant pro workspace
- **+ Widget** launcher adds another panel instance

## Chart drawings

Toolbar (top-right of the chart widget):

- **H-Line** — click the chart to place a horizontal at that price (price label on the right)
- **Trend** — two clicks for a trend line (rubber-band preview)
- **Rect** — two clicks for opposite corners of a rectangle
- **Fib** — two clicks for a Fibonacci retracement (levels 0 / 0.236 / 0.382 / 0.5 / 0.618 / 0.786 / 1) with price labels
- **Clear** — remove all drawings for the active symbol

Click a drawing to select it (amber highlight). Press **Delete** / **Backspace**, or the small **×**, to remove one. **Esc** cancels the active tool / draft / selection. Drawings persist in `localStorage` keyed by symbol and redraw above Heatmap / Profile / Bubbles.

## License

MIT
