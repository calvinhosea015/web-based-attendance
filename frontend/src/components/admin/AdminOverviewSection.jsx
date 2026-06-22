import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, PageSection, StatCard } from '../ui.jsx';

export default function AdminOverviewSection({ overview, chartData }) {
  const { t } = useTranslation();

  return (
    <>
      {overview && (
        <section className="bento-grid">
          <StatCard
            label={t('totalEmployees')}
            value={overview.totalEmployees}
            tone="blue"
            featured
            className="bento-featured"
          />
          <StatCard
            label={t('presentToday')}
            value={overview.presentToday}
            tone="emerald"
            className="bento-compact"
          />
          <StatCard
            label={t('lateToday')}
            value={overview.lateToday}
            tone="amber"
            className="bento-compact"
          />
          <StatCard
            label={t('absentToday')}
            value={overview.absentToday}
            tone="rose"
            className="bento-wide"
          />
        </section>
      )}

      <PageSection title={t('attendanceCharts')} bodyClassName="!pt-4">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#86868b' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#86868b' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.06)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                }}
              />
              <Bar dataKey="present" name={t('presentLike')} fill="#34c759" radius={[6, 6, 0, 0]} />
              <Bar dataKey="late" name={t('late')} fill="#ff9500" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </PageSection>

      <PageSection
        title={t('payrollSummary')}
        action={
          <Link to="/admin/payroll">
            <Button variant="secondary" size="sm">
              {t('payrollOpenAdmin')}
            </Button>
          </Link>
        }
      >
        {overview?.payrollSummary?.length > 0 ? (
          <ul className="divide-y divide-black/[0.04] overflow-hidden rounded-apple-lg border border-black/[0.06]">
            {overview.payrollSummary.map((p) => (
              <li key={p.payroll_period} className="flex justify-between gap-4 px-4 py-3.5 text-[15px] sm:px-5">
                <span className="font-medium text-apple-text">{p.payroll_period}</span>
                <span className="text-apple-label tabular-nums">
                  {t('rows')}: {p.rows} · {t('total')}: {Number(p.total_final).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-apple-label">{t('payrollSummaryEmpty')}</p>
        )}
      </PageSection>
    </>
  );
}
