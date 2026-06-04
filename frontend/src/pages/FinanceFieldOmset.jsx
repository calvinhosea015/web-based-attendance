import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui.jsx';
import FieldOperationsPanel from '../components/FieldOperationsPanel.jsx';
import { ROLE_ADMIN, canViewFieldOmsetReport } from '../roles.js';
import { currentPayrollPeriodKey } from '../utils/payrollPeriod.js';

export default function FinanceFieldOmset() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = localStorage.getItem('role');
  const isAdmin = role === ROLE_ADMIN;

  const initialPeriod = () => {
    const q = searchParams.get('period');
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    return currentPayrollPeriodKey();
  };

  const [period, setPeriod] = useState(initialPeriod);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }
    if (!canViewFieldOmsetReport(role)) {
      navigate('/login');
      return;
    }
    if (isAdmin) {
      const q = searchParams.toString();
      navigate(`/admin/field${q ? `?${q}` : ''}`, { replace: true });
    }
  }, [navigate, role, isAdmin, searchParams]);

  const onPeriodChange = (next) => {
    setPeriod(next);
    setSearchParams(next ? { period: next } : {}, { replace: true });
  };

  if (isAdmin) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/employee" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            ← {t('payrollEmployeeTitle')}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {t('fieldOmsetReportTitle')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t('fieldOmsetReportSubtitle')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
          {t('logout')}
        </Button>
      </div>
      <FieldOperationsPanel
        period={period}
        onPeriodChange={onPeriodChange}
        showPabrik={false}
        showTonase={false}
        showOmset
      />
    </div>
  );
}
