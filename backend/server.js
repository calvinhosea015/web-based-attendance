const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const http = require('http');
const https = require('https');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

// Database setup
const db = new sqlite3.Database('./attendance.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the SQLite database.');
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    office_id INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS offices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    lat REAL,
    lng REAL,
    link TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    check_in DATETIME,
    check_out DATETIME,
    lat REAL,
    lng REAL,
    office_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (office_id) REFERENCES offices (id)
  )`);

  db.all(`PRAGMA table_info(offices)`, [], (err, rows) => {
    if (!err) {
      const hasLink = rows.some((column) => column.name === 'link');
      const insertSeedOffice = () => {
        db.run(`INSERT OR IGNORE INTO offices (name, lat, lng, link) VALUES (?, ?, ?, ?)`, ['rs darmo', -7.287414, 112.73766, 'https://maps.app.goo.gl/x9nEcHGRREfzCiwC9']);
      };
      if (!hasLink) {
        db.run(`ALTER TABLE offices ADD COLUMN link TEXT`, (alterErr) => {
          if (alterErr) console.error(alterErr.message);
          insertSeedOffice();
        });
      } else {
        insertSeedOffice();
      }
    } else {
      db.run(`INSERT OR IGNORE INTO offices (name, lat, lng, link) VALUES (?, ?, ?, ?)`, ['rs darmo', -7.287414, 112.73766, 'https://maps.app.goo.gl/x9nEcHGRREfzCiwC9']);
    }
  });

  // Create admin user if not exists
  const adminPassword = bcrypt.hashSync('admin123', 8);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, ['admin', adminPassword, 'admin']);
});

// Resolve redirects to get the final URL
function resolveRedirect(urlToResolve, limit = 5) {
  return new Promise((resolve, reject) => {
    if (limit === 0) return reject(new Error('Too many redirects'));
    try {
      const urlObj = new URL(urlToResolve);
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.request({
        method: 'HEAD',
        host: urlObj.hostname,
        path: urlObj.pathname + (urlObj.search || ''),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(resolveRedirect(res.headers.location.startsWith('http') ? res.headers.location : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`, limit - 1));
        } else {
          resolve(urlToResolve);
        }
      });
      req.on('error', reject);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function parseMapsLink(link) {
  if (!link) return null;
  const trimmed = link.trim();
  const patterns = [
    /@([-\d.]+),([-\d.]+)/,
    /[?&]q=([-\d.]+),([-\d.]+)/,
    /!3d([-\d.]+)!4d([-\d.]+)/,
    /\/place\/.*\/([-\d.]+),([-\d.]+)(?:\/|$)/,
    /\/search\/.*@([-\d.]+),([-\d.]+)/
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    }
  }
  return null;
}

async function getCoordinatesFromLink(link) {
  const direct = parseMapsLink(link);
  if (direct) return direct;
  const finalUrl = await resolveRedirect(link);
  return parseMapsLink(finalUrl);
}

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).send({ auth: false, message: 'No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, decoded) => {
    if (err) return res.status(500).send({ auth: false, message: 'Failed to authenticate token.' });
    req.userId = decoded.id;
    req.role = decoded.role;
    next();
  });
};

// Routes
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: 86400 });
    res.json({ token, role: user.role });
  });
});

app.get('/offices', verifyToken, (req, res) => {
  db.all(`SELECT * FROM offices`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/offices', verifyToken, async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const { name, locationLink } = req.body;
  if (!name || !locationLink) {
    return res.status(400).json({ message: 'Office name and Google Maps link are required.' });
  }

  try {
    const coords = await getCoordinatesFromLink(locationLink);
    if (!coords) {
      return res.status(400).json({ message: 'Could not parse coordinates from the Google Maps link.' });
    }
    db.run(`INSERT INTO offices (name, lat, lng, link) VALUES (?, ?, ?, ?)`, [name, coords.lat, coords.lng, locationLink], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, lat: coords.lat, lng: coords.lng, link: locationLink });
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete('/offices/:id', verifyToken, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  db.run(`DELETE FROM offices WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Office deleted' });
  });
});

app.post('/checkin', verifyToken, (req, res) => {
  const { lat, lng, office_id } = req.body;
  if (!office_id) {
    return res.status(400).json({ message: 'Please select an office.' });
  }

  db.get(`SELECT * FROM offices WHERE id = ?`, [office_id], (err, office) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!office) return res.status(400).json({ message: 'Selected office not found.' });

    const dist = getDistance(lat, lng, office.lat, office.lng);
    if (dist > 200) {
      return res.status(400).json({ message: 'You are not within the allowed radius of the selected office.' });
    }

    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT * FROM attendance WHERE user_id = ? AND DATE(check_in) = ?`, [req.userId, today], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && !row.check_out) {
        return res.status(400).json({ message: 'Already checked in today.' });
      }
      db.run(`INSERT INTO attendance (user_id, check_in, lat, lng, office_id) VALUES (?, datetime('now'), ?, ?, ?)`, [req.userId, lat, lng, office.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Checked in successfully.' });
      });
    });
  });
});

app.post('/checkout', verifyToken, (req, res) => {
  const { lat, lng } = req.body;
  const today = new Date().toISOString().split('T')[0];
  db.get(`SELECT * FROM attendance WHERE user_id = ? AND DATE(check_in) = ? AND check_out IS NULL`, [req.userId, today], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(400).json({ message: 'No check-in found for today.' });
    db.run(`UPDATE attendance SET check_out = datetime('now') WHERE id = ?`, [row.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Checked out successfully.' });
    });
  });
});

app.get('/attendance', verifyToken, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  db.all(`SELECT a.*, u.username, o.name as office_name FROM attendance a JOIN users u ON a.user_id = u.id JOIN offices o ON a.office_id = o.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/attendance/me', verifyToken, (req, res) => {
  db.all(`SELECT a.id, a.check_in, a.check_out, o.name as office_name FROM attendance a JOIN offices o ON a.office_id = o.id WHERE a.user_id = ? ORDER BY a.check_in DESC`, [req.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/export', verifyToken, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  db.all(`SELECT a.*, u.username, o.name as office_name FROM attendance a JOIN users u ON a.user_id = u.id JOIN offices o ON a.office_id = o.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  });
});

app.get('/users', verifyToken, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  db.all(`SELECT id, username, role, office_id FROM users`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/users', verifyToken, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const { username, password, role, office_id } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 8);
  db.run(`INSERT INTO users (username, password, role, office_id) VALUES (?, ?, ?, ?)`, [username, hashedPassword, role, office_id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.delete('/users/:id', verifyToken, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'User deleted' });
  });
});

app.put('/users/:id/password', verifyToken, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'Password is required' });
  const hashedPassword = bcrypt.hashSync(password, 8);
  db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashedPassword, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Password updated' });
  });
});

// Haversine formula for distance
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});