const BG_PRESETS = [
  { label: 'Dusk', value: 'linear-gradient(160deg, #1c2333 0%, #2b6f6a 100%)' },
  { label: 'Ember', value: 'linear-gradient(160deg, #241a1f 0%, #c98a3e 100%)' },
  { label: 'Slate', value: 'linear-gradient(160deg, #10131a 0%, #3a4a5c 100%)' },
  { label: 'Forest', value: 'linear-gradient(160deg, #131a15 0%, #2f5c3d 100%)' },
  { label: 'Plum', value: 'linear-gradient(160deg, #1c1526 0%, #5b3a6e 100%)' },
  { label: 'Ink', value: '#161a22' },
];

const ACCENT_PRESETS = ['#c98a3e', '#2b6f6a', '#8891a0', '#4c9a6a', '#c05746', '#5b8fc9'];

let currentUser = null;
let currentSettings = null;

// ---------------- Bootstrapping ----------------

async function init() {
  const meResp = await fetch('/api/auth/me');
  if (!meResp.ok) {
    window.location.href = '/';
    return;
  }
  currentUser = await meResp.json();

  if (currentUser.isAdmin) {
    document.getElementById('adminLink').style.display = 'inline-block';
  }

  updateGreeting();

  await loadSettings();
  applyBackground();

  startClock();
  loadTodos();
  loadAssistant();
  setInterval(loadAssistant, 5 * 60 * 1000); // refresh every 5 min

  buildSwatches();
  wireSettingsModal();
  wireTimer();
  wireTodoForm();
  wireLogout();

  loadNotepad();
  wireNotepad();

  wireCalendar();
  loadCalendar();
}

function updateGreeting() {
  const hour = new Date().getHours();
  let phrase = 'Good evening';
  if (hour < 12) phrase = 'Good morning';
  else if (hour < 18) phrase = 'Good afternoon';
  const name = (currentSettings && currentSettings.display_name) || currentUser.username;
  document.getElementById('greeting').textContent = `${phrase}, ${name}`;
}

function wireLogout() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

// ---------------- Clock ----------------

function startClock() {
  function tick() {
    const now = new Date();
    const format = currentSettings.clock_format || '24h';
    let h = now.getHours();
    let suffix = '';
    if (format === '12h') {
      suffix = h >= 12 ? ' PM' : ' AM';
      h = h % 12 || 12;
    }
    const hh = String(h).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clockTime').textContent = `${hh}:${mm}:${ss}${suffix}`;
    document.getElementById('clockDate').textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }
  tick();
  setInterval(tick, 1000);
}

// ---------------- Timer ----------------

function wireTimer() {
  let remaining = 0;
  let running = false;
  let intervalId = null;

  const display = document.getElementById('timerDisplay');
  const startPauseBtn = document.getElementById('timerStartPause');
  const resetBtn = document.getElementById('timerReset');

  function render() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function stop() {
    running = false;
    clearInterval(intervalId);
    startPauseBtn.textContent = 'Start';
  }

  function setRemaining(secs) {
    stop();
    remaining = Math.max(0, Math.min(secs, 999 * 60 + 59));
    render();
  }

  startPauseBtn.addEventListener('click', () => {
    if (running) {
      stop();
      return;
    }
    if (remaining <= 0) return;
    running = true;
    startPauseBtn.textContent = 'Pause';
    intervalId = setInterval(() => {
      remaining -= 1;
      render();
      if (remaining <= 0) {
        stop();
        display.textContent = "00:00";
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          osc.connect(ctx.destination);
          osc.frequency.value = 880;
          osc.start();
          setTimeout(() => osc.stop(), 400);
        } catch (e) { /* audio not available, ignore */ }
      }
    }, 1000);
  });

  resetBtn.addEventListener('click', () => {
    setRemaining(0);
  });

  document.querySelectorAll('.timer-presets button').forEach((btn) => {
    btn.addEventListener('click', () => setRemaining(parseInt(btn.dataset.secs, 10)));
  });

  document.getElementById('timerSetCustom').addEventListener('click', () => {
    const minInput = document.getElementById('timerMinInput');
    const secInput = document.getElementById('timerSecInput');
    const mins = parseInt(minInput.value, 10) || 0;
    const secs = parseInt(secInput.value, 10) || 0;
    setRemaining(mins * 60 + secs);
    minInput.value = '';
    secInput.value = '';
  });

  render();
}

// ---------------- Todos ----------------

async function loadTodos() {
  const resp = await fetch('/api/todos');
  const todos = await resp.json();
  renderTodos(todos);
}

function renderTodos(todos) {
  const list = document.getElementById('todoList');
  list.innerHTML = '';
  if (todos.length === 0) {
    const li = document.createElement('li');
    li.className = 'todo-empty';
    li.textContent = 'Nothing on your list yet.';
    list.appendChild(li);
    return;
  }
  todos.forEach((todo) => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.completed ? ' completed' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!todo.completed;
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: checkbox.checked }),
      });
      li.classList.toggle('completed', checkbox.checked);
    });

    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = todo.text;

    const del = document.createElement('button');
    del.className = 'todo-del';
    del.setAttribute('aria-label', 'Delete task');
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' });
      li.remove();
      if (list.children.length === 0) renderTodos([]);
    });

    li.append(checkbox, span, del);
    list.appendChild(li);
  });
}

function wireTodoForm() {
  document.getElementById('todoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    if (!text) return;
    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    input.value = '';
    loadTodos();
  });
}

// ---------------- Settings ----------------

async function loadSettings() {
  const resp = await fetch('/api/settings');
  currentSettings = await resp.json();
}

function applyBackground() {
  const body = document.getElementById('dashBody');
  if (currentSettings.background_type === 'image') {
    body.style.background = `url('${currentSettings.background_value}') center/cover fixed`;
  } else {
    body.style.background = currentSettings.background_value;
  }
}

function buildSwatches() {
  const bgRow = document.getElementById('bgSwatches');
  BG_PRESETS.forEach((preset) => {
    const el = document.createElement('div');
    el.className = 'swatch';
    el.style.background = preset.value;
    el.title = preset.label;
    el.dataset.value = preset.value;
    el.addEventListener('click', () => {
      bgRow.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
      el.classList.add('selected');
      pendingBackground = { type: 'gradient', value: preset.value };
    });
    bgRow.appendChild(el);
  });

  const accentRow = document.getElementById('accentSwatches');
  ACCENT_PRESETS.forEach((color) => {
    const el = document.createElement('div');
    el.className = 'swatch';
    el.style.background = color;
    el.dataset.value = color;
    el.addEventListener('click', () => {
      accentRow.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
      el.classList.add('selected');
      pendingAccent = color;
    });
    accentRow.appendChild(el);
  });
}

let pendingBackground = null;
let pendingAccent = null;

function wireSettingsModal() {
  const modal = document.getElementById('settingsModal');

  document.getElementById('settingsBtn').addEventListener('click', () => {
    pendingBackground = null;
    pendingAccent = null;
    document.getElementById('clockFormat').value = currentSettings.clock_format || '12h';
    modal.classList.add('show');
  });

  document.getElementById('closeSettings').addEventListener('click', () => {
    modal.classList.remove('show');
  });

  document.getElementById('bgUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('background', file);
    const resp = await fetch('/api/settings/background-upload', { method: 'POST', body: formData });
    const data = await resp.json();
    if (resp.ok) {
      currentSettings.background_type = data.background_type;
      currentSettings.background_value = data.background_value;
      applyBackground();
    } else {
      alert(data.error || 'Could not upload that image.');
    }
  });

  document.getElementById('saveSettings').addEventListener('click', async () => {
    const body = { clock_format: document.getElementById('clockFormat').value };
    if (pendingBackground) {
      body.background_type = pendingBackground.type;
      body.background_value = pendingBackground.value;
    }
    if (pendingAccent) body.accent_color = pendingAccent;

    const resp = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    currentSettings = await resp.json();
    applyBackground();
    modal.classList.remove('show');
  });
}

// ---------------- Notepad ----------------

let notepadSaveTimeout = null;

async function loadNotepad() {
  const resp = await fetch('/api/notepad');
  const data = await resp.json();
  document.getElementById('notepadArea').value = data.content || '';
}

function wireNotepad() {
  const area = document.getElementById('notepadArea');
  const status = document.getElementById('notepadStatus');

  area.addEventListener('input', () => {
    status.textContent = 'Saving…';
    clearTimeout(notepadSaveTimeout);
    notepadSaveTimeout = setTimeout(async () => {
      await fetch('/api/notepad', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: area.value }),
      });
      status.textContent = 'Saved';
      setTimeout(() => {
        if (status.textContent === 'Saved') status.textContent = '';
      }, 1500);
    }, 700);
  });
}

// ---------------- Calendar ----------------

let calMonthDate = new Date();
calMonthDate.setDate(1);
let calSelectedDate = toDateStr(new Date());
let calEventsCache = {};

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadCalendar() {
  const monthKey = `${calMonthDate.getFullYear()}-${String(calMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const resp = await fetch(`/api/events?month=${monthKey}`);
  const events = await resp.json();

  calEventsCache = {};
  events.forEach((ev) => {
    if (!calEventsCache[ev.event_date]) calEventsCache[ev.event_date] = [];
    calEventsCache[ev.event_date].push(ev);
  });

  renderCalendarGrid();
  renderSelectedDayEvents();
}

function renderCalendarGrid() {
  document.getElementById('calMonthLabel').textContent = calMonthDate.toLocaleDateString(undefined, {
    month: 'long', year: 'numeric',
  });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach((label) => {
    const el = document.createElement('div');
    el.className = 'cal-daylabel';
    el.textContent = label;
    grid.appendChild(el);
  });

  const year = calMonthDate.getFullYear();
  const month = calMonthDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toDateStr(new Date());

  for (let i = 0; i < firstDayOfWeek; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-cell empty';
    grid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell';
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === calSelectedDate) cell.classList.add('selected');

    const num = document.createElement('span');
    num.textContent = String(day);
    cell.appendChild(num);

    if (calEventsCache[dateStr] && calEventsCache[dateStr].length > 0) {
      const dot = document.createElement('span');
      dot.className = 'cal-dot';
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => {
      calSelectedDate = dateStr;
      renderCalendarGrid();
      renderSelectedDayEvents();
    });

    grid.appendChild(cell);
  }
}

function renderSelectedDayEvents() {
  const dateObj = new Date(`${calSelectedDate}T00:00:00`);
  document.getElementById('calSelectedLabel').textContent = dateObj.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const list = document.getElementById('calEventList');
  list.innerHTML = '';
  const items = calEventsCache[calSelectedDate] || [];

  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'todo-empty';
    li.textContent = 'Nothing set for this day.';
    list.appendChild(li);
    return;
  }

  items.forEach((ev) => {
    const li = document.createElement('li');
    li.className = 'todo-item';

    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = ev.text;

    const del = document.createElement('button');
    del.className = 'todo-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete event');
    del.addEventListener('click', async () => {
      await fetch(`/api/events/${ev.id}`, { method: 'DELETE' });
      loadCalendar();
    });

    li.append(span, del);
    list.appendChild(li);
  });
}

function wireCalendar() {
  document.getElementById('calPrev').addEventListener('click', () => {
    calMonthDate.setMonth(calMonthDate.getMonth() - 1);
    loadCalendar();
  });

  document.getElementById('calNext').addEventListener('click', () => {
    calMonthDate.setMonth(calMonthDate.getMonth() + 1);
    loadCalendar();
  });

  document.getElementById('calEventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('calEventInput');
    const text = input.value.trim();
    if (!text) return;
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_date: calSelectedDate, text }),
    });
    input.value = '';
    loadCalendar();
  });
}

// ---------------- Assistant ticker ----------------

let tickerItems = [];
let tickerIndex = 0;

async function loadAssistant() {
  try {
    const resp = await fetch('/api/assistant');
    const data = await resp.json();

    const items = [];
    const dateStr = new Date(data.date).toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    items.push(`Today is ${dateStr}.`);

    if (data.weather && data.weather.tempF !== null && data.weather.tempF !== undefined) {
      items.push(`${data.weather.location}: ${data.weather.tempF}°F, ${data.weather.condition}.`);
    }

    data.broadcasts.forEach((b) => items.push(b.message));

    tickerItems = items;
    tickerIndex = 0;
    renderTickerItem();
  } catch (err) {
    // keep whatever was showing before
  }
}

function renderTickerItem() {
  const track = document.getElementById('tickerTrack');
  if (tickerItems.length === 0) {
    track.innerHTML = '<span class="ticker-item">All quiet for now.</span>';
    return;
  }
  track.innerHTML = `<span class="ticker-item">${escapeHtml(tickerItems[tickerIndex])}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

setInterval(() => {
  if (tickerItems.length === 0) return;
  tickerIndex = (tickerIndex + 1) % tickerItems.length;
  renderTickerItem();
}, 6000);

init();
