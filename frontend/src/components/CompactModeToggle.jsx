import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCompactMode } from '../hooks/useCompactMode.js';

export function CompactModeToggle({ className = '' }) {
  const { t } = useTranslation();
  const { compact, toggleCompact } = useCompactMode();

  return (
    <button
      type="button"
      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-all duration-300 ease-premium ${
        compact
          ? 'bg-brand-600 text-white shadow-apple'
          : 'text-apple-muted ring-1 ring-black/[0.06] hover:bg-apple-fill hover:text-apple-text'
      } ${className}`}
      onClick={toggleCompact}
      aria-pressed={compact}
      aria-label={compact ? t('uiExpandHint') : t('uiMinimizeHint')}
      title={compact ? t('uiExpandHint') : t('uiMinimizeHint')}
    >
      {compact ? t('uiExpand') : t('uiMinimize')}
    </button>
  );
}
