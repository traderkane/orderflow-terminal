import type { LayoutItem, LayoutTemplate, WidgetInstance } from '../types/market';

/** Scalp v8: chart workspace + right Book|Tape dock + bottom Heatmap|CVD|Liqs|Stats dock. */
const SCALP_WIDGETS: WidgetInstance[] = [
  { id: 'chart', type: 'chart' },
  {
    id: 'rightDock',
    type: 'tabDock',
    tabs: ['orderbook', 'trades'],
    activeTab: 0,
  },
  {
    id: 'bottomDock',
    type: 'tabDock',
    tabs: ['heatmap', 'cvd', 'liquidations', 'stats'],
    activeTab: 0,
  },
];

/** 28-row design grid — fills typical 900–1080p workspace via dynamic rowHeight. */
const SCALP_LAYOUT: LayoutItem[] = [
  { i: 'chart', x: 0, y: 0, w: 8, h: 22, minW: 5, minH: 8 },
  { i: 'rightDock', x: 8, y: 0, w: 4, h: 22, minW: 2, minH: 6 },
  { i: 'bottomDock', x: 0, y: 22, w: 12, h: 6, minW: 4, minH: 4 },
];

const PROFILE_WIDGETS: WidgetInstance[] = [
  { id: 'chart', type: 'chart' },
  { id: 'tpo', type: 'tpo' },
  { id: 'volumeProfile', type: 'volumeProfile' },
  { id: 'footprint', type: 'footprint' },
  { id: 'stats', type: 'stats' },
];

const PROFILE_LAYOUT: LayoutItem[] = [
  { i: 'chart', x: 0, y: 0, w: 6, h: 18, minW: 4, minH: 7 },
  { i: 'footprint', x: 6, y: 0, w: 3, h: 18, minW: 3, minH: 6 },
  { i: 'volumeProfile', x: 9, y: 0, w: 3, h: 18, minW: 2, minH: 5 },
  { i: 'tpo', x: 0, y: 18, w: 9, h: 10, minW: 4, minH: 5 },
  { i: 'stats', x: 9, y: 18, w: 3, h: 10, minW: 2, minH: 2 },
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
