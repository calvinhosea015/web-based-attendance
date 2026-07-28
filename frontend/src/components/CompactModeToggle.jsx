import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCompactMode } from '../hooks/useCompactMode.js';

export function CompactModeToggle({ className = '' }) {
  const { t } = useTranslation();
  const { compact, toggleCompact } = useCompactMode();

  return (
    <button
      type="button"
      className={`text-[12px] font-medium text-brand-600 ${className}`}
      onClick={toggleCompact}
      aria-pressed={compact}
    >
      {compact ? t('uiHideCompactLayout') : t('uiShowCompactLayout')}
    </button>
  );
}
