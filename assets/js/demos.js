/* demos.js: containerised project demos streamed into the browser */
(function () {
  'use strict';

  /* DEMO PROJECTS: add new entries here */
  const DEMO_PROJECTS = [
    {
      projectId: 'expensetracker',
      name: 'Expense Tracker',
      language: 'Java · JavaFX',
      description: 'A desktop app for tracking personal spending: receipt scanning with OCR, budgets per category, and charts of where the money went. It opens with sample data loaded.',
      github: 'https://github.com/WynandJvR/ExpenseTracker'
    }
  ];

  const DEMO_API = '/demo';

  let activeSessionId = null;
  let timerInterval = null;
  let bootInterval = null;
  let remaining = 0;

  let modal, viewer, loading, timerEl, titleEl;

  /* Card */
  function renderCard(p) {
    return `
      <div class="demo-card" data-project-id="${p.projectId}">
        <div class="demo-card__actions">
          <button class="btn btn--hot demo-btn" data-start="${p.projectId}">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>Run it live
          </button>
          <span class="demo-card__status" data-state="checking"><span class="dot"></span><span class="demo-card__status-text">Checking the demo host</span></span>
        </div>
        <p class="demo-card__note" aria-live="polite"></p>
        <a class="demo-card__src" href="${p.github}" target="_blank" rel="noopener">Source on GitHub ↗</a>
      </div>`;
  }

  /* Ask the demo manager whether the demo machine is reachable and free */
  async function refreshStatus() {
    const statusEls = document.querySelectorAll('.demo-card__status');
    if (!statusEls.length) return;
    let state = 'offline';
    let text = 'Offline';
    let note = 'The demo machine is offline right now. Back soon.';
    try {
      const res = await fetch(DEMO_API + '/status', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        if (d.active) {
          state = 'busy';
          text = 'In use';
          note = `Someone else is using it. It frees up in about ${Math.max(1, Math.ceil((d.remainingSeconds || 60) / 60))} min.`;
        } else if (d.hostOnline !== false) {
          state = 'online';
          text = 'Ready, takes about 10s';
          note = '';
        }
      }
    } catch (e) { /* treated as offline */ }

    statusEls.forEach((el) => {
      el.dataset.state = state;
      el.querySelector('.demo-card__status-text').textContent = text;
    });
    document.querySelectorAll('.demo-card__note').forEach((el) => { el.textContent = note; });
    if (!activeSessionId) {
      document.querySelectorAll('.demo-btn').forEach((b) => { b.disabled = state !== 'online'; });
    }
  }

  function initCards() {
    const container = document.getElementById('demo-cards');
    if (!container || !DEMO_PROJECTS.length) return;
    container.innerHTML = DEMO_PROJECTS.map(renderCard).join('');
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-start]');
      if (btn && !btn.disabled) start(btn.dataset.start);
    });
    refreshStatus();
    setInterval(() => { if (!document.hidden) refreshStatus(); }, 30000);
  }

  /* Modal */
  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function startTimer(seconds) {
    remaining = seconds;
    timerEl.textContent = formatTime(remaining);
    timerEl.classList.remove('is-warning');
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) { clearInterval(timerInterval); timerInterval = null; close(); return; }
      timerEl.textContent = formatTime(remaining);
      if (remaining <= 120) timerEl.classList.add('is-warning');
    }, 1000);
  }

  function runBootLog() {
    const steps = Array.from(document.querySelectorAll('#bootLog [data-step]'));
    steps.forEach((s) => s.classList.remove('is-done', 'is-active'));
    let i = 0;
    clearInterval(bootInterval);
    if (steps.length) steps[0].classList.add('is-active');
    bootInterval = setInterval(() => {
      if (i >= steps.length - 1) { clearInterval(bootInterval); return; }
      steps[i].classList.remove('is-active');
      steps[i].classList.add('is-done');
      i++;
      steps[i].classList.add('is-active');
    }, 1300);
  }

  function showModal(title) {
    titleEl.textContent = title;
    loading.style.display = 'flex';
    document.getElementById('demo-spinner').style.display = '';
    document.getElementById('demo-loading-title').textContent = 'Starting the demo container';
    document.getElementById('demo-loading-msg').textContent =
      'Booting an isolated environment on the server. This usually takes a few seconds.';
    const existing = viewer.querySelector('iframe');
    if (existing) existing.remove();
    modal.classList.add('is-open');
    document.body.classList.add('is-locked');
    runBootLog();
  }

  function showViewer(vncPath) {
    clearInterval(bootInterval);
    document.querySelectorAll('#bootLog [data-step]').forEach((s) => {
      s.classList.remove('is-active');
      s.classList.add('is-done');
    });
    setTimeout(() => {
      loading.style.display = 'none';
      const iframe = document.createElement('iframe');
      iframe.src = DEMO_API + vncPath.replace(/^\/demo/, '');
      iframe.allow = 'clipboard-read; clipboard-write';
      iframe.title = 'Live application demo';
      viewer.appendChild(iframe);
    }, 250);
  }

  function fail(title, message) {
    clearInterval(bootInterval);
    document.getElementById('demo-spinner').style.display = 'none';
    document.getElementById('demo-loading-title').textContent = title;
    document.getElementById('demo-loading-msg').textContent = message;
    setTimeout(close, 5000);
  }

  function close() {
    clearInterval(timerInterval); timerInterval = null;
    clearInterval(bootInterval); bootInterval = null;
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    const iframe = viewer.querySelector('iframe');
    if (iframe) iframe.remove();
    loading.style.display = 'flex';

    if (activeSessionId) {
      fetch(DEMO_API + '/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId })
      }).catch(() => {});
      window.Site.log('[DEMO] session ended', 'ok');
      activeSessionId = null;
    }
    refreshStatus();
  }

  async function start(projectId) {
    const project = DEMO_PROJECTS.find((p) => p.projectId === projectId);
    if (!project) { window.Site.toast('Unknown demo: ' + projectId, false); return; }

    document.querySelectorAll('.demo-btn').forEach((b) => { b.disabled = true; });
    showModal(project.name);
    window.Site.log('[DEMO] requesting ' + projectId);

    try {
      const res = await fetch(DEMO_API + '/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.error === 'busy') {
          fail(
            'Demo currently in use',
            `Another visitor is using this demo. It should free up in about ${Math.ceil((data.remainingSeconds || 60) / 60)} minute(s). Please try again shortly.`
          );
          return;
        }
        if (res.status === 502 || res.status === 504) throw new Error('The demo service is not responding right now. Please try again later.');
        throw new Error(data.message || 'Failed to start demo');
      }

      activeSessionId = data.sessionId;
      startTimer(data.timeoutSeconds);
      showViewer(data.vncPath);
      window.Site.log('[DEMO] session ' + data.sessionId + ' started', 'ok');
    } catch (err) {
      fail('Could not start the demo', err.message || 'An unexpected error occurred. Please try again later.');
      window.Site.log('[DEMO] ' + err.message, 'err');
    }
  }

  /* Init */
  document.addEventListener('DOMContentLoaded', function () {
    modal = document.getElementById('demo-modal');
    viewer = document.getElementById('demo-viewer');
    loading = document.getElementById('demo-loading');
    timerEl = document.getElementById('demo-timer');
    titleEl = document.getElementById('demo-title');
    if (!modal) return;

    const endBtn = document.getElementById('demo-end-btn');
    if (endBtn) endBtn.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
    });

    initCards();

    window.demoManager = { start, close, list: () => DEMO_PROJECTS.map((p) => p.projectId) };
  });
})();
