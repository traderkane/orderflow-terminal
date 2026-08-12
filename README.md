# Flow Terminal (Orderflow)

MMT-inspired browser crypto **order-flow trading terminal** with a dark multi-widget layout.

Data sources:

- **Live (default)** — public Binance USDT-M futures WebSockets + REST bootstrap (no API keys)
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

1. **Chart** — candles + volume; toggles for VWAP, CVD overlay, liquidation markers
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

## Live Binance feed

`src/data/binanceFeed.ts` connects to Binance **USDT-M futures**:

| Stream / REST | Used for |
| --- | --- |
| `aggTrade` | Trades tape, CVD, volume profile, footprint |
| `depth20@100ms` | Order book + heatmap history |
| `kline_1m` | Chart candles |
| `markPrice` | Funding rate |
| `!forceOrder@arr` | Liquidations (filtered to symbol) |
| REST klines / 24hr ticker / OI | Bootstrap history + stats |

Symbols: **BTC/USD** → `btcusdt`, **ETH/USD** → `ethusdt`.

Toggle **Live / Mock** in the top bar. Live is the default; if the live connection cannot bootstrap, the app falls back to mock.

Resilience notes:

- REST prefers `fapi.binance.com`, then falls back to `data-api.binance.vision` (spot) when futures REST is geo-blocked.
- Futures WS is primary. If `aggTrade` / `kline` never arrive (some networks filter them), the feed opens a spot Vision WS for tape + candles while keeping futures depth / liquidations / bookTicker.


## Mock feed

`src/data/mockFeed.ts` generates a random-walk mid, trades, book, candles, CVD, heatmap frames, and occasional liquidations.

- Start / pause from the top bar
- Speed **1x / 2x** (mock only)
- Venue multi-select: Binance / Bybit / OKX (mock tags)

## Layout

- Drag widgets from the header handle; resize from corners
- Layout + widget set persist in `localStorage`
- **Reset layout** restores the chart-dominant pro workspace
- **+ Widget** launcher adds another panel instance

## License

MIT
