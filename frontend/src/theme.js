// Design tokens for non-CSS consumers (charts, canvas). Keep in sync with tailwind.config.js.
// Charts can't read Tailwind classes, so this is the single source of truth for their colors.
export const CHART_COLORS = {
  brand: '#0071e3', // brand-600
  positive: '#34c759', // present / success (iOS green)
  warning: '#ff9500', // late / attention (iOS orange)
  axis: '#86868b', // apple-muted
  grid: 'rgba(0,0,0,0.06)',
};

export const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
};
