# Flow Terminal (Orderflow)

MMT-inspired browser crypto **order-flow trading terminal** with a dark multi-widget layout.

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

1. **Chart** — candles + volume; toggles for Heatmap, VPVR Profile, trade Bubbles, VWAP, CVD, liquidation markers; drawing tools (H-Line / Trend / Rect / Fib / Clear) persisted per symbol
2. **Order Book / DOM** — bids/asks, depth bars, spread
3. **Trades Tape** — scrolling aggressor buys/sells with size highlighting
4. **Order Book Heatmap** — canvas time × price liquidity
5. **CVD / Volume Delta** — cumulative delta line + per-bar histogram
6. **Volume Profile** — VPVR-style buy/sell profile with POC
7. **Footprint** — candle-aligned clustered bid/ask volume with imbalance highlights
8. **Liquidations** — forced order feed
9. **Liq Map** — modelled leverage-ladder liquidation density around mark
10. **TPO / Profile** — Market Profile letters (time spent at price), POC + value area
11. **Stats** — last, change, funding, OI, spread, volume

## Live multi-venue feed

`src/data/liveFeed.ts` aggregates selected venues from `src/data/venues/`:

| Venue | Instruments | Streams |
| --- | --- | --- |
| **Binance** | `btcusdt` / `ethusdt` USDT-M | `aggTrade`, `depth20@100ms`, `kline_1m`, `markPrice`, `!forceOrder@arr` |
| **Bybit** | `BTCUSDT` / `ETHUSDT` linear | `publicTrade`, `orderbook.50`, `tickers` |
| **OKX** | `BTC-USDT-SWAP` / `ETH-USDT-SWAP` | `trades`, `books5`, `funding-rate` |

Symbols: **BTC/USD** / **ETH/USD** → each venue USDT perpetual id (`venues/symbols.ts`).

Live venue chips subscribe/unsubscribe that exchange. Multi-select merges trades tape (exchange tags), CVD, order book (sizes summed at price), and heatmap from the merged book. Single-venue still works.

### OKX gaps

- `books5` is top **5** levels only (thinner than Binance depth20 / Bybit 50).
- No OKX liquidation stream yet (Binance `forceOrder` when Binance is selected).
- Chart/24h bootstrap prefers Binance; else Bybit/OKX REST klines.

Resilience notes:

- Binance REST prefers `fapi.binance.com`, then `data-api.binance.vision` when futures REST is geo-blocked.
- Binance futures WS is primary; spot Vision fallback for tape/klines if futures aggTrade is filtered.
- If no selected venue becomes live within ~12s, the app falls back to mock.


## Mock feed

`src/data/mockFeed.ts` generates a random-walk mid, trades, book, candles, CVD, heatmap frames, and occasional liquidations.

- Start / pause from the top bar
- Speed **1x / 2x** (mock only)
- Venue multi-select: Binance / Bybit / OKX (mock tags)

## Alerts

Top bar **Alerts** opens a drawer to create / list / delete alerts (persisted in `localStorage`).

- Conditions: **price above / below** (primary), plus optional **funding** and **OI** crosses
- Evaluated on each feed tick against live `stats.last` (and funding / OI)
- On fire: toast banner + optional browser `Notification` (click **Notify** to permit)
- Alert latches as triggered; **Rearm** to watch again; recent fires kept in history

## Layout

- Drag widgets from the header handle; resize from corners
- Layout + widget set persist in `localStorage`
- **Layouts** drawer: save current grid as a named template, load / delete user templates
- Built-in presets: **Scalp** (chart + DOM + tape), **Profile** (chart + TPO + VPVR + footprint)
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
