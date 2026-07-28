import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card } from '../ui.jsx';
import { api, paths } from '../../api/client.js';
import { translateApiMessage } from '../../translateApi.js';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatDate.js';

function deliverySummary(row, t) {
  const parts = [];
  if (row.valid_on) parts.push(formatDisplayDate(row.valid_on));
  const officer = row.delivery_officer_name || row.delivery_employee_code;
  if (officer) parts.push(officer);
  if (row.pabrik_code) parts.push(row.pabrik_code);
  if (row.kode_barang) parts.push(row.kode_barang);
  if (row.nomor_surat_jalan) parts.push(`SJ ${row.nomor_surat_jalan}`);
  return parts.length ? parts.join(' · ') : t('fieldDeliveryRecapReviewLogUnknownDelivery');
}

export default function DeliveryRecapReviewLog() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(paths.adminDeliveryRecapReviews, { params: { limit: 100 } });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(translateApiMessage(err) || t('dashboardLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card
      title={t('fieldDeliveryRecapReviewLogTitle')}
      description={t('fieldDeliveryRecapReviewLogHint')}
      action={
        <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={load}>
          {loading ? t('loading') : t('fieldOmsetRefresh')}
        </Button>
      }
    >
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading && !rows.length ? (
        <p className="text-[15px] text-apple-label">{t('loading')}</p>
      ) : rows.length ? (
        <ul className="max-h-[28rem] space-y-3 overflow-y-auto text-sm">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-apple-lg border border-black/[0.04] bg-apple-fill/80 px-3 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-apple-text">
                  {row.reviewer_full_name || row.reviewer_username || '—'}
                </span>
                <Badge variant={row.is_correct ? 'success' : 'muted'}>
                  {row.is_correct
                    ? t('fieldDeliveryRecapReviewCorrect')
                    : t('fieldDeliveryRecapReviewIncorrect')}
                </Badge>
                <span className="text-xs text-apple-label">
                  {formatDisplayDateTime(row.reviewed_at)}
                </span>
              </div>
              <p className="mt-1 text-xs text-apple-label">
                {t('fieldDeliveryRecapReviewLogDelivery')}: {deliverySummary(row, t)}
              </p>
              {row.notes ? (
                <p className="mt-2 text-sm text-apple-text">“{row.notes}”</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-apple-label">{t('fieldDeliveryRecapReviewLogEmpty')}</p>
      )}
    </Card>
  );
}
