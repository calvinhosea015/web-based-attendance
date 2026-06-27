import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import FieldOperationsPanel from '../components/FieldOperationsPanel.jsx';

export default function AdminFieldDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem('token') || localStorage.getItem('role') !== 'admin') {
      navigate('/login');
    }
  }, [navigate]);

  return (
    <AdminLayout
      title={t('fieldOpsDashboardTitle')}
      subtitle={t('fieldOpsDashboardSubtitle')}
    >
      <FieldOperationsPanel showDeliveryRecap recapEditable />
    </AdminLayout>
  );
}
