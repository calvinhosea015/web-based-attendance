import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, PageHero } from './ui.jsx';
import { Reveal } from './Reveal.jsx';
import { api, paths } from '../api/client.js';
import { formatDisplayDateTime } from '../utils/formatDate.js';

const NAV = [
  { to: '/admin', labelKey: 'adminDashboard', match: (p) => p === '/admin', pendingKey: null },
  {
    to: '/admin/payroll',
    labelKey: 'payrollTitle',
    match: (p) => p.startsWith('/admin/payroll'),
    pendingKey: null,
  },
  {
    to: '/admin/field',
    labelKey: 'fieldOpsDashboardTitle',
    match: (p) => p.startsWith('/admin/field'),
    pendingKey: null,
  },
  {
    to: '/admin/loans',
    labelKey: 'loanAdminTitle',
    match: (p) => p.startsWith('/admin/loans'),
    pendingKey: 'loans',
  },
  {
    to: '/admin/leave',
    labelKey: 'leaveAdminTitle',
    match: (p) => p.startsWith('/admin/leave'),
    pendingKey: 'leave',
  },
  {
    to: '/admin/corrections',
    labelKey: 'correctionAdminTitle',
    match: (p) => p.startsWith('/admin/corrections'),
    pendingKey: 'corrections',
  },
  {
    to: '/admin/reports',
    labelKey: 'reportsTitle',
    match: (p) => p.startsWith('/admin/reports'),
    pendingKey: null,
  },
];

const POLL_MS = 45000;

function NavBadge({ count }) {
  if (!count || count < 1) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

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

export default function AdminLayout({ title, subtitle, actions, children }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [pendingLoans, setPendingLoans] = useState(0);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [pendingCorrections, setPendingCorrections] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifRef = useRef(null);

  const refreshPending = useCallback(async () => {
    try {
      const [loansRes, leaveRes, correctionsRes] = await Promise.all([
        api.get(paths.adminLoanRequestsPending),
        api.get(paths.adminLeaveRequestsPending),
        api.get(paths.adminAttendanceCorrectionsPending),
      ]);
      setPendingLoans(Array.isArray(loansRes.data) ? loansRes.data.length : 0);
      setPendingLeave(Array.isArray(leaveRes.data) ? leaveRes.data.length : 0);
      setPendingCorrections(Array.isArray(correctionsRes.data) ? correctionsRes.data.length : 0);
    } catch {
      /* ignore poll errors */
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const { data } = await api.get(paths.adminNotifications);
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const refreshAll = () => {
      refreshPending();
      refreshNotifications();
    };
    refreshAll();
    const id = setInterval(refreshAll, POLL_MS);
    window.addEventListener('admin-pending-refresh', refreshAll);
    return () => {
      clearInterval(id);
      window.removeEventListener('admin-pending-refresh', refreshAll);
    };
  }, [refreshPending, refreshNotifications]);

  useEffect(() => {
    const onDoc = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [notifOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const bellCount = unreadCount + pendingLoans + pendingLeave + pendingCorrections;

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const markRead = async (id) => {
    try {
      await api.put(paths.adminNotificationRead(id));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch {
      /* ignore */
    }
  };

  const goToNotification = async (n) => {
    if (!n.read_at) await markRead(n.id);
    setNotifOpen(false);
    if (n.type === 'loan_request') navigate('/admin/loans');
    else if (n.type === 'leave_request') navigate('/admin/leave');
    else navigate('/admin');
  };

  const pendingByKey = { loans: pendingLoans, leave: pendingLeave, corrections: pendingCorrections };

  const renderNavLink = ({ to, labelKey, match, pendingKey }, mobile = false) => {
    const active = match(pathname);
    const count = pendingKey ? pendingByKey[pendingKey] : 0;
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
        <NavBadge count={count} />
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
      <div className="relative z-10 px-4 pt-6 sm:px-6">
        <div className="nav-island">
          <div className="nav-island-inner">
            <div className="flex min-w-0 items-center gap-4 sm:gap-6">
              <Link to="/admin" className="flex shrink-0 items-center gap-2.5">
                <img
                  src="/company-logo.png"
                  alt={t('appName')}
                  className="h-8 w-auto rounded-xl sm:h-9"
                />
                <span className="hidden font-display text-[15px] font-semibold tracking-tight text-apple-text md:inline">
                  {t('appName')}
                </span>
              </Link>
              <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Admin">
                {NAV.map((item) => renderNavLink(item))}
              </nav>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="relative hidden sm:block" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotifOpen((o) => !o)}
                  className="relative rounded-full p-2.5 text-apple-label transition-all duration-300 ease-premium hover:bg-apple-highlight hover:text-brand-700"
                  aria-label={t('adminNotifications')}
                  aria-expanded={notifOpen}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.25}
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  {bellCount > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                      {bellCount > 99 ? '99+' : bellCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-full z-30 mt-3 w-[min(100vw-2rem,22rem)] overflow-hidden bezel-outer shadow-apple-lg">
                    <div className="bezel-inner">
                      <div className="border-b border-black/[0.04] px-5 py-4">
                        <p className="text-[15px] font-semibold text-apple-text">
                          {t('adminNotifications')}
                        </p>
                        {(pendingLoans > 0 || pendingLeave > 0) && (
                          <p className="mt-1 text-[12px] text-apple-label">
                            {pendingLoans > 0 && t('adminNotifPendingLoans', { count: pendingLoans })}
                            {pendingLoans > 0 && pendingLeave > 0 && ' · '}
                            {pendingLeave > 0 && t('adminNotifPendingLeave', { count: pendingLeave })}
                          </p>
                        )}
                      </div>
                      <ul className="max-h-72 overflow-y-auto">
                        {notifications.length === 0 && (
                          <li className="px-5 py-8 text-center text-[15px] text-apple-label">
                            {t('adminNotifEmpty')}
                          </li>
                        )}
                        {notifications.slice(0, 20).map((n) => (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => goToNotification(n)}
                              className={`w-full border-b border-black/[0.03] px-5 py-3.5 text-left text-[14px] transition-all duration-300 ease-premium hover:bg-apple-highlight/60 ${
                                !n.read_at ? 'bg-apple-highlight/80' : ''
                              }`}
                            >
                              <span className="font-medium text-apple-text">{n.title}</span>
                              {n.body && (
                                <span className="mt-0.5 block text-[13px] text-apple-label">
                                  {n.body}
                                </span>
                              )}
                              <span className="mt-1 block text-[11px] text-apple-muted">
                                {formatDisplayDateTime(n.created_at)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

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
            aria-label="Admin mobile"
          >
            {NAV.map((item, i) => (
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

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <PageHero
            eyebrow={t('adminOnly')}
            title={title}
            subtitle={subtitle}
            action={
              actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>
            }
          />
        </Reveal>
        <div className="space-y-10">{children}</div>
      </div>
    </div>
  );
}
