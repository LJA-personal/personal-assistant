async function guardAdmin() {
  const resp = await fetch('/api/auth/me');
  if (!resp.ok) return (window.location.href = '/');
  const me = await resp.json();
  if (!me.isAdmin) return (window.location.href = '/dashboard');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadBroadcasts() {
  const resp = await fetch('/api/admin/broadcasts');
  const items = await resp.json();
  const container = document.getElementById('broadcastList');
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--slate); font-size:14px;">No updates posted yet.</p>';
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'broadcast-row';

    const left = document.createElement('div');
    const meta = item.recurrence === 'daily' ? 'Repeats daily' : (item.active_date || 'Today');
    left.innerHTML = `<div>${escapeHtml(item.message)}</div><div class="broadcast-meta">${escapeHtml(meta)}</div>`;

    const del = document.createElement('button');
    del.className = 'todo-del';
    del.textContent = 'Remove';
    del.style.fontSize = '13px';
    del.addEventListener('click', async () => {
      await fetch(`/api/admin/broadcasts/${item.id}`, { method: 'DELETE' });
      loadBroadcasts();
    });

    row.append(left, del);
    container.appendChild(row);
  });
}

function wireBroadcastForm() {
  document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = {
      message: form.message.value.trim(),
      recurrence: form.recurrence.value,
      active_date: form.active_date.value || null,
    };
    if (!body.message) return;
    await fetch('/api/admin/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    form.reset();
    loadBroadcasts();
  });
}

async function loadWeatherSettings() {
  const resp = await fetch('/api/admin/settings');
  const data = await resp.json();
  const form = document.getElementById('weatherForm');
  form.weather_location_name.value = data.weather_location_name || '';
  form.weather_lat.value = data.weather_lat || '';
  form.weather_lon.value = data.weather_lon || '';
}

function wireWeatherForm() {
  document.getElementById('weatherForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weather_location_name: form.weather_location_name.value.trim(),
        weather_lat: form.weather_lat.value.trim(),
        weather_lon: form.weather_lon.value.trim(),
      }),
    });
    alert('Weather location updated.');
  });
}

async function loadUsers() {
  const resp = await fetch('/api/admin/users');
  const users = await resp.json();
  const container = document.getElementById('userList');
  container.innerHTML = users
    .map((u) => `<div style="padding:6px 0; border-bottom:1px solid rgba(245,242,234,0.06);">${escapeHtml(u.username)}${u.is_admin ? ' <span style="color:var(--brass); font-size:12px;">(admin)</span>' : ''}</div>`)
    .join('');
}

(async function initAdmin() {
  await guardAdmin();
  loadBroadcasts();
  wireBroadcastForm();
  loadWeatherSettings();
  wireWeatherForm();
  loadUsers();
})();
