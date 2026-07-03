import React from 'react';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import OmsetReport from '../components/field/OmsetReport.jsx';
import PabrikCatalog from '../components/field/PabrikCatalog.jsx';
import LocationManager from '../components/field/LocationManager.jsx';
import DeliveryRecap from '../components/field/DeliveryRecap.jsx';

export default function AdminFieldDashboard() {
  const { t } = useTranslation();

  return (
    <AdminLayout
      title={t('fieldOpsDashboardTitle')}
      subtitle={t('fieldOpsDashboardSubtitle')}
    >
      <OmsetReport />
      <PabrikCatalog />
      <LocationManager />
      <DeliveryRecap editable />
    </AdminLayout>
  );
}
