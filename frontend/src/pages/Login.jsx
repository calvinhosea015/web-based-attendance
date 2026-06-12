import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Field, PasswordInput, inputClass } from '../components/ui.jsx';
import { api, paths, ensureCsrf } from '../api/client.js';
import { translateApiMessage } from '../translateApi.js';
import { canAccessEmployeePayrollPortal } from '../roles.js';

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
      else if (canAccessEmployeePayrollPortal(res.data.role)) navigate('/employee');
      else setMessage(t('invalidCredentials'));
    } catch (err) {
      setMessage(translateApiMessage(err) || t('invalidCredentials'));
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-[400px]">
        <div className="text-center">
          <img
            src="/company-logo.png"
            alt={t('appName')}
            className="mx-auto h-24 w-auto"
          />
          <h1 className="mt-8 text-[28px] font-semibold tracking-tightest text-apple-text">
            {t('login')}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-apple-label">{t('loginSubtitle')}</p>
        </div>

        <form
          className="mt-10 space-y-5 rounded-apple-xl border border-black/[0.06] bg-white p-8 shadow-apple-md"
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
          <Button type="submit" variant="primary" className="w-full" size="lg">
            {t('login')}
          </Button>
        </form>
      </div>
    </div>
  );
}
