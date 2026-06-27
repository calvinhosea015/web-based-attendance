import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Button, DoubleBezel, Field, PasswordInput, inputClass } from '../components/ui.jsx';
import { Reveal } from '../components/Reveal.jsx';
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
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-[420px]">
        <Reveal>
          <div className="text-center">
            <img
              src="/company-logo.png"
              alt={t('appName')}
              className="mx-auto h-16 w-auto sm:h-20"
            />
            <span className="apple-eyebrow mt-8 inline-flex">{t('appName')}</span>
            <h1 className="mt-3 font-display text-display font-semibold text-apple-text sm:text-display-lg">
              {t('login')}
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-[16px] leading-relaxed text-apple-label">
              {t('loginSubtitle')}
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <form className="mt-10" onSubmit={handleLogin}>
            <DoubleBezel className="shadow-apple-md">
              <div className="space-y-5 p-7 sm:p-8">
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
              </div>
            </DoubleBezel>
          </form>
        </Reveal>
      </div>
    </div>
  );
}
