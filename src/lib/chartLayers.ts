/** Persisted chart overlay / study visibility (layer dock + Layers panel). */

export type ChartLayerFlags = {
  heatmap: boolean;
  profile: boolean;
  bubbles: boolean;
  vwap: boolean;
  cvd: boolean;
  liqs: boolean;
};

export const CHART_LAYERS_KEY = 'flow-terminal-chart-layers-v1';

export const DEFAULT_CHART_LAYERS: ChartLayerFlags = {
  heatmap: true,
  profile: true,
  bubbles: true,
  vwap: true,
  cvd: false,
  liqs: true,
};

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export function loadChartLayers(): ChartLayerFlags {
  try {
    const raw = localStorage.getItem(CHART_LAYERS_KEY);
    if (!raw) return { ...DEFAULT_CHART_LAYERS };
    const parsed = JSON.parse(raw) as Partial<ChartLayerFlags>;
    return {
      heatmap: isBool(parsed.heatmap) ? parsed.heatmap : DEFAULT_CHART_LAYERS.heatmap,
      profile: isBool(parsed.profile) ? parsed.profile : DEFAULT_CHART_LAYERS.profile,
      bubbles: isBool(parsed.bubbles) ? parsed.bubbles : DEFAULT_CHART_LAYERS.bubbles,
      vwap: isBool(parsed.vwap) ? parsed.vwap : DEFAULT_CHART_LAYERS.vwap,
      cvd: isBool(parsed.cvd) ? parsed.cvd : DEFAULT_CHART_LAYERS.cvd,
      liqs: isBool(parsed.liqs) ? parsed.liqs : DEFAULT_CHART_LAYERS.liqs,
    };
  } catch {
    return { ...DEFAULT_CHART_LAYERS };
  }
}

export function persistChartLayers(flags: ChartLayerFlags) {
  try {
    localStorage.setItem(CHART_LAYERS_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

export function patchChartLayers(partial: Partial<ChartLayerFlags>): ChartLayerFlags {
  const next = { ...loadChartLayers(), ...partial };
  persistChartLayers(next);
  return next;
}
