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

const USERS_FILE = path.join(__dirname, 'users.json');
const DEFAULT_USERS = [
  {
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    displayName: 'Administrator',
    email: 'admin@example.com'
  },
  {
    username: 'user',
    password: 'user123',
    role: 'user',
    displayName: 'Regular User',
    email: 'user@example.com'
  }
];

function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    saveUsers(DEFAULT_USERS);
    return DEFAULT_USERS;
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUser(username) {
  const users = loadUsers();
  return users.find(user => user.username === username);
}

function getUserPublic(username) {
  const user = findUser(username);
  if (!user) return null;
  const { password, ...publicData } = user;
  return publicData;
}

function getAllUsers() {
  return loadUsers().map(({ password, ...user }) => user);
}

function getOfficeById(id) {
  return OFFICES.find(office => office.id === id);
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

  const user = getUserPublic(req.session.user.username);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'User account not found.' });
  }

  res.json({ ok: true, user: { ...user, role: req.session.user.role } });
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

app.get(['/', '/index.html'], (req, res) => {
  res.redirect('/login.html');
});

app.get('/api/users', requireAdmin, (req, res) => {
  res.json({ ok: true, users: getAllUsers() });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, displayName, email, role = 'user' } = req.body;
  const cleanUsername = String(username || '').trim();
  const cleanPassword = String(password || '').trim();
  const cleanRole = role === 'admin' ? 'admin' : 'user';

  if (!cleanUsername || !cleanPassword) {
    return res.status(400).json({ ok: false, error: 'Username and password are required.' });
  }

  if (findUser(cleanUsername)) {
    return res.status(400).json({ ok: false, error: 'A user with that username already exists.' });
  }

  const users = loadUsers();
  const newUser = {
    username: cleanUsername,
    password: cleanPassword,
    role: cleanRole,
    displayName: String(displayName || cleanUsername),
    email: String(email || '')
  };

  users.push(newUser);
  saveUsers(users);
  res.json({ ok: true, user: getUserPublic(cleanUsername) });
});

app.delete('/api/users/:username', requireAdmin, (req, res) => {
  const { username } = req.params;

  if (username === req.session.user.username) {
    return res.status(400).json({ ok: false, error: 'You cannot delete the signed-in admin account.' });
  }

  if (username === 'admin') {
    return res.status(400).json({ ok: false, error: 'The admin account cannot be removed.' });
  }

  const users = loadUsers();
  const exists = users.some(user => user.username === username);
  if (!exists) {
    return res.status(404).json({ ok: false, error: 'User not found.' });
  }

  saveUsers(users.filter(user => user.username !== username));
  res.json({ ok: true });
});

app.get('/api/status', requireUser, (req, res) => {
  const records = loadAttendance();
  const username = req.session.user.username;
  const lastRecord = records.find(record => record.username === username);

  if (!lastRecord) {
    return res.json({ ok: true, status: { checkedIn: false } });
  }

  const type = lastRecord.type || 'checkin';
  res.json({
    ok: true,
    status: {
      checkedIn: type === 'checkin',
      action: type,
      officeId: lastRecord.officeId,
      officeName: lastRecord.officeName,
      timestamp: lastRecord.timestamp,
      note: lastRecord.note || ''
    }
  });
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

app.post('/api/checkin', requireUser, (req, res) => {
  const { latitude, longitude, note, officeId, action = 'checkin' } = req.body;
  const office = getOfficeById(officeId);
  const user = findUser(req.session.user.username);

  if (!user) {
    return res.status(401).json({ ok: false, error: 'User account not found.' });
  }

  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !office) {
    return res.status(400).json({ ok: false, error: 'Latitude, longitude, and valid office selection are required.' });
  }

  const records = loadAttendance();
  const lastRecord = records.find(record => record.username === user.username);
  const lastType = lastRecord ? lastRecord.type || 'checkin' : null;

  if (action === 'checkin' && lastType === 'checkin') {
    return res.status(400).json({ ok: false, error: 'You are already checked in. Please check out first.' });
  }

  if (action === 'checkout' && lastType !== 'checkin') {
    return res.status(400).json({ ok: false, error: 'You are not currently checked in.' });
  }

  const distance = getDistanceMeters(latitude, longitude, office.latitude, office.longitude);
  const withinRange = distance <= office.radiusMeters;

  if (!withinRange) {
    return res.status(400).json({
      ok: false,
      error: `You are ${Math.round(distance)} meters away from ${office.name}. You must be within ${office.radiusMeters} meters to ${action}.`
    });
  }

  const timestamp = new Date().toISOString();
  const record = {
    username: user.username,
    displayName: user.displayName || user.username,
    email: user.email,
    officeId: office.id,
    officeName: office.name,
    note: note || '',
    latitude,
    longitude,
    distance: Math.round(distance),
    timestamp,
    type: action
  };

  records.unshift(record);
  saveAttendance(records);

  res.json({ ok: true, record, message: `Successfully recorded ${action}.` });
});

app.get('/api/export', requireAdmin, (req, res) => {
  const records = loadAttendance();
  const headers = ['Type', 'Username', 'Name', 'Email', 'Office', 'Timestamp', 'Distance (m)', 'Latitude', 'Longitude', 'Note'];
  const rows = records.map(record => [
    record.type || 'checkin',
    record.username || '',
    record.displayName || '',
    record.email || '',
    record.officeName || '',
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
