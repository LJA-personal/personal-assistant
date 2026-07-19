const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3-32 characters: letters, numbers, dots, dashes, underscores.',
    });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const isFirstUser = userCount === 0;

  const hash = await bcrypt.hash(password, 12);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(username, hash, isFirstUser ? 1 : 0);

  db.prepare(
    'INSERT INTO user_settings (user_id, display_name) VALUES (?, ?)'
  ).run(info.lastInsertRowid, username);

  req.session.userId = info.lastInsertRowid;
  req.session.isAdmin = isFirstUser;

  res.json({
    id: info.lastInsertRowid,
    username,
    isAdmin: isFirstUser,
    note: isFirstUser ? 'You are the first account and have been made an admin.' : undefined,
  });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  req.session.userId = user.id;
  req.session.isAdmin = !!user.is_admin;

  res.json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  const user = db
    .prepare('SELECT id, username, is_admin FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  res.json({ id: user.id, username: user.username, isAdmin: !!user.is_admin });
});

module.exports = router;
