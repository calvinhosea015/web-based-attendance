const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'attendance.json');

const OFFICES = [
  {
    id: 'rs-darmo',
    name: 'RS Darmo',
    latitude: -7.287414,
    longitude: 112.73766,
    radiusMeters: 200
  },
  {
    id: 'dharmahusada',
    name: 'Dharmahusada',
    latitude: -7.275582,
    longitude: 112.7848672,
    radiusMeters: 200
  },
  {
    id: 'sidoyoso',
    name: 'Sidoyoso',
    latitude: -7.239267,
    longitude: 112.759906,
    radiusMeters: 200
  }
];

const USERS = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'user', password: 'user123', role: 'user' }
];

function getOfficeById(id) {
  return OFFICES.find(office => office.id === id);
}

function findUser(username) {
  return USERS.find(user => user.username === username);
}

app.use(express.json());
app.use(
  session({
    secret: 'attendance-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 4 * 60 * 60 * 1000 }
  })
);

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ ok: false, error: 'Authentication required.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin access required.' });
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'user') {
    return res.status(403).json({ ok: false, error: 'User access required.' });
  }
  next();
}

function redirectIfNotLoggedIn(req, res, next) {
  if (!req.session.user) {
    return res.redirect(`/login.html?next=${encodeURIComponent(req.path)}`);
  }
  next();
}

function redirectIfNotAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect(`/login.html?next=admin.html`);
  }
  next();
}

function redirectIfNotUser(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'user') {
    return res.redirect(`/login.html?next=user.html`);
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = findUser(username);

  if (!user || user.password !== password) {
    return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
  }

  req.session.user = { username: user.username, role: user.role };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Logout failed.' });
    }
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ ok: false, error: 'Not authenticated.' });
  }
  res.json({ ok: true, user: req.session.user });
});

app.get('/user.html', redirectIfNotUser, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

app.get('/admin.html', redirectIfNotAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/offices', requireLogin, (req, res) => {
  res.json({ offices: OFFICES });
});

app.use(express.static(path.join(__dirname, 'public')));

function loadAttendance() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function saveAttendance(records) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

app.get('/api/attendance', requireAdmin, (req, res) => {
  const records = loadAttendance();
  res.json({ records });
});

app.post('/api/checkin', requireLogin, (req, res) => {
  const { name, email, latitude, longitude, note, officeId } = req.body;
  const office = getOfficeById(officeId);

  if (!name || !email || typeof latitude !== 'number' || typeof longitude !== 'number' || !office) {
    return res.status(400).json({ ok: false, error: 'Name, email, latitude, longitude, and office selection are required.' });
  }

  const distance = getDistanceMeters(latitude, longitude, office.latitude, office.longitude);
  const withinRange = distance <= office.radiusMeters;

  if (!withinRange) {
    return res.status(400).json({
      ok: false,
      error: `You are ${Math.round(distance)} meters away from ${office.name}. You must be within ${office.radiusMeters} meters to check in.`
    });
  }

  const records = loadAttendance();
  const timestamp = new Date().toISOString();
  const record = {
    name,
    email,
    officeId: office.id,
    officeName: office.name,
    note: note || '',
    latitude,
    longitude,
    distance: Math.round(distance),
    timestamp
  };

  records.unshift(record);
  saveAttendance(records);

  res.json({ ok: true, record, message: 'Check-in recorded successfully.' });
});

app.get('/api/export', requireAdmin, (req, res) => {
  const records = loadAttendance();
  const headers = ['Office', 'Name', 'Email', 'Timestamp', 'Distance (m)', 'Latitude', 'Longitude', 'Note'];
  const rows = records.map(record => [
    record.officeName || '',
    record.name,
    record.email,
    record.timestamp,
    record.distance,
    record.latitude,
    record.longitude,
    record.note
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(value => `"${String(value || '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance-records.csv"');
  res.send(csv);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Attendance server running: http://localhost:${PORT}`);
});
