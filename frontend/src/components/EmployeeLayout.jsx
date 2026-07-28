import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './ui.jsx';
import { api, paths } from '../api/client.js';
import { canViewFieldOmsetReport, ROLE_ADMIN } from '../roles.js';

function HamburgerIcon({ open }) {
  return (
    <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden>
      <span
        className={`absolute h-[1.5px] w-4 rounded-full bg-current transition-all duration-premium ease-premium ${
          open ? 'translate-y-0 rotate-45' : '-translate-y-[5px]'
        }`}
      />
      <span
        className={`absolute h-[1.5px] w-4 rounded-full bg-current transition-all duration-premium ease-premium ${
          open ? 'opacity-0 scale-0' : 'opacity-100'
        }`}
      />
      <span
        className={`absolute h-[1.5px] w-4 rounded-full bg-current transition-all duration-premium ease-premium ${
          open ? 'translate-y-0 -rotate-45' : 'translate-y-[5px]'
        }`}
      />
    </span>
  );
}

function navItemsForRole(role) {
  const items = [
    {
      to: '/employee',
      labelKey: 'employeeDashboard',
      match: (p) => p === '/employee' || p.startsWith('/user'),
    },
  ];
  if (role && role !== ROLE_ADMIN && canViewFieldOmsetReport(role)) {
    items.push({
      to: '/finance/field-omset',
      labelKey: 'fieldOmsetReportTitle',
      match: (p) => p.startsWith('/finance'),
    });
  }
  return items;
}

export default function EmployeeLayout({ children }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const role = localStorage.getItem('role');
  const navItems = useMemo(() => navItemsForRole(role), [role]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      const rt = localStorage.getItem('refreshToken');
      if (rt) await api.post(paths.logout, { refreshToken: rt });
    } catch {
      /* best-effort */
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const renderNavLink = ({ to, labelKey, match }, mobile = false) => {
    const active = match(pathname);
    return (
      <Link
        key={to}
        to={to}
        onClick={() => mobile && setMenuOpen(false)}
        className={`rounded-full px-4 py-2.5 font-medium transition-all duration-premium ease-premium ${
          active
            ? 'bg-brand-600 text-white shadow-apple'
            : 'text-apple-label hover:bg-apple-highlight hover:text-apple-text'
        } ${mobile ? 'text-[22px] font-semibold tracking-tight' : 'text-[13px]'}`}
      >
        {t(labelKey)}
      </Link>
    );
  };

  const LanguageToggle = () => (
    <div
      className="flex rounded-full bg-apple-fill p-0.5 ring-1 ring-black/[0.04]"
      role="group"
      aria-label={t('language')}
    >
      {['en', 'id'].map((lng) => (
        <button
          key={lng}
          type="button"
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-all duration-300 ease-premium ${
            i18n.language?.startsWith(lng)
              ? 'bg-white text-apple-text shadow-apple'
              : 'text-apple-muted hover:text-apple-text'
          }`}
          onClick={() => i18n.changeLanguage(lng)}
        >
          {lng}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page-canvas">
      <div className="nav-shell relative z-10 px-4 pt-6 sm:px-6">
        <div className="nav-island mx-auto max-w-6xl">
          <div className="nav-island-inner">
            <div className="flex min-w-0 items-center gap-4 sm:gap-6">
              <Link to="/employee" className="flex shrink-0 items-center gap-2.5">
                <img src="/company-logo.png" alt={t('appName')} className="h-8 w-auto sm:h-9" />
                <span className="hidden font-display text-[15px] font-semibold tracking-tight text-apple-text md:inline">
                  {t('appName')}
                </span>
              </Link>
              <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t('employeeDashboard')}>
                {navItems.map((item) => renderNavLink(item))}
              </nav>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="hidden sm:block">
                <LanguageToggle />
              </div>

              <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden sm:inline-flex">
                {t('logout')}
              </Button>

              <button
                type="button"
                className="rounded-full p-2.5 text-apple-label transition-all duration-300 ease-premium hover:bg-apple-highlight lg:hidden"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
              >
                <HamburgerIcon open={menuOpen} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-white/80 backdrop-blur-glass transition-opacity duration-premium ease-premium"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="relative flex min-h-[100dvh] flex-col items-start justify-center gap-2 px-8 py-24"
            aria-label={t('employeeDashboard')}
          >
            {navItems.map((item, i) => (
              <div
                key={item.to}
                className="transition-all duration-premium ease-premium"
                style={{
                  transitionDelay: menuOpen ? `${100 + i * 50}ms` : '0ms',
                  opacity: menuOpen ? 1 : 0,
                  transform: menuOpen ? 'translateY(0)' : 'translateY(3rem)',
                }}
              >
                {renderNavLink(item, true)}
              </div>
            ))}
            <div
              className="mt-8 flex flex-wrap items-center gap-3 transition-all duration-premium ease-premium"
              style={{
                transitionDelay: menuOpen ? '350ms' : '0ms',
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? 'translateY(0)' : 'translateY(3rem)',
              }}
            >
              <LanguageToggle />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                {t('logout')}
              </Button>
            </div>
          </nav>
        </div>
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
}
