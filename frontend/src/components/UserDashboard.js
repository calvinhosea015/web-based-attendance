import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import './Dashboard.css';

const UserDashboard = () => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [offices, setOffices] = useState([]);
  const [selectedOffice, setSelectedOffice] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/login');

    const fetchOffices = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:5001/offices', {
          headers: { Authorization: localStorage.getItem('token') }
        });
        setOffices(res.data);
        if (res.data.length) setSelectedOffice(res.data[0].id);
      } catch (err) {
        console.error(err);
      }
    };

    const fetchHistory = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:5001/attendance/me', {
          headers: { Authorization: localStorage.getItem('token') }
        });
        setHistory(res.data);
      } catch (err) {
        console.error(err);
      }
    };

    const updateLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setCurrentLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              time: new Date(position.timestamp).toLocaleTimeString()
            });
          },
          (error) => {
            setMessage(error.message);
          },
          { enableHighAccuracy: true }
        );
      } else {
        setMessage('Geolocation not supported');
      }
    };

    fetchOffices();
    fetchHistory();
    updateLocation();
    const intervalId = setInterval(updateLocation, 30000);

    return () => clearInterval(intervalId);
  }, [navigate]);

  const handleCheckIn = async () => {
    if (!selectedOffice) {
      setMessage(t('selectOffice'));
      return;
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await axios.post('http://127.0.0.1:5001/checkin', { lat: latitude, lng: longitude, office_id: selectedOffice }, {
            headers: { Authorization: localStorage.getItem('token') }
          });
          setMessage(t('checkedIn'));
        } catch (err) {
          setMessage(err.response?.data?.message || err.message);
        }
      });
    } else {
      setMessage('Geolocation not supported');
    }
  };

  const handleCheckOut = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await axios.post('http://127.0.0.1:5001/checkout', { lat: latitude, lng: longitude }, {
            headers: { Authorization: localStorage.getItem('token') }
          });
          setMessage(t('checkedOut'));
        } catch (err) {
          setMessage(err.response?.data?.message || err.message);
        }
      });
    } else {
      setMessage('Geolocation not supported');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <h2>{t('dashboard')}</h2>
      <div className="office-select-wrapper">
        <label htmlFor="office-select">{t('office')}</label>
        {offices.length ? (
          <select id="office-select" value={selectedOffice} onChange={(e) => setSelectedOffice(e.target.value)}>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>{office.name}</option>
            ))}
          </select>
        ) : (
          <div>{t('noOfficesAvailable')}</div>
        )}
      </div>
      <div className="location-display">
        <strong>{t('currentLocation')}:</strong>
        {currentLocation ? (
          <div>
            <div>{t('latitude')}: {currentLocation.lat.toFixed(6)}</div>
            <div>{t('longitude')}: {currentLocation.lng.toFixed(6)}</div>
            <div>{t('updatedAt')}: {currentLocation.time}</div>
          </div>
        ) : (
          <div>{t('locating')}</div>
        )}
      </div>
      <button onClick={handleCheckIn} disabled={!offices.length}>{t('checkIn')}</button>
      <button onClick={handleCheckOut}>{t('checkOut')}</button>
      <button onClick={handleLogout}>{t('logout')}</button>
      {message && <p>{message}</p>}
      <div className="history-panel">
        <h3>{t('history')}</h3>
        {history.length ? (
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                <strong>{item.office_name}</strong><br />
                {t('checkIn')}: {item.check_in}<br />
                {t('checkOut')}: {item.check_out || t('notCheckedOut')}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('noHistory')}</p>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;