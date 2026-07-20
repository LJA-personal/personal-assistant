const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { getWeather } = require('../services/weather');

const router = express.Router();

const uploadsRoot = path.join(__dirname, '..', 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsRoot, String(req.session.userId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `bg-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return cb(new Error('Only jpg, png, webp, or gif images are allowed.'));
    cb(null, true);
  },
});

function ensureSettings(userId) {
  let row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  }
  return row;
}

// ---- Settings ----

router.get('/settings', requireAuth, (req, res) => {
  res.json(ensureSettings(req.session.userId));
});

router.put('/settings', requireAuth, (req, res) => {
  ensureSettings(req.session.userId);
  const { background_type, background_value, accent_color, clock_format, show_seconds, display_name } =
    req.body || {};

  const current = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.session.userId);

  db.prepare(
    `UPDATE user_settings SET
      background_type = ?, background_value = ?, accent_color = ?,
      clock_format = ?, show_seconds = ?, display_name = ?
     WHERE user_id = ?`
  ).run(
    background_type ?? current.background_type,
    background_value ?? current.background_value,
    accent_color ?? current.accent_color,
    clock_format ?? current.clock_format,
    show_seconds !== undefined ? (show_seconds ? 1 : 0) : current.show_seconds,
    display_name ?? current.display_name,
    req.session.userId
  );

  res.json(db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.session.userId));
});

router.post('/settings/background-upload', requireAuth, (req, res) => {
  upload.single('background')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received.' });

    const relPath = `/uploads/${req.session.userId}/${req.file.filename}`;
    ensureSettings(req.session.userId);
    db.prepare(
      `UPDATE user_settings SET background_type = 'image', background_value = ? WHERE user_id = ?`
    ).run(relPath, req.session.userId);

    res.json({ background_type: 'image', background_value: relPath });
  });
});

// ---- Todos ----

router.get('/todos', requireAuth, (req, res) => {
  const todos = db
    .prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(req.session.userId);
  res.json(todos);
});

router.post('/todos', requireAuth, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Todo text is required.' });

  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todos WHERE user_id = ?')
    .get(req.session.userId).m;

  const info = db
    .prepare('INSERT INTO todos (user_id, text, position) VALUES (?, ?, ?)')
    .run(req.session.userId, text.trim(), maxPos + 1);

  res.json(db.prepare('SELECT * FROM todos WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/todos/:id', requireAuth, (req, res) => {
  const todo = db
    .prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!todo) return res.status(404).json({ error: 'Todo not found.' });

  const { text, completed, position } = req.body || {};
  db.prepare('UPDATE todos SET text = ?, completed = ?, position = ? WHERE id = ?').run(
    text !== undefined ? text : todo.text,
    completed !== undefined ? (completed ? 1 : 0) : todo.completed,
    position !== undefined ? position : todo.position,
    todo.id
  );

  res.json(db.prepare('SELECT * FROM todos WHERE id = ?').get(todo.id));
});

router.delete('/todos/:id', requireAuth, (req, res) => {
  const result = db
    .prepare('DELETE FROM todos WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Todo not found.' });
  res.json({ ok: true });
});

// ---- Notepad (one freeform note per user) ----

router.get('/notepad', requireAuth, (req, res) => {
  let row = db.prepare('SELECT * FROM notepad WHERE user_id = ?').get(req.session.userId);
  if (!row) {
    db.prepare('INSERT INTO notepad (user_id) VALUES (?)').run(req.session.userId);
    row = db.prepare('SELECT * FROM notepad WHERE user_id = ?').get(req.session.userId);
  }
  res.json(row);
});

router.put('/notepad', requireAuth, (req, res) => {
  const { content } = req.body || {};
  db.prepare(
    `INSERT INTO notepad (user_id, content, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(req.session.userId, content || '');
  res.json(db.prepare('SELECT * FROM notepad WHERE user_id = ?').get(req.session.userId));
});

// ---- Assistant feed (broadcasts + weather + date) shared across all users ----

router.get('/assistant', requireAuth, async (req, res) => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const all = db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC').all();
  const active = all.filter((b) => {
    if (b.expires_at && new Date(b.expires_at).getTime() < today.getTime()) return false;
    if (b.recurrence === 'daily') return true;
    if (b.recurrence === 'once') return !b.active_date || b.active_date === todayStr;
    return true;
  });

  const weather = await getWeather();

  res.json({
    date: today.toISOString(),
    broadcasts: active.map((b) => ({
      id: b.id,
      message: b.message,
      recurrence: b.recurrence,
    })),
    weather,
  });
});

module.exports = router;
