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
    <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
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
        className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
          active
            ? 'bg-brand-50 text-brand-600'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        {t(labelKey)}
        <NavBadge count={count} />
      </Link>
    );
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
              <span className="hidden text-sm font-semibold text-slate-900 sm:inline">
                {t('appName')}
              </span>
            </Link>
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Admin">
              {NAV.map(renderNavLink)}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                aria-label={t('adminNotifications')}
                aria-expanded={notifOpen}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {bellCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {bellCount > 99 ? '99+' : bellCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{t('adminNotifications')}</p>
                    {(pendingLoans > 0 || pendingLeave > 0) && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {pendingLoans > 0 && t('adminNotifPendingLoans', { count: pendingLoans })}
                        {pendingLoans > 0 && pendingLeave > 0 && ' · '}
                        {pendingLeave > 0 && t('adminNotifPendingLeave', { count: pendingLeave })}
                      </p>
                    )}
                  </div>
                  <ul className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 && (
                      <li className="px-4 py-6 text-center text-sm text-slate-500">
                        {t('adminNotifEmpty')}
                      </li>
                    )}
                    {notifications.slice(0, 20).map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => goToNotification(n)}
                          className={`w-full border-b border-slate-50 px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                            !n.read_at ? 'bg-brand-50/40' : ''
                          }`}
                        >
                          <span className="font-medium text-slate-900">{n.title}</span>
                          {n.body && (
                            <span className="mt-0.5 block text-xs text-slate-600">{n.body}</span>
                          )}
                          <span className="mt-1 block text-[10px] text-slate-400">
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
          {NAV.map(renderNavLink)}
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
