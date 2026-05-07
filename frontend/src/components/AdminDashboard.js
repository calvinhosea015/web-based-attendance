import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import './Dashboard.css';

const AdminDashboard = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [offices, setOffices] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', office_id: '' });
  const [newOffice, setNewOffice] = useState({ name: '', locationLink: '' });
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || localStorage.getItem('role') !== 'admin') navigate('/login');
    fetchUsers();
    fetchAttendance();
    fetchOffices();
  }, [navigate]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5001/users', {
        headers: { Authorization: localStorage.getItem('token') }
      });
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAttendance = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5001/attendance', {
        headers: { Authorization: localStorage.getItem('token') }
      });
      setAttendance(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOffices = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5001/offices', {
        headers: { Authorization: localStorage.getItem('token') }
      });
      setOffices(res.data);
      if (!newUser.office_id && res.data.length) {
        setNewUser({ ...newUser, office_id: res.data[0].id });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddOffice = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://127.0.0.1:5001/offices', newOffice, {
        headers: { Authorization: localStorage.getItem('token') }
      });
      setMessage(t('officeAdded'));
      fetchOffices();
      setNewOffice({ name: '', locationLink: '' });
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleDeleteOffice = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5001/offices/${id}`, {
        headers: { Authorization: localStorage.getItem('token') }
      });
      setMessage(t('officeDeleted'));
      fetchOffices();
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://127.0.0.1:5001/users', newUser, {
        headers: { Authorization: localStorage.getItem('token') }
      });
      setMessage(t('userAdded'));
      fetchUsers();
      setNewUser({ username: '', password: '', role: 'user', office_id: offices.length ? offices[0].id : '' });
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await axios.delete(`http://127.0.0.1:5001/users/${id}`, {
        headers: { Authorization: localStorage.getItem('token') }
      });
      setMessage(t('userDeleted'));
      fetchUsers();
    } catch (err) {
      setMessage(err.response?.data?.message || err.message);
    }
  };

  const handleExport = async () => {
    try {
      const res = await axios.post('http://127.0.0.1:5001/export', {}, {
        headers: { Authorization: localStorage.getItem('token') },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'attendance.xlsx');
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <h2>{t('adminDashboard')}</h2>
      <button onClick={handleExport}>{t('exportExcel')}</button>
      <button onClick={handleLogout}>{t('logout')}</button>
      <h3>{t('manageUsers')}</h3>
      <form onSubmit={handleAddUser}>
        <input
          type="text"
          placeholder={t('username')}
          value={newUser.username}
          onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder={t('password')}
          value={newUser.password}
          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
          required
        />
        <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <select value={newUser.office_id} onChange={(e) => setNewUser({ ...newUser, office_id: parseInt(e.target.value) })}>
          {offices.length ? (
            offices.map((office) => (
              <option key={office.id} value={office.id}>{office.name}</option>
            ))
          ) : (
            <option value="">{t('noOfficesAvailable')}</option>
          )}
        </select>
        <button type="submit">{t('addUser')}</button>
      </form>
      <h3>{t('manageOffices')}</h3>
      <form onSubmit={handleAddOffice}>
        <input
          type="text"
          placeholder={t('officeName')}
          value={newOffice.name}
          onChange={(e) => setNewOffice({ ...newOffice, name: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder={t('locationLink')}
          value={newOffice.locationLink}
          onChange={(e) => setNewOffice({ ...newOffice, locationLink: e.target.value })}
          required
        />
        <button type="submit">{t('addOffice')}</button>
      </form>
      <ul>
        {offices.map((office) => (
          <li key={office.id}>
            {office.name} {office.link ? (<><a href={office.link} target="_blank" rel="noreferrer">{t('mapLink')}</a></>) : (<span>({office.lat.toFixed(6)}, {office.lng.toFixed(6)})</span>)} <button onClick={() => handleDeleteOffice(office.id)}>{t('delete')}</button>
          </li>
        ))}
      </ul>
      <ul>
        {users.map(user => (
          <li key={user.id}>
            {user.username} ({user.role}) <button onClick={() => handleDeleteUser(user.id)}>{t('delete')}</button>
          </li>
        ))}
      </ul>
      <h3>{t('attendance')}</h3>
      <ul>
        {attendance.map(att => (
          <li key={att.id}>
            {att.username} - {att.office_name} - {att.check_in} - {att.check_out || 'Not checked out'}
          </li>
        ))}
      </ul>
      {message && <p>{message}</p>}
    </div>
  );
};

export default AdminDashboard;