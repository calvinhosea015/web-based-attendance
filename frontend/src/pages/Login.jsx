import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Field, PasswordInput, inputClass } from '../components/ui.jsx';
import { api, paths, ensureCsrf } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import { isAttendanceRole } from '../roles.js';

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
      else if (isAttendanceRole(res.data.role)) navigate('/employee');
      else setMessage(t('invalidCredentials'));
    } catch (err) {
      setMessage(translateApiMessage(err) || t('invalidCredentials'));
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col lg:flex-row">
      <div className="flex flex-1 flex-col justify-center bg-gradient-to-br from-black via-slate-800 to-slate-900 px-8 py-12 text-white lg:px-16">
        <div className="mx-auto max-w-md lg:mx-0">
          <img
            src="/company-logo.png"
            alt={t('appName')}
            className="h-14 w-auto rounded-xl border border-white/40 bg-white/95 p-1 shadow-lg grayscale"
          />
          <p className="mt-6 text-sm leading-relaxed text-slate-200">{t('loginSubtitle')}</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <h2 className="text-xl font-semibold text-slate-900">{t('login')}</h2>
          <form
            className="mt-8 space-y-5 rounded-xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-slate-200/40"
            onSubmit={handleLogin}
          >
            <Field label={t('username')}>
              <input
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>
            <Field label={t('password')}>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            {message && <Alert tone="error">{message}</Alert>}
            <Button type="submit" variant="primary" className="w-full bg-black hover:bg-slate-800" size="lg">
              {t('login')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
