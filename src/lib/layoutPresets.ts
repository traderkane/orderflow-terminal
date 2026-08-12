import type { LayoutItem, LayoutTemplate, WidgetInstance } from '../types/market';

/** Scalp v9: chart workspace + right Book|Tape dock + bottom Heatmap|CVD|Liqs|Stats dock. */
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

/** Profile v9: large chart + profile tools dock + right Book|Tape + bottom Heatmap|CVD. */
const PROFILE_WIDGETS: WidgetInstance[] = [
  { id: 'chart', type: 'chart' },
  {
    id: 'profileDock',
    type: 'tabDock',
    tabs: ['tpo', 'volumeProfile', 'footprint'],
    activeTab: 0,
  },
  {
    id: 'rightDock',
    type: 'tabDock',
    tabs: ['orderbook', 'trades'],
    activeTab: 0,
  },
  {
    id: 'bottomDock',
    type: 'tabDock',
    tabs: ['heatmap', 'cvd'],
    activeTab: 0,
  },
];

const PROFILE_LAYOUT: LayoutItem[] = [
  { i: 'chart', x: 0, y: 0, w: 6, h: 22, minW: 5, minH: 8 },
  { i: 'profileDock', x: 6, y: 0, w: 3, h: 22, minW: 2, minH: 6 },
  { i: 'rightDock', x: 9, y: 0, w: 3, h: 22, minW: 2, minH: 6 },
  { i: 'bottomDock', x: 0, y: 22, w: 12, h: 6, minW: 4, minH: 4 },
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
