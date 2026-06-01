import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Prominent control for opening a leave supporting document.
 */
export default function LeaveDocumentButton({ onClick, className = '' }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-3 flex w-full max-w-md items-center gap-3 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/60 px-4 py-3 text-left transition hover:border-brand-400 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${className}`}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-lg shadow-sm ring-1 ring-brand-100"
        aria-hidden
      >
        📄
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-brand-800">{t('leaveViewDocument')}</span>
      <span className="shrink-0 text-brand-600" aria-hidden>
        →
      </span>
    </button>
  );
}
