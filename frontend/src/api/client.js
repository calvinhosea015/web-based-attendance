import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE || '/api';

export const rawApi = axios.create({ baseURL, withCredentials: true });

export const api = axios.create({ baseURL, withCredentials: true });

let csrfToken = null;

export async function ensureCsrf() {
  const res = await rawApi.get('/v1/auth/csrf-token');
  csrfToken = res.data.csrfToken;
  api.defaults.headers.common['X-CSRF-Token'] = csrfToken;
  rawApi.defaults.headers.common['X-CSRF-Token'] = csrfToken;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = token.startsWith('Bearer ') ? token : token;
  }
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

let refreshPromise = null;
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    const code = err.response?.data?.code;
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
  checkIn: '/v1/attendance/check-in',
  checkOut: '/v1/attendance/check-out',
  attendanceMe: '/v1/attendance/me',
  attendanceAll: '/v1/attendance',
  attendanceExport: '/v1/attendance/export',
  attendanceReportProfessional: '/v1/attendance/report/professional',
  users: '/v1/users',
  adminDashboard: '/v1/admin/dashboard',
  employeeSummary: '/v1/employee/me/summary',
  employeeAttendance: '/v1/employee/me/attendance',
  employeePayroll: '/v1/employee/me/payroll',
  employeeLeaves: '/v1/employee/me/leaves',
};
