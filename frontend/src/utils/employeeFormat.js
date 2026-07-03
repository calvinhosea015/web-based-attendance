import i18n from '../i18n.js';
import { translateApiMessage } from '../translateApi.js';

export function formatApiError(err) {
  if (!err.response && (err.message === 'Network Error' || err.code === 'ERR_NETWORK')) {
    return i18n.t('apiUnreachable');
  }
  return translateApiMessage(err);
}

export function toDateTimeLocalValue(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalValue(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
