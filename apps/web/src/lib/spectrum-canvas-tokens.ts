import type { CampaignNodeCategory } from './campaign-nodes';

/**
 * Curated Adobe Spectrum light-theme values (@adobe/spectrum-tokens v14).
 * Used for campaign workflow canvas — React Flow nodes/edges, not full React Spectrum UI.
 */
export const spectrumCanvas = {
  bgCanvas: 'rgb(248, 248, 248)',
  bgNode: 'rgb(255, 255, 255)',
  bgNodeSubtle: 'rgb(248, 248, 248)',
  borderDefault: 'rgb(218, 218, 218)',
  borderStrong: 'rgb(177, 177, 177)',
  textPrimary: 'rgb(41, 41, 41)',
  textSecondary: 'rgb(109, 109, 109)',
  textMuted: 'rgb(142, 142, 142)',
  accent: 'rgb(75, 117, 255)',
  accentFocus: 'rgb(59, 99, 251)',
  positive: 'rgb(18, 184, 103)',
  positiveMuted: 'rgb(45, 203, 132)',
  negative: 'rgb(255, 118, 101)',
  informative: 'rgb(75, 117, 255)',
  radius: '5px',
  radiusSm: '4px',
  fontSizeSm: '12px',
  fontSizeMd: '14px',
  shadow: '0 1px 4px rgba(0, 0, 0, 0.1)',
  shadowSelected: '0 0 0 2px rgb(75, 117, 255)',
} as const;

export const SPECTRUM_EDGE_STROKE = {
  idle: 'rgb(142, 142, 142)',
  flowing: spectrumCanvas.positive,
  done: 'rgb(15, 159, 89)',
  error: spectrumCanvas.negative,
} as const;

const CATEGORY_SPECTRUM: Record<CampaignNodeCategory, string> = {
  Targeting: 'rgb(75, 117, 255)',
  Entry: 'rgb(109, 93, 255)',
  Timing: 'rgb(255, 149, 0)',
  Channels: 'rgb(18, 184, 103)',
  Decisions: 'rgb(255, 109, 0)',
  Audience: 'rgb(0, 143, 163)',
  Flow: 'rgb(109, 109, 109)',
  Exit: 'rgb(142, 142, 142)',
};

export function spectrumCategoryAccent(category: CampaignNodeCategory): string {
  return CATEGORY_SPECTRUM[category] ?? spectrumCanvas.textMuted;
}

/** CSS custom properties injected on `.spectrum-canvas` */
export const SPECTRUM_CANVAS_CSS_VARS: Record<string, string> = {
  '--spectrum-canvas-bg': spectrumCanvas.bgCanvas,
  '--spectrum-canvas-node-bg': spectrumCanvas.bgNode,
  '--spectrum-canvas-node-subtle': spectrumCanvas.bgNodeSubtle,
  '--spectrum-canvas-border': spectrumCanvas.borderDefault,
  '--spectrum-canvas-border-strong': spectrumCanvas.borderStrong,
  '--spectrum-canvas-text': spectrumCanvas.textPrimary,
  '--spectrum-canvas-text-secondary': spectrumCanvas.textSecondary,
  '--spectrum-canvas-text-muted': spectrumCanvas.textMuted,
  '--spectrum-canvas-accent': spectrumCanvas.accent,
  '--spectrum-canvas-accent-focus': spectrumCanvas.accentFocus,
  '--spectrum-canvas-positive': spectrumCanvas.positive,
  '--spectrum-canvas-positive-muted': spectrumCanvas.positiveMuted,
  '--spectrum-canvas-negative': spectrumCanvas.negative,
  '--spectrum-canvas-informative': spectrumCanvas.informative,
  '--spectrum-canvas-radius': spectrumCanvas.radius,
  '--spectrum-canvas-radius-sm': spectrumCanvas.radiusSm,
  '--spectrum-canvas-font-sm': spectrumCanvas.fontSizeSm,
  '--spectrum-canvas-font-md': spectrumCanvas.fontSizeMd,
  '--spectrum-canvas-shadow': spectrumCanvas.shadow,
};
