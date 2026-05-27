import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function Card({ title, description, action, children, className = '' }) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50 ${className}`}
    >
      {(title || description || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            {title && <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="px-5 py-4 sm:px-6">{children}</div>
    </section>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50';
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };
  const variants = {
    primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-500',
    secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50',
    success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100',
  };
  return (
    <button
      type="button"
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Alert({ tone = 'info', children, onDismiss }) {
  const tones = {
    info: 'border-slate-200 bg-slate-50 text-slate-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  };
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}
      role="status"
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          className="shrink-0 text-slate-400 hover:text-slate-600"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Badge({ variant = 'neutral', children }) {
  const variants = {
    neutral: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-100 text-emerald-800',
    muted: 'bg-slate-50 text-slate-400',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

export function PasswordInput({ className = '', inputClassName = inputClass, ...props }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <input
        type={visible ? 'text' : 'password'}
        className={`${inputClassName} pr-24`}
        {...props}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
      >
        {visible ? t('hidePassword') : t('showPassword')}
      </button>
    </div>
  );
}

const modalSizes = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

export function Modal({ title, subtitle, onClose, children, footer, size = 'md', fitScreen = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ${modalSizes[size] || modalSizes.md} ${
          fitScreen ? 'max-h-[calc(100vh-1.5rem)]' : 'max-h-[min(90vh,800px)]'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div
          className={`shrink-0 px-4 py-3 sm:px-5 ${fitScreen ? 'overflow-hidden' : 'flex-1 overflow-y-auto'}`}
        >
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export const inputClassCompact =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

export function CompactField({ label, hint, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      {label && (
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      )}
      {children}
      {hint && <span className="mt-0.5 block truncate text-[10px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
