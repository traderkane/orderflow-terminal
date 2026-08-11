# Flow Terminal (Orderflow)

MMT-inspired browser crypto **order-flow trading terminal** with a dark multi-widget layout, driven by a local mock/replay feed (no API keys).

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
7. **Liquidations** — forced order feed
8. **Stats** — last, change, funding, OI, spread, volume

## Mock feed

`src/data/mockFeed.ts` generates a random-walk mid, trades, book, candles, CVD, heatmap frames, and occasional liquidations.

- Start / pause from the top bar
- Speed **1x / 2x**
- Symbol switch: **BTC/USD**, **ETH/USD**
- Venue multi-select: Binance / Bybit / OKX (tags trades & liqs)

Widgets subscribe through the Zustand store and update live.

## Layout

- Drag widgets from the header handle; resize from corners
- Layout + widget set persist in `localStorage`
- **Reset layout** restores the default 8-panel arrangement
- **+ Widget** launcher adds another panel instance

## Roadmap note

This build is intentionally self-contained with mock data. A real exchange or MMT-style API layer can replace `mockFeed` later without rewriting the widgets.

## License

MIT
