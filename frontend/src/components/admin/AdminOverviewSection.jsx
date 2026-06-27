import React from 'react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '../ui.jsx';

export default function AdminOverviewSection({ overview }) {
  const { t } = useTranslation();

  if (!overview) return null;

  return (
    <section>
      <StatCard
        label={t('totalEmployees')}
        value={overview.totalEmployees}
        tone="blue"
        featured
      />
    </section>
  );
}
