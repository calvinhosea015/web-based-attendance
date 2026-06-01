import axios from 'axios';

/** Ensure split-stack builds hit Railway, not the Vercel SPA (POST → 405 on static host). */
function normalizeApiBase(raw) {
  const fallback = '/api';
  if (!raw || raw === fallback) return fallback;
  let base = String(raw).trim();
  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base.replace(/^\/+/, '')}`;
  }
  base = base.replace(/\/+$/, '');
  if (!base.endsWith('/api')) base = `${base}/api`;
  return base;
}

const baseURL = normalizeApiBase(import.meta.env.VITE_API_BASE);

export const rawApi = axios.create({ baseURL, withCredentials: true });

export const api = axios.create({ baseURL, withCredentials: true });

let csrfToken = null;

export async function ensureCsrf() {
  const res = await rawApi.get('/v1/auth/csrf-token');
  csrfToken = res.data.csrfToken;
  api.defaults.headers.common['X-CSRF-Token'] = csrfToken;
  rawApi.defaults.headers.common['X-CSRF-Token'] = csrfToken;
}

function attachAuthHeaders(config) {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = token.startsWith('Bearer ') ? token : token;
  }
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
}

api.interceptors.request.use(attachAuthHeaders);
rawApi.interceptors.request.use(attachAuthHeaders);

let refreshPromise = null;

/** When responseType is blob, error bodies are still JSON — parse for interceptors and UI. */
async function normalizeErrorResponseData(err) {
  const data = err.response?.data;
  if (!(data instanceof Blob)) return data;
  try {
    const text = await data.text();
    const parsed = JSON.parse(text);
    err.response.data = parsed;
    return parsed;
  } catch {
    return data;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    const parsed = await normalizeErrorResponseData(err);
    const code = parsed?.code;
    if (err.response?.status === 401 && code === 'TOKEN_EXPIRED' && !original._retry) {
      original._retry = true;
      const rt = localStorage.getItem('refreshToken');
      if (!rt) return Promise.reject(err);
      try {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            await ensureCsrf();
            const { data } = await rawApi.post('/v1/auth/refresh', { refreshToken: rt });
            const access = data.accessToken || data.token;
            localStorage.setItem('token', access);
            if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
            return access;
          })().finally(() => {
            refreshPromise = null;
          });
        }
        const access = await refreshPromise;
        original.headers.Authorization = access;
        return api(original);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.reject(err);
  }
);

export const paths = {
  csrf: '/v1/auth/csrf-token',
  login: '/v1/auth/login',
  refresh: '/v1/auth/refresh',
  logout: '/v1/auth/logout',
  offices: '/v1/offices',
  /** @param {string|number} id */
  office: (id) => `/v1/offices/${id}`,
  checkIn: '/v1/attendance/check-in',
  checkOut: '/v1/attendance/check-out',
  attendanceMe: '/v1/attendance/me',
  attendanceAll: '/v1/attendance',
  /** @param {string|number} userId */
  userAttendance: (userId) => `/v1/users/${userId}/attendance`,
  attendanceExport: '/v1/attendance/export',
  attendanceReportProfessional: '/v1/attendance/report/professional',
  users: '/v1/users',
  adminDashboard: '/v1/admin/dashboard',
  employeeSummary: '/v1/employee/me/summary',
  employeeAttendance: '/v1/employee/me/attendance',
  employeePayroll: '/v1/employee/me/payroll',
  adminPayrollSettings: '/v1/admin/payroll/settings',
  /** @param {string} period YYYY-MM */
  adminPayrollPeriod: (period) => `/v1/admin/payroll/periods/${period}`,
  /** @param {string} period YYYY-MM */
  adminPayrollGenerate: (period) => `/v1/admin/payroll/periods/${period}/generate`,
  /** @param {string} period @param {string|number} employeeId */
  adminPayrollEntry: (period, employeeId) =>
    `/v1/admin/payroll/periods/${period}/employees/${employeeId}`,
  /** @param {string} period @param {string|number} employeeId */
  adminPayrollSlip: (period, employeeId) =>
    `/v1/admin/payroll/periods/${period}/employees/${employeeId}/slip/export`,
  /** @param {string} period */
  adminPayrollSlipsAll: (period) => `/v1/admin/payroll/periods/${period}/slips/export`,
  employeeLoans: '/v1/employee/me/loans',
  employeeFieldCode: '/v1/employee/me/field-code',
  employeeFieldDeliveries: '/v1/employee/field-deliveries',
  adminLoanRequestsPending: '/v1/admin/loan-requests/pending',
  adminLoanRequests: '/v1/admin/loan-requests',
  /** @param {string|number} id */
  adminLoanRequest: (id) => `/v1/admin/loan-requests/${id}`,
  adminLeaveSettings: '/v1/admin/leave/settings',
  adminLeaveRequestsPending: '/v1/admin/leave-requests/pending',
  adminLeaveRequests: '/v1/admin/leave-requests',
  /** @param {string|number} id */
  adminLeaveRequest: (id) => `/v1/admin/leave-requests/${id}`,
  employeeLeaveBalances: '/v1/employee/me/leave-balances',
  employeeLeaveRequests: '/v1/employee/me/leave-requests',
  /** @param {string|number} requestId */
  leaveRequestAttachment: (requestId) => `/v1/leave-requests/${requestId}/attachment`,
  /** @param {string} filename */
  leaveAttachment: (filename) =>
    `/v1/leave-attachments/${encodeURIComponent(String(filename || ''))}`,
};

/** Download an axios blob response as a file (same pattern as attendance export). */
export function downloadBlobResponse(res, fallbackFilename) {
  const disposition = res.headers?.['content-disposition'];
  const m = disposition && /filename="?([^";]+)"?/i.exec(disposition);
  const filename = m ? m[1] : fallbackFilename;
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return filename;
}
