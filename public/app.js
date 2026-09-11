(() => {
  'use strict';

  // ---------- config ----------
  const MODES = {
    pomodoro: { label: 'Pomodoro', minutes: 25, sub: 'Time to focus' },
    short:    { label: 'Short Break', minutes: 5,  sub: 'Take a breather' },
    long:     { label: 'Long Break', minutes: 15, sub: 'Step away for a bit' },
  };
  // quick testing: ?fast makes each minute last one second
  if (new URLSearchParams(location.search).has('fast')) {
    Object.values(MODES).forEach((m) => { m.seconds = m.minutes; });
  }
  const RING_CIRCUMFERENCE = 2 * Math.PI * 132; // r = 132
  const TIMER_KEY = 'focusblocks.timer.v1';
  const PENDING_KEY = 'focusblocks.pending.v1';
  const ACCESS_KEY = 'focusblocks.access.v1';
  const LEGACY_STORE_KEY = 'focusblocks.sessions.v1';
  const MIGRATED_KEY = 'focusblocks.sessions.migrated.v1';
  const CHIME_HZ = [880, 660, 990];
  const API_ROOT = '/api';

  // ---------- state ----------
  let mode = 'pomodoro';
  let totalSeconds = modeSeconds('pomodoro');
  let remaining = totalSeconds;
  let running = false;
  let endAt = 0;
  let ticker = null;
  let reportSort = 'block';
  let pendingId = null; // session awaiting a task/block

  function modeSeconds(m) { return MODES[m].seconds ?? MODES[m].minutes * 60; }

  // ---------- storage ----------
  const readJSON = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch { return fallback; }
  };
  const writeJSON = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };
  const remove = (key) => { try { localStorage.removeItem(key); } catch {} };

  const cacheKeyFor = (key) => `focusblocks.sessions.${encodeURIComponent(key)}`;
  let sessions = [];
  const saveSessions = () => {
    if (accessKey) writeJSON(cacheKeyFor(accessKey), sessions);
  };

  function loadSessionsFor(key) {
    const cached = localStorage.getItem(cacheKeyFor(key));
    if (cached !== null) {
      sessions = readJSON(cacheKeyFor(key), []).map((s) => ({ updatedAt: s.ts, ...s }));
    } else if (!localStorage.getItem(MIGRATED_KEY)) {
      sessions = readJSON(LEGACY_STORE_KEY, []).map((s) => ({ updatedAt: s.ts, ...s }));
      saveSessions();
      remove(LEGACY_STORE_KEY);
      writeJSON(MIGRATED_KEY, true);
    } else {
      sessions = [];
    }
    renderToday();
    renderReport();
  }

  function saveTimer() {
    writeJSON(TIMER_KEY, { mode, running, endAt, remaining });
  }
  function clearTimer() { remove(TIMER_KEY); }

  // ---------- date helpers ----------
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => dayKey(new Date());
  const fmtClock = (secs) => {
    const s = Math.max(0, Math.round(secs));
    return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  };
  const fmtDuration = (mins) => {
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  };

  // ---------- elements ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clockEl = $('#clock');
  const ringSubEl = $('#ring-sub');
  const ringProgressEl = $('.ring-progress');
  const startPauseEl = $('#startPause');
  const resetEl = $('#reset');
  const backdrop = $('#assignBackdrop');
  const assignNo = $('#assignNo');
  const assignTask = $('#assignTask');
  const assignBlock = $('#assignBlock');
  const blockList = $('#blockList');
  const lockAppEl = $('#lockApp');
  const authBackdrop = $('#authBackdrop');
  const accessKeyEl = $('#accessKey');
  const authMsgEl = $('#authMsg');
  let accessKey = readJSON(ACCESS_KEY, '');

  function showLogin(message = '') {
    authMsgEl.textContent = message;
    authMsgEl.hidden = !message;
    authBackdrop.hidden = false;
    setTimeout(() => accessKeyEl.focus(), 30);
  }

  function hideLogin() {
    authBackdrop.hidden = true;
    authMsgEl.hidden = true;
    accessKeyEl.value = '';
  }

  function lockApp() {
    accessKey = '';
    remove(ACCESS_KEY);
    sessions = [];
    renderToday();
    renderReport();
    showLogin();
  }

  // ---------- timer ----------
  function setMode(next) {
    mode = next;
    totalSeconds = modeSeconds(mode);
    remaining = totalSeconds;
    running = false;
    clearInterval(ticker);
    clearTimer();
    startPauseEl.textContent = 'Start';
    $$('.seg').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
    render();
  }

  function beginTicker() {
    startPauseEl.textContent = 'Pause';
    clearInterval(ticker);
    ticker = setInterval(tick, 250);
    tick();
  }

  function start() {
    if (running) return;
    running = true;
    endAt = Date.now() + remaining * 1000;
    beginTicker();
    saveTimer();
  }

  function pause() {
    if (!running) return;
    running = false;
    remaining = Math.max(0, (endAt - Date.now()) / 1000);
    clearInterval(ticker);
    startPauseEl.textContent = 'Resume';
    saveTimer();
    render();
  }

  function resetTimer() {
    running = false;
    clearInterval(ticker);
    remaining = totalSeconds;
    startPauseEl.textContent = 'Start';
    clearTimer();
    render();
  }

  function tick() {
    remaining = Math.max(0, (endAt - Date.now()) / 1000);
    render();
    if (remaining <= 0) complete({ silent: false });
  }

  function complete({ silent }) {
    running = false;
    clearInterval(ticker);
    clearTimer();
    remaining = 0;
    render();
    if (!silent) chime();
    startPauseEl.textContent = 'Start';

    if (mode === 'pomodoro') {
      const id = logCompletedPomodoro();
      openAssign(id);
    } else {
      remaining = totalSeconds;
      render();
    }
  }

  function render() {
    clockEl.textContent = fmtClock(remaining);
    const progress = totalSeconds ? remaining / totalSeconds : 0;
    ringProgressEl.style.strokeDasharray = RING_CIRCUMFERENCE.toFixed(2);
    ringProgressEl.style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - progress)).toFixed(2);

    if (mode === 'pomodoro') {
      const n = countToday() + (pendingId ? 0 : 1);
      ringSubEl.innerHTML = `Session #${n} &middot; ${MODES[mode].sub}`;
    } else {
      ringSubEl.textContent = MODES[mode].sub;
    }
    document.title = running ? `${fmtClock(remaining)} · Focusblocks` : 'Focusblocks';
  }

  // ---------- chime ----------
  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      CHIME_HZ.forEach((hz, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = hz;
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.34);
      });
    } catch {}
  }

  // ---------- sessions ----------
  const countToday = () => sessions.filter((s) => s.date === todayKey()).length;
  const findSession = (id) => sessions.find((s) => String(s.id) === String(id));

  // Log the finished focus session straight away, so it is never lost even if
  // the tab closes before the task/block is filled in.
  function logCompletedPomodoro() {
    const now = Date.now();
    const rec = { id: String(now), date: todayKey(), ts: now, task: '', block: 'Unassigned', minutes: MODES.pomodoro.minutes, updatedAt: now };
    sessions.push(rec);
    saveSessions();
    writeJSON(PENDING_KEY, rec.id);
    renderToday();
    renderReport();
    pushSync();
    return rec.id;
  }

  // ---------- assign dialog ----------
  function openAssign(id) {
    const rec = findSession(id);
    if (!rec) return;
    pendingId = id;
    const idx = sessions.filter((s) => s.date === rec.date && s.ts <= rec.ts).length;
    assignNo.textContent = String(idx);
    assignTask.value = rec.task || '';
    assignBlock.value = rec.block === 'Unassigned' ? '' : rec.block;
    refreshBlockList();
    backdrop.hidden = false;
    setTimeout(() => assignTask.focus(), 30);
  }

  function finishAssign(save) {
    const rec = findSession(pendingId);
    if (rec && save) {
      rec.task = assignTask.value.trim();
      rec.block = assignBlock.value.trim() || 'Unassigned';
      rec.updatedAt = Date.now();
      saveSessions();
      pushSync();
    }
    pendingId = null;
    remove(PENDING_KEY);
    backdrop.hidden = true;
    remaining = totalSeconds;
    render();
    renderToday();
    renderReport();
  }

  function refreshBlockList() {
    const blocks = [...new Set(sessions.map((s) => s.block).filter((b) => b && b !== 'Unassigned'))].sort();
    blockList.innerHTML = blocks.map((b) => `<option value="${escapeHtml(b)}"></option>`).join('');
  }

  // ---------- today panel ----------
  function renderToday() {
    const rows = sessions.filter((s) => s.date === todayKey()).sort((a, b) => a.ts - b.ts);
    const wrap = $('#todayRows');
    const empty = $('#todayEmpty');
    const summary = $('#todaySummary');

    wrap.innerHTML = rows.map((s, i) => `
      <div class="tr">
        <span class="idx">${i + 1}</span>
        <span>${escapeHtml(s.task) || '<span class="muted">(no task)</span>'}</span>
        <span>${chip(s.block)}</span>
        <span class="when">${fmtTime(s.ts)}</span>
      </div>`).join('');

    empty.hidden = rows.length > 0;
    const mins = rows.reduce((sum, s) => sum + s.minutes, 0);
    summary.textContent = rows.length
      ? `${rows.length} session${rows.length > 1 ? 's' : ''} · ${fmtDuration(mins)} focused`
      : 'No sessions yet';
  }

  // ---------- report ----------
  function renderReport() {
    const now = new Date();
    const tKey = todayKey();

    const todayCount = sessions.filter((s) => s.date === tKey).length;
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
    const weekSessions = sessions.filter((s) => s.ts >= weekStart.getTime());
    $('#kpiToday').innerHTML = `${todayCount} <em>session${todayCount === 1 ? '' : 's'}</em>`;
    $('#kpiWeek').innerHTML = `${weekSessions.length} <em>session${weekSessions.length === 1 ? '' : 's'}</em>`;
    const activeDays = new Set(sessions.map((s) => s.date)).size || 1;
    $('#kpiAvg').textContent = (sessions.length / activeDays).toFixed(1);

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = dayKey(d);
      days.push({
        count: sessions.filter((s) => s.date === key).length,
        label: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
        isToday: i === 0,
      });
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    $('#chart').innerHTML = days.map((d) => `
      <div class="bar-cell${d.isToday ? ' is-today' : ''}">
        <span class="bar-val">${d.count}</span>
        <div class="bar" style="height:${Math.round((d.count / max) * 150) + 4}px"></div>
      </div>`).join('');
    $('#chartLabels').innerHTML = days.map((d) =>
      `<span class="${d.isToday ? 'is-today' : ''}">${d.label}</span>`).join('');

    const empty = $('#reportEmpty');
    const wrap = $('#reportRows');
    empty.hidden = sessions.length > 0;
    $$('[data-col="block"]').forEach((el) => el.classList.toggle('is-sorted', reportSort === 'block'));
    $$('.sort-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.sort === reportSort));

    if (!sessions.length) { wrap.innerHTML = ''; return; }

    const row = (s) => `
      <div class="tr tr-report">
        <span class="when">${fmtDate(s.ts)}</span>
        <span>${escapeHtml(s.task) || '<span class="muted">(no task)</span>'}</span>
        <span>${chip(s.block)}</span>
        <span class="when">${s.minutes}m</span>
      </div>`;

    if (reportSort === 'date') {
      wrap.innerHTML = [...sessions].sort((a, b) => b.ts - a.ts).map(row).join('');
    } else {
      const groups = {};
      sessions.forEach((s) => { (groups[s.block] ||= []).push(s); });
      wrap.innerHTML = Object.keys(groups).sort().map((block) => {
        const items = groups[block].sort((a, b) => b.ts - a.ts);
        return `<div class="group-label">${escapeHtml(block)} · ${items.length}</div>` + items.map(row).join('');
      }).join('');
    }
  }

  // ---------- small render helpers ----------
  function chip(block) {
    return `<span class="chip" style="${chipStyle(block)}">${escapeHtml(block)}</span>`;
  }
  function chipStyle(block) {
    if (block === 'Unassigned') return 'background:#f0ece7;color:#8a8178';
    let h = 0;
    for (let i = 0; i < block.length; i++) h = (h * 31 + block.charCodeAt(i)) % 360;
    return `background:oklch(0.94 0.035 ${h});color:oklch(0.45 0.09 ${h})`;
  }
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---------- shared single-user history ----------
  let syncTimer = null;
  let syncInFlight = false;
  let syncQueued = false;

  function mergeSessions(remote) {
    const byId = new Map(remote.map((session) => [session.id, session]));
    sessions.forEach((session) => {
      const existing = byId.get(session.id);
      if (!existing || Number(session.updatedAt || session.ts) >= Number(existing.updatedAt || existing.ts)) {
        byId.set(session.id, session);
      }
    });
    return [...byId.values()].sort((a, b) => a.ts - b.ts);
  }

  async function syncNow() {
    if (!accessKey) {
      showLogin();
      return false;
    }
    if (syncInFlight) { syncQueued = true; return; }
    syncInFlight = true;
    try {
      const headers = { Authorization: `Bearer ${accessKey}` };
      const read = await fetch(`${API_ROOT}/sessions`, { headers });
      if (read.status === 401) {
        accessKey = '';
        remove(ACCESS_KEY);
        showLogin('That access key is not valid.');
        return false;
      }
      if (read.status === 503) {
        showLogin('ACCESS_KEYS is not configured on the server.');
        return false;
      }
      if (!read.ok) throw new Error(`http ${read.status}`);
      const remote = (await read.json()).sessions || [];
      const merged = mergeSessions(remote);
      const write = await fetch(`${API_ROOT}/sessions`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: merged }),
      });
      if (!write.ok) throw new Error(`http ${write.status}`);
      sessions = ((await write.json()).sessions || merged).sort((a, b) => a.ts - b.ts);
      saveSessions();
      render();
      renderToday();
      renderReport();
      hideLogin();
      return true;
    } catch {
      // localStorage remains usable when the server is temporarily offline.
      return false;
    } finally {
      syncInFlight = false;
      if (syncQueued) {
        syncQueued = false;
        syncNow();
      }
    }
  }

  function pushSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 500);
  }

  // ---------- view switching ----------
  function showView(name) {
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
    $$('.nav-link').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
    if (name === 'report') renderReport();
  }

  // ---------- wire up ----------
  $$('.seg').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('.nav-link').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  $$('.sort-btn').forEach((b) => b.addEventListener('click', () => { reportSort = b.dataset.sort; renderReport(); }));

  startPauseEl.addEventListener('click', () => (running ? pause() : start()));
  resetEl.addEventListener('click', resetTimer);
  window.addEventListener('online', syncNow);
  lockAppEl.addEventListener('click', lockApp);
  $('#authLogin').addEventListener('click', async () => {
    const entered = accessKeyEl.value.trim();
    if (!entered) {
      showLogin('Enter an access key.');
      return;
    }
    accessKey = entered;
    loadSessionsFor(accessKey);
    writeJSON(ACCESS_KEY, accessKey);
    authMsgEl.textContent = 'Checking key…';
    authMsgEl.hidden = false;
    const valid = await syncNow();
    if (!valid) authMsgEl.textContent = 'Could not connect to the server.';
  });
  accessKeyEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('#authLogin').click();
  });

  $('#assignSave').addEventListener('click', () => finishAssign(true));
  $('#assignSkip').addEventListener('click', () => finishAssign(false));
  assignBlock.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishAssign(true); });

  document.addEventListener('keydown', (e) => {
    if (!backdrop.hidden) { if (e.key === 'Escape') finishAssign(true); return; }
    if (e.target.matches('input')) return;
    if (e.code === 'Space') { e.preventDefault(); running ? pause() : start(); }
  });

  // keep the ticker honest after the machine sleeps or the tab was backgrounded
  document.addEventListener('visibilitychange', () => { if (!document.hidden && running) tick(); });

  // ---------- init: restore a timer that was mid-run ----------
  function restore() {
    // a session finished but was never tagged (tab closed with the dialog open)
    const pend = readJSON(PENDING_KEY, null);
    if (pend != null && findSession(pend)) {
      setMode('pomodoro');
      openAssign(pend);
      return;
    }

    const saved = readJSON(TIMER_KEY, null);
    if (!saved || !MODES[saved.mode]) { setMode('pomodoro'); return; }

    mode = saved.mode;
    totalSeconds = modeSeconds(mode);
    $$('.seg').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));

    if (saved.running) {
      if (saved.endAt > Date.now()) {
        running = true;
        endAt = saved.endAt;
        beginTicker();            // resumes; tick() fires completion if already past
        return;
      }
      // it ran out while we were away
      endAt = saved.endAt;
      remaining = 0;
      complete({ silent: true });
      return;
    }

    // paused mid-session
    remaining = Math.min(totalSeconds, Math.max(0, saved.remaining ?? totalSeconds));
    startPauseEl.textContent = remaining < totalSeconds ? 'Resume' : 'Start';
    render();
  }

  if (accessKey) loadSessionsFor(accessKey);
  restore();
  renderToday();
  renderReport();
  if (accessKey) syncNow();
  else showLogin();

})();
