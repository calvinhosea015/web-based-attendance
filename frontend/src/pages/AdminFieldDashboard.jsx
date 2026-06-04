import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import FieldOperationsPanel from '../components/FieldOperationsPanel.jsx';
import { currentPayrollPeriodKey } from '../utils/payrollPeriod.js';

export default function AdminFieldDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialPeriod = () => {
    const q = searchParams.get('period');
    if (q && /^\d{4}-\d{2}$/.test(q)) return q;
    return currentPayrollPeriodKey();
  };

  const [period, setPeriod] = useState(initialPeriod);

  useEffect(() => {
    if (!localStorage.getItem('token') || localStorage.getItem('role') !== 'admin') {
      navigate('/login');
    }
  }, [navigate]);

  const onPeriodChange = (next) => {
    setPeriod(next);
    setSearchParams(next ? { period: next } : {}, { replace: true });
  };

  return (
    <AdminLayout
      title={t('fieldOpsDashboardTitle')}
      subtitle={t('fieldOpsDashboardSubtitle')}
    >
      <FieldOperationsPanel period={period} onPeriodChange={onPeriodChange} />
    </AdminLayout>
  );
}
