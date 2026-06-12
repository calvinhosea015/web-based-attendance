import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './ui.jsx';
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

export default function AdminLayout({ title, subtitle, actions, children }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [pendingLoans, setPendingLoans] = useState(0);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  const refreshPending = useCallback(async () => {
    try {
      const [loansRes, leaveRes] = await Promise.all([
        api.get(paths.adminLoanRequestsPending),
        api.get(paths.adminLeaveRequestsPending),
      ]);
      setPendingLoans(Array.isArray(loansRes.data) ? loansRes.data.length : 0);
      setPendingLeave(Array.isArray(leaveRes.data) ? leaveRes.data.length : 0);
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

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const bellCount = unreadCount + pendingLoans + pendingLeave;

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

  const pendingByKey = { loans: pendingLoans, leave: pendingLeave };

  const renderNavLink = ({ to, labelKey, match, pendingKey }) => {
    const active = match(pathname);
    const count = pendingKey ? pendingByKey[pendingKey] : 0;
    return (
      <Link
        key={to}
        to={to}
        className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition duration-200 ${
          active
            ? 'bg-apple-fill text-apple-text'
            : 'text-apple-label hover:bg-apple-fill/70 hover:text-apple-text'
        }`}
      >
        {t(labelKey)}
        <NavBadge count={count} />
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-apple-bg">
      <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-white/72 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-8">
            <Link to="/admin" className="flex items-center gap-3">
              <img
                src="/company-logo.png"
                alt={t('appName')}
                className="h-9 w-auto rounded-lg"
              />
              <span className="hidden text-[15px] font-semibold tracking-tight text-apple-text sm:inline">
                {t('appName')}
              </span>
            </Link>
            <nav className="hidden items-center gap-0.5 sm:flex" aria-label="Admin">
              {NAV.map(renderNavLink)}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative rounded-full p-2.5 text-apple-label transition hover:bg-apple-fill hover:text-apple-text"
                aria-label={t('adminNotifications')}
                aria-expanded={notifOpen}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
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
                <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-apple-xl border border-black/[0.08] bg-white/95 shadow-apple-lg backdrop-blur-xl">
                  <div className="border-b border-black/[0.06] px-5 py-4">
                    <p className="text-[15px] font-semibold text-apple-text">{t('adminNotifications')}</p>
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
                          className={`w-full border-b border-black/[0.04] px-5 py-3.5 text-left text-[14px] transition hover:bg-apple-fill/60 ${
                            !n.read_at ? 'bg-brand-50/30' : ''
                          }`}
                        >
                          <span className="font-medium text-apple-text">{n.title}</span>
                          {n.body && (
                            <span className="mt-0.5 block text-[13px] text-apple-label">{n.body}</span>
                          )}
                          <span className="mt-1 block text-[11px] text-apple-muted">
                            {formatDisplayDateTime(n.created_at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div
              className="flex rounded-full bg-apple-fill p-0.5"
              role="group"
              aria-label={t('language')}
            >
              {['en', 'id'].map((lng) => (
                <button
                  key={lng}
                  type="button"
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
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
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              {t('logout')}
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-black/[0.05] px-4 py-2 sm:hidden">
          {NAV.map(renderNavLink)}
        </nav>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-[13px] font-medium text-apple-label">{t('adminOnly')}</p>
            <h1 className="mt-2 text-[32px] font-semibold tracking-tightest text-apple-text sm:text-[40px] sm:leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-[17px] leading-relaxed text-apple-label">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
