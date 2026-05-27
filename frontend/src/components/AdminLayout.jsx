import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './ui.jsx';

const NAV = [
  { to: '/admin', labelKey: 'adminDashboard', match: (p) => p === '/admin' },
  { to: '/admin/payroll', labelKey: 'payrollTitle', match: (p) => p.startsWith('/admin/payroll') },
  { to: '/admin/loans', labelKey: 'loanAdminTitle', match: (p) => p.startsWith('/admin/loans') },
];

export default function AdminLayout({ title, subtitle, actions, children }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/admin" className="flex items-center gap-2.5">
              <img
                src="/company-logo.png"
                alt={t('appName')}
                className="h-9 w-auto rounded-md border border-slate-200 bg-white p-0.5 shadow-sm"
              />
              <span className="hidden text-sm font-semibold text-slate-900 sm:inline">{t('appName')}</span>
            </Link>
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Admin">
              {NAV.map(({ to, labelKey, match }) => {
                const active = match(pathname);
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-brand-50 text-brand-600'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {t(labelKey)}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
              role="group"
              aria-label={t('language')}
            >
              {['en', 'id'].map((lng) => (
                <button
                  key={lng}
                  type="button"
                  className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase transition ${
                    i18n.language?.startsWith(lng)
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  onClick={() => i18n.changeLanguage(lng)}
                >
                  {lng}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              {t('logout')}
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 sm:hidden">
          {NAV.map(({ to, labelKey, match }) => (
            <Link
              key={to}
              to={to}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                match(pathname) ? 'bg-brand-50 text-brand-600' : 'text-slate-600'
              }`}
            >
              {t(labelKey)}
            </Link>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-brand-600">
              {t('adminOnly')}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-600">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
