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
import { Button, EmptyState, ListGroup, ListRow, PageSection, StatCard } from '../ui.jsx';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '../../theme.js';

export default function AdminOverviewSection({ overview, chartData }) {
  const { t } = useTranslation();
  const hasChartData = Array.isArray(chartData) && chartData.length > 0;

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
        {hasChartData ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="present" name={t('presentLike')} fill={CHART_COLORS.positive} radius={[6, 6, 0, 0]} />
                <Bar dataKey="late" name={t('late')} fill={CHART_COLORS.warning} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title={t('payrollSummaryEmpty')} />
        )}
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
          <ListGroup>
            {overview.payrollSummary.map((p) => (
              <ListRow key={p.payroll_period} className="justify-between">
                <span className="font-medium text-apple-text">{p.payroll_period}</span>
                <span className="text-apple-label tabular-nums">
                  {t('rows')}: {p.rows} · {t('total')}: {Number(p.total_final).toLocaleString('id-ID')}
                </span>
              </ListRow>
            ))}
          </ListGroup>
        ) : (
          <EmptyState title={t('payrollSummaryEmpty')} />
        )}
      </PageSection>
    </>
  );
}
