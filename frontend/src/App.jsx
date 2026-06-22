import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ensureCsrf } from './api/client.js';
import Login from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminPayroll from './pages/AdminPayroll.jsx';
import AdminFieldDashboard from './pages/AdminFieldDashboard.jsx';
import AdminLoans from './pages/AdminLoans.jsx';
import AdminLeave from './pages/AdminLeave.jsx';
import AdminCorrections from './pages/AdminCorrections.jsx';
import AdminReports from './pages/AdminReports.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import FinanceFieldOmset from './pages/FinanceFieldOmset.jsx';

function PublicHeader({ showName = true, showLogo = true }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="relative z-20 px-4 pt-6 sm:px-6">
      <div className="nav-island mx-auto max-w-6xl">
        <div className="nav-island-inner">
          <span className="flex items-center gap-3 font-display text-[15px] font-semibold tracking-tight text-apple-text">
            {showLogo ? (
              <img src="/company-logo.png" alt={t('appName')} className="h-8 w-auto rounded-xl" />
            ) : null}
            {showName ? t('appName') : null}
          </span>
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
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const isAdminRoute =
    pathname.startsWith('/admin') || pathname.startsWith('/finance');
  const isLoginRoute = pathname === '/login';

  useEffect(() => {
    ensureCsrf().catch(() => {});
  }, []);

  useEffect(() => {
    const lang = i18n.language?.startsWith('id') ? 'id' : 'en';
    document.documentElement.lang = lang;
    document.title = t('appName');
  }, [i18n.language, t]);

  return (
    <div className="page-canvas font-sans">
      {!isAdminRoute && (
        <PublicHeader showName={!isLoginRoute} showLogo={!isLoginRoute} />
      )}
      <main className="relative z-10">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/payroll" element={<AdminPayroll />} />
          <Route path="/admin/field" element={<AdminFieldDashboard />} />
          <Route path="/admin/loans" element={<AdminLoans />} />
          <Route path="/admin/leave" element={<AdminLeave />} />
          <Route path="/admin/corrections" element={<AdminCorrections />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/employee" element={<EmployeeDashboard />} />
          <Route path="/finance/field-omset" element={<FinanceFieldOmset />} />
          <Route path="/user" element={<Navigate to="/employee" replace />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}
