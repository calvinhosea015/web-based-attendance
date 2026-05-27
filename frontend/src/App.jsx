import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ensureCsrf } from './api/client.js';
import Login from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminPayroll from './pages/AdminPayroll.jsx';
import AdminLoans from './pages/AdminLoans.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';

function PublicHeader() {
  const { t, i18n } = useTranslation();
  return (
    <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
          <img
            src="/company-logo.png"
            alt={t('appName')}
            className="h-8 w-auto rounded-md border border-slate-200 bg-white p-0.5"
          />
          {t('appName')}
        </span>
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
      </div>
    </header>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith('/admin');

  useEffect(() => {
    ensureCsrf().catch(() => {});
  }, []);

  useEffect(() => {
    const lang = i18n.language?.startsWith('id') ? 'id' : 'en';
    document.documentElement.lang = lang;
    document.title = t('appName');
  }, [i18n.language, t]);

  return (
    <div className="min-h-screen font-sans">
      {!isAdminRoute && <PublicHeader />}
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/payroll" element={<AdminPayroll />} />
          <Route path="/admin/loans" element={<AdminLoans />} />
          <Route path="/employee" element={<EmployeeDashboard />} />
          <Route path="/user" element={<Navigate to="/employee" replace />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}
