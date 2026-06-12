import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function Card({ title, description, action, children, className = '' }) {
  return (
    <section
      className={`overflow-hidden rounded-apple-xl border border-black/[0.06] bg-white shadow-apple ${className}`}
    >
      {(title || description || action) && (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.05] px-6 py-5 sm:px-8">
          <div className="max-w-3xl">
            {title && (
              <h2 className="text-[22px] font-semibold tracking-tightest text-apple-text">{title}</h2>
            )}
            {description && (
              <p className="mt-1.5 text-[15px] leading-relaxed text-apple-label">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="px-6 py-5 sm:px-8 sm:py-6">{children}</div>
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
    'inline-flex items-center justify-center gap-2 font-medium transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-40';
  const sizes = {
    sm: 'px-3.5 py-1.5 text-[13px] rounded-full',
    md: 'px-5 py-2 text-[15px] rounded-full',
    lg: 'px-6 py-2.5 text-[15px] rounded-full',
  };
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-500 active:scale-[0.98]',
    secondary:
      'border border-black/[0.1] bg-white text-apple-text shadow-apple hover:bg-apple-fill active:scale-[0.98]',
    success: 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.98]',
    ghost: 'text-apple-label hover:bg-apple-fill hover:text-apple-text',
    danger:
      'border border-rose-200/80 bg-rose-50 text-rose-700 hover:bg-rose-100/80 active:scale-[0.98]',
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
    info: 'border-black/[0.08] bg-apple-fill text-apple-text',
    success: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-900',
    error: 'border-rose-200/80 bg-rose-50/80 text-rose-900',
  };
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-apple-lg border px-4 py-3.5 text-[15px] ${tones[tone]}`}
      role="status"
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-apple-muted transition hover:bg-black/[0.06] hover:text-apple-text"
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
    neutral: 'bg-apple-fill text-apple-label',
    success: 'bg-emerald-100/90 text-emerald-800',
    muted: 'bg-apple-fill text-apple-muted',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-2 block text-[13px] font-medium text-apple-label">{label}</span>
      )}
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-relaxed text-apple-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-apple border-0 bg-apple-fill px-3.5 py-2.5 text-[15px] text-apple-text shadow-none transition placeholder:text-apple-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/25';

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
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-[12px] font-medium text-apple-label transition hover:bg-apple-fill-hover hover:text-apple-text"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-md"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-apple-xl border border-black/[0.08] bg-white shadow-apple-lg ${modalSizes[size] || modalSizes.md} ${
          fitScreen ? 'max-h-[calc(100vh-2rem)]' : 'max-h-[min(90vh,800px)]'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="shrink-0 border-b border-black/[0.06] px-6 py-4">
          <h3 className="text-[20px] font-semibold tracking-tight text-apple-text">{title}</h3>
          {subtitle && <p className="mt-1 truncate text-[15px] text-apple-label">{subtitle}</p>}
        </div>
        <div
          className={`shrink-0 px-6 py-4 ${fitScreen ? 'overflow-hidden' : 'flex-1 overflow-y-auto'}`}
        >
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-black/[0.06] bg-apple-fill/40 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export const inputClassCompact =
  'w-full rounded-lg border-0 bg-apple-fill px-2.5 py-2 text-[14px] text-apple-text transition placeholder:text-apple-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/25';

export function CompactField({ label, hint, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      {label && (
        <span className="mb-1 block text-[11px] font-medium text-apple-label">{label}</span>
      )}
      {children}
      {hint && <span className="mt-0.5 block truncate text-[11px] text-apple-muted">{hint}</span>}
    </label>
  );
}

export function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-apple-lg border border-black/[0.06] bg-white p-5 shadow-apple">
      <p className="text-[13px] font-medium text-apple-label">{label}</p>
      <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-tightest text-apple-text">
        {value}
      </p>
      {sub && <p className="mt-1 text-[12px] leading-relaxed text-apple-muted">{sub}</p>}
    </div>
  );
}
