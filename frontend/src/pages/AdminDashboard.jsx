import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminLayout from '../components/AdminLayout.jsx';
import AdminOverviewSection from '../components/admin/AdminOverviewSection.jsx';
import UserManagement from '../components/admin/UserManagement.jsx';
import AttendanceManagement from '../components/admin/AttendanceManagement.jsx';
import { Alert } from '../components/ui.jsx';
import { api, paths, ensureCsrf } from '../api/client.js';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [offices, setOffices] = useState([]);
  const [pabriks, setPabriks] = useState([]);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const notify = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  useEffect(() => {
    (async () => {
      try {
        await ensureCsrf();
        const [o, dash, pabrikRes] = await Promise.all([
          api.get(paths.offices),
          api.get(paths.adminDashboard),
          api.get(paths.adminPabriks).catch(() => ({ data: { pabriks: [] } })),
        ]);
        setOffices(o.data);
        setOverview(dash.data);
        setPabriks(
          Array.isArray(pabrikRes.data?.pabriks) ? pabrikRes.data.pabriks : []
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  return (
    <AdminLayout
      title={t('adminDashboard')}
      subtitle={t('adminSubtitle')}
    >
      <div className="space-y-6">
        {message && (
          <Alert tone={messageTone} onDismiss={() => notify('')}>
            {message}
          </Alert>
        )}

        <AdminOverviewSection overview={overview} />
        <UserManagement offices={offices} pabriks={pabriks} notify={notify} onUsersChange={setUsers} />
        <AttendanceManagement users={users} notify={notify} />
      </div>
    </AdminLayout>
  );
}
