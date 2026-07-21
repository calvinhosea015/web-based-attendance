import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function DoubleBezel({ children, className = '', innerClassName = '' }) {
  return (
    <div className={`bezel-outer ${className}`}>
      <div className={`bezel-inner ${innerClassName}`}>{children}</div>
    </div>
  );
}

export function Card({ title, description, action, children, className = '', bodyClassName = '', id }) {
  return (
    <section id={id} className={`bezel-outer shadow-apple ${className}`}>
      <div className="bezel-inner overflow-hidden">
        {(title || description || action) && (
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.05] px-5 py-4 sm:px-6">
            <div className="max-w-3xl">
              {title && (
                <h2 className="font-display text-title font-semibold text-apple-text">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-[14px] leading-relaxed text-apple-label">{description}</p>
              )}
            </div>
            {action}
          </div>
        )}
        <div className={`px-5 py-5 sm:px-6 ${bodyClassName}`}>{children}</div>
      </div>
    </section>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  trailingIcon,
  ...props
}) {
  const base =
    'group inline-flex items-center justify-center gap-2 font-medium transition-all duration-fast ease-premium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-40';
  const sizes = {
    sm: 'px-4 py-2 text-[13px] rounded-full',
    md: 'px-5 py-2.5 text-[15px] rounded-full',
    lg: 'px-6 py-3 text-[15px] rounded-full',
  };
  const variants = {
    primary:
      'bg-brand-600 text-white shadow-apple hover:bg-brand-700 active:scale-[0.98]',
    secondary:
      'bg-white text-apple-text ring-1 ring-black/[0.08] hover:bg-apple-fill active:scale-[0.98]',
    success:
      'bg-emerald-600 text-white shadow-apple hover:bg-emerald-700 active:scale-[0.98]',
    ghost:
      'text-apple-label hover:bg-apple-highlight/80 hover:text-brand-700',
    danger:
      'bg-rose-50 text-rose-700 ring-1 ring-rose-200/60 hover:bg-rose-100/80 active:scale-[0.98]',
  };

  const showTrailing = trailingIcon || (typeof children === 'string' && children.includes('→'));

  return (
    <button
      type="button"
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      <span>{children}</span>
      {showTrailing && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.06] transition-all duration-fast ease-premium group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105 group-active:scale-95 dark:bg-white/10">
          {trailingIcon || (
            <span className="text-[14px] leading-none" aria-hidden>
              ↗
            </span>
          )}
        </span>
      )}
    </button>
  );
}

export function Alert({ tone = 'info', children, onDismiss }) {
  const tones = {
    info: 'bg-apple-highlight/80 text-apple-text ring-1 ring-brand-100',
    success: 'bg-emerald-50/90 text-emerald-900 ring-1 ring-emerald-200/60',
    error: 'bg-rose-50/90 text-rose-900 ring-1 ring-rose-200/60',
  };
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-apple-lg px-4 py-3.5 text-[15px] ${tones[tone]}`}
      role="status"
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-apple-muted transition-all duration-fast ease-premium hover:bg-black/[0.06] hover:text-apple-text"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Spinner({ label, className = '' }) {
  const { t } = useTranslation();
  return (
    <div
      className={`flex items-center gap-2.5 text-[15px] text-apple-label ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-black/[0.08] border-t-brand-600"
        aria-hidden
      />
      <span>{label || t('loading')}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-apple-lg bg-apple-fill/40 px-6 py-12 text-center ring-1 ring-black/[0.03] ${className}`}
    >
      {icon && (
        <span className="text-2xl opacity-50" aria-hidden>
          {icon}
        </span>
      )}
      {title && <p className="text-[15px] font-medium text-apple-text">{title}</p>}
      {children && (
        <p className="max-w-sm text-[13px] leading-relaxed text-apple-label">{children}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Badge({ variant = 'neutral', children }) {
  const variants = {
    neutral: 'bg-apple-fill text-apple-text ring-1 ring-black/[0.04]',
    success: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/50',
    muted: 'bg-apple-fill text-apple-label ring-1 ring-black/[0.04]',
    warning: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200/50',
    danger: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200/50',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}

export function FilterChip({ active, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`${active ? 'apple-chip-active' : 'apple-chip'} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-2 block text-[13px] font-medium text-apple-label">{label}</span>
      )}
      {children}
      {hint && (
        <span className="mt-1.5 block text-[12px] leading-relaxed text-apple-muted">{hint}</span>
      )}
    </label>
  );
}

export const inputClass =
  'w-full rounded-apple-lg bg-apple-fill px-4 py-3 text-[15px] text-apple-text shadow-inset transition-all duration-300 ease-premium placeholder:text-apple-muted ring-1 ring-black/[0.05] hover:ring-black/[0.08] focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/30';

export const selectClass = `${inputClass} appearance-none cursor-pointer`;

export const panelClass = 'bezel-outer shadow-apple';

// ponytail: PageSection was identical to Card — kept as alias for backward compat
export const PageSection = Card;

export function ListGroup({ children, className = '' }) {
  return (
    <DoubleBezel className={className}>
      <ul className="divide-y divide-black/[0.04] overflow-hidden">{children}</ul>
    </DoubleBezel>
  );
}

export function ListRow({ children, className = '', onClick, as: Tag = 'li' }) {
  const interactive = typeof onClick === 'function';
  return (
    <Tag
      className={`flex items-center gap-3 px-5 py-4 text-[15px] ${
        interactive
          ? 'cursor-pointer transition-all duration-300 ease-premium hover:bg-apple-highlight/60'
          : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}

export function StatCard({ label, value, tone = 'neutral', className = '', featured = false }) {
  const accents = {
    blue: 'from-brand-600 to-brand-500',
    emerald: 'from-emerald-500 to-emerald-400',
    amber: 'from-amber-500 to-amber-400',
    rose: 'from-rose-500 to-rose-400',
    neutral: 'from-apple-muted to-apple-label',
  };
  const gradient = accents[tone] || accents.neutral;

  return (
    <div className={`bezel-outer shadow-apple transition-all duration-premium ease-premium hover:shadow-apple-md ${className}`}>
      <div className={`bezel-inner p-5 sm:p-6 ${featured ? 'sm:p-8' : ''}`}>
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full bg-gradient-to-br ${gradient}`}
            aria-hidden
          />
          <p className="text-[13px] font-medium text-apple-label">{label}</p>
        </div>
        <p
          className={`mt-3 font-display font-semibold tabular-nums tracking-tightest text-apple-text ${
            featured ? 'text-[40px] sm:text-[48px]' : 'text-[32px] sm:text-[36px]'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function PageHero({ eyebrow, title, subtitle, action, className = '' }) {
  return (
    <div className={`mb-8 flex flex-wrap items-end justify-between gap-6 ${className}`}>
      <div className="max-w-3xl">
        {eyebrow && <span className="apple-eyebrow">{eyebrow}</span>}
        <h1 className="mt-3 font-display text-display font-semibold text-apple-text sm:text-display-lg">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 text-[16px] leading-relaxed text-apple-label">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

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
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-[12px] font-medium text-apple-label transition-all duration-300 ease-premium hover:bg-apple-fill-hover hover:text-apple-text"
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

export function Modal({
  title,
  subtitle,
  onClose,
  closeLabel = 'Close',
  children,
  footer,
  size = 'md',
  fitScreen = false,
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/25 backdrop-blur-glass transition-opacity duration-premium ease-premium"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className={`relative flex w-full flex-col overflow-hidden bezel-outer shadow-apple-lg ${modalSizes[size] || modalSizes.md} ${
          fitScreen ? 'max-h-[calc(100dvh-2rem)]' : 'max-h-[min(90dvh,800px)]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="bezel-inner flex max-h-full flex-col overflow-hidden">
          <div className="shrink-0 border-b border-black/[0.05] px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3
                  id="modal-title"
                  className="font-display text-[18px] font-semibold tracking-tight text-apple-text"
                >
                  {title}
                </h3>
                {subtitle && (
                  <p className="mt-0.5 truncate text-[14px] text-apple-label">{subtitle}</p>
                )}
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeLabel}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-apple-label ring-1 ring-black/[0.06] transition-all duration-300 ease-premium hover:bg-apple-fill hover:text-apple-text active:scale-[0.98]"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 1l12 12M13 1L1 13"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
          >
            {children}
          </div>
          {footer && (
            <div className="flex shrink-0 justify-end gap-2 border-t border-black/[0.05] bg-apple-fill/40 px-5 py-3.5 sm:px-6">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const inputClassCompact =
  'w-full rounded-lg bg-apple-fill px-2.5 py-2 text-[14px] text-apple-text shadow-inset transition-all duration-300 ease-premium placeholder:text-apple-muted ring-1 ring-black/[0.05] focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/30';

export function CompactField({ label, hint, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      {label && (
        <span className="mb-1 block text-[11px] font-medium text-apple-label">{label}</span>
      )}
      {children}
      {hint && (
        <span className="mt-0.5 block truncate text-[11px] text-apple-muted">{hint}</span>
      )}
    </label>
  );
}

export function StatTile({ label, value, sub, className = '' }) {
  return (
    <div className={`bezel-outer shadow-apple ${className}`}>
      <div className="bezel-inner p-5 sm:p-6">
        <p className="text-[13px] font-medium text-apple-label">{label}</p>
        <p className="mt-2 font-display text-[28px] font-semibold tabular-nums tracking-tightest text-apple-text">
          {value}
        </p>
        {sub && <p className="mt-1 text-[12px] leading-relaxed text-apple-muted">{sub}</p>}
      </div>
    </div>
  );
}
