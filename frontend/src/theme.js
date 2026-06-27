// Design tokens for non-CSS consumers (charts, canvas). Keep in sync with tailwind.config.js.
// Charts can't read Tailwind classes, so this is the single source of truth for their colors.
export const CHART_COLORS = {
  brand: '#2563c9', // brand-600 (calmer blue)
  positive: '#30b15a', // present / success (slightly muted green)
  warning: '#e0860a', // late / attention (muted amber)
  axis: '#8a8a91', // apple-muted
  grid: 'rgba(0,0,0,0.06)',
};

export const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
};
