import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, paths, ensureCsrf } from '../api/client.js';

export default function Login() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await ensureCsrf();
      const res = await api.post(paths.login, { username, password });
      const access = res.data.accessToken || res.data.token;
      localStorage.setItem('token', access);
      if (res.data.refreshToken) {
        localStorage.setItem('refreshToken', res.data.refreshToken);
      }
      localStorage.setItem('role', res.data.role);
      if (res.data.role === 'admin') navigate('/admin');
      else navigate('/employee');
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || t('invalidCredentials'));
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t('login')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('loginSubtitle')}</p>
      </div>
      <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleLogin}>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('username')}
          </label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('password')}
          </label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-500"
        >
          {t('login')}
        </button>
        {message && <p className="text-sm text-red-600">{message}</p>}
      </form>
    </div>
  );
}
