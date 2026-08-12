import type { LayoutItem, LayoutTemplate, WidgetInstance } from '../types/market';

const SCALP_WIDGETS: WidgetInstance[] = [
  { id: 'chart', type: 'chart' },
  { id: 'orderbook', type: 'orderbook' },
  { id: 'trades', type: 'trades' },
  { id: 'heatmap', type: 'heatmap' },
  { id: 'cvd', type: 'cvd' },
  { id: 'liquidations', type: 'liquidations' },
  { id: 'stats', type: 'stats' },
];

const SCALP_LAYOUT: LayoutItem[] = [
  { i: 'chart', x: 0, y: 0, w: 7, h: 16, minW: 4, minH: 7 },
  { i: 'orderbook', x: 7, y: 0, w: 3, h: 16, minW: 2, minH: 6 },
  { i: 'trades', x: 10, y: 0, w: 2, h: 16, minW: 2, minH: 6 },
  { i: 'heatmap', x: 0, y: 16, w: 4, h: 6, minW: 3, minH: 4 },
  { i: 'cvd', x: 4, y: 16, w: 3, h: 6, minW: 2, minH: 4 },
  { i: 'liquidations', x: 7, y: 16, w: 3, h: 6, minW: 2, minH: 3 },
  { i: 'stats', x: 10, y: 16, w: 2, h: 6, minW: 2, minH: 2 },
];

const PROFILE_WIDGETS: WidgetInstance[] = [
  { id: 'chart', type: 'chart' },
  { id: 'tpo', type: 'tpo' },
  { id: 'volumeProfile', type: 'volumeProfile' },
  { id: 'footprint', type: 'footprint' },
  { id: 'stats', type: 'stats' },
];

const PROFILE_LAYOUT: LayoutItem[] = [
  { i: 'chart', x: 0, y: 0, w: 6, h: 14, minW: 4, minH: 7 },
  { i: 'footprint', x: 6, y: 0, w: 3, h: 14, minW: 3, minH: 6 },
  { i: 'volumeProfile', x: 9, y: 0, w: 3, h: 14, minW: 2, minH: 5 },
  { i: 'tpo', x: 0, y: 14, w: 9, h: 8, minW: 4, minH: 5 },
  { i: 'stats', x: 9, y: 14, w: 3, h: 8, minW: 2, minH: 2 },
];

export const BUILTIN_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'builtin-scalp',
    name: 'Scalp',
    builtIn: true,
    widgets: SCALP_WIDGETS,
    layout: SCALP_LAYOUT,
    createdAt: 0,
  },
  {
    id: 'builtin-profile',
    name: 'Profile',
    builtIn: true,
    widgets: PROFILE_WIDGETS,
    layout: PROFILE_LAYOUT,
    createdAt: 0,
  },
];

export const BUILTIN_BY_ID = new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t]));
