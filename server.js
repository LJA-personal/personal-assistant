require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const express = require('express');
const session = require('express-session');
const SqliteSessionStore = require('better-sqlite3-session-store')(session);

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-before-deploying';

// IIS + iisnode sits behind us and terminates the client connection; trust its
// forwarded proto/host headers so secure cookies behave correctly.
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionDb = new Database(path.join(__dirname, 'data', 'sessions.db'));

app.use(
  session({
    store: new SqliteSessionStore({
      client: sessionDb,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 },
    }),
    name: 'dashboard.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
    },
  })
);

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/admin', adminRoutes);

// ---- Static assets (css, js, uploaded backgrounds) ----
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ---- Page routes ----
function pageGuard({ admin } = {}) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/');
    }
    if (admin && !req.session.isAdmin) {
      return res.redirect('/dashboard');
    }
    next();
  };
}

app.get('/', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', pageGuard(), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', pageGuard({ admin: true }), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---- Error handling ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Dashboard server listening on http://localhost:${PORT}`);
});
