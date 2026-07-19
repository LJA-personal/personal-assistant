const express = require('express');
const { db, getSetting, setSetting } = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();

// ---- Broadcasts ----

router.get('/broadcasts', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC').all());
});

router.post('/broadcasts', requireAdmin, (req, res) => {
  const { message, recurrence, active_date, expires_at } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message text is required.' });
  }
  const rec = recurrence === 'daily' ? 'daily' : 'once';

  const info = db
    .prepare(
      'INSERT INTO broadcasts (message, created_by, recurrence, active_date, expires_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(message.trim(), req.session.userId, rec, active_date || null, expires_at || null);

  res.json(db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/broadcasts/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM broadcasts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Broadcast not found.' });
  res.json({ ok: true });
});

// ---- Global settings (weather location) ----

router.get('/settings', requireAdmin, (req, res) => {
  res.json({
    weather_lat: getSetting('weather_lat', '29.4241'),
    weather_lon: getSetting('weather_lon', '-98.4936'),
    weather_location_name: getSetting('weather_location_name', 'San Antonio, TX'),
  });
});

router.put('/settings', requireAdmin, (req, res) => {
  const { weather_lat, weather_lon, weather_location_name } = req.body || {};
  if (weather_lat !== undefined) setSetting('weather_lat', weather_lat);
  if (weather_lon !== undefined) setSetting('weather_lon', weather_lon);
  if (weather_location_name !== undefined) setSetting('weather_location_name', weather_location_name);
  res.json({
    weather_lat: getSetting('weather_lat'),
    weather_lon: getSetting('weather_lon'),
    weather_location_name: getSetting('weather_location_name'),
  });
});

// ---- Users (basic visibility for admin) ----

router.get('/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY id ASC').all());
});

module.exports = router;
