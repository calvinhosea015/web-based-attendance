import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, PageHero } from '../components/ui.jsx';
import { Reveal } from '../components/Reveal.jsx';
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
      navigate('/admin/field', { replace: true });
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
    <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
      <Reveal>
        <Link to="/employee" className="apple-link text-[15px]">
          ← {t('payrollEmployeeTitle')}
        </Link>
        <PageHero
          eyebrow={t('fieldOpsTabOmset')}
          title={t('fieldOmsetReportTitle')}
          subtitle={t('fieldOmsetReportSubtitle')}
          className="!mb-10 !mt-4"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              {t('logout')}
            </Button>
          }
        />
      </Reveal>
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
