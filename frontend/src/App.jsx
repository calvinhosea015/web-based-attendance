import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ensureCsrf } from './api/client.js';
import Login from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    ensureCsrf().catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-slate-800">Attendance</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => i18n.changeLanguage('en')}
            >
              EN
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => i18n.changeLanguage('id')}
            >
              ID
            </button>
          </div>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/employee" element={<EmployeeDashboard />} />
          <Route path="/user" element={<Navigate to="/employee" replace />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}
