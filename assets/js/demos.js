/* demos.js: containerised project demos streamed into the browser */
(function () {
  'use strict';

  /* DEMO PROJECTS: add new entries here */
  const DEMO_PROJECTS = [
    {
      github: 'WynandJvR/ExpenseTracker',
      projectId: 'expensetracker',
      icon: 'chart',
      // Used until (or instead of) the GitHub API responding
      fallback: {
        name: 'Expense Tracker',
        description: 'A JavaFX desktop application for tracking personal expenses with receipt scanning (OCR), category management and visual spending analytics.',
        language: 'Java',
        topics: ['JavaFX', 'OCR', 'Desktop App']
      }
    }
    // { github: 'WynandJvR/RepoName', projectId: 'reponame', icon: 'code', fallback: {...} },
  ];

  const DEMO_API = '/demo';

  const ICONS = {
    chart: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 19V10m6 9V5m6 14v-7"/>',
    code: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 18l-5-6 5-6M15 6l5 6-5 6"/>',
    game: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M14.7 11.2l-3.2-2.1a1 1 0 00-1.5.8v4.2a1 1 0 001.5.9l3.2-2.1a1 1 0 000-1.7z"/>',
    web: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>'
  };

  const LANG_COLORS = {
    Java: '#b07219', JavaScript: '#f1e05a', Python: '#3572A5', Go: '#00ADD8',
    'C#': '#178600', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#563d7c',
    Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', Ruby: '#701516'
  };

  let activeSessionId = null;
  let timerInterval = null;
  let bootInterval = null;
  let remaining = 0;

  let modal, viewer, loading, timerEl, titleEl;

  /* GitHub */
  async function fetchGitHubData(ownerRepo) {
    const key = 'gh_' + ownerRepo;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    } catch (e) {}

    try {
      const res = await fetch('https://api.github.com/repos/' + ownerRepo);
      if (!res.ok) return null;
      const d = await res.json();
      const result = {
        name: d.name,
        description: d.description,
        language: d.language,
        stars: d.stargazers_count,
        forks: d.forks_count,
        topics: d.topics || [],
        url: d.html_url,
        updated: d.updated_at
      };
      try { sessionStorage.setItem(key, JSON.stringify(result)); } catch (e) {}
      return result;
    } catch (e) {
      return null;
    }
  }

  /* Cards */
  const prettify = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').trim();

  function renderCard(project, gh) {
    const fb = project.fallback || {};
    const data = gh || fb;
    const name = prettify(data.name || project.projectId);
    const desc = data.description || 'Project details unavailable right now.';
    const lang = data.language || null;
    const topics = (data.topics || []).slice(0, 4);
    const url = (gh && gh.url) || 'https://github.com/' + project.github;
    const stars = gh ? gh.stars : 0;
    const forks = gh ? gh.forks : 0;
    const dot = LANG_COLORS[lang] || '#888';

    const star = stars > 0
      ? `<span class="gh-stat"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 01.67.42l1.89 3.81 4.21.61a.75.75 0 01.41 1.28l-3.04 2.97.72 4.19a.75.75 0 01-1.09.79L8 12.35l-3.77 1.98a.75.75 0 01-1.09-.79l.72-4.19L.82 6.37a.75.75 0 01.42-1.28l4.21-.61L7.33.67A.75.75 0 018 .25z"/></svg>${stars}</span>`
      : '';
    const fork = forks > 0
      ? `<span class="gh-stat"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.12a2.25 2.25 0 10-1.5 0v.88A2.25 2.25 0 005.75 8.5h1.5v2.13a2.25 2.25 0 101.5 0V8.5h1.5A2.25 2.25 0 0012.5 6.25v-.88a2.25 2.25 0 10-1.5 0v.88a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-.88z"/></svg>${forks}</span>`
      : '';

    return `
      <article class="card card--spot demo-card" data-project-id="${project.projectId}">
        <div class="demo-card__top">
          <span class="icon-tile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${ICONS[project.icon] || ICONS.code}</svg></span>
          <span style="flex:1">
            <h3 class="demo-card__title">${name}</h3>
            <span class="gh-stats">
              ${lang ? `<span class="gh-stat"><i class="lang-dot" style="background:${dot}"></i>${lang}</span>` : ''}
              ${star}${fork}
            </span>
          </span>
        </div>
        <p class="demo-card__desc">${desc}</p>
        ${topics.length ? `<div class="demo-card__tags">${topics.map((t) => `<span class="chip chip--gold">${t}</span>`).join('')}</div>` : ''}
        <div class="demo-card__actions">
          <button class="btn btn--primary btn--sm demo-btn" data-start="${project.projectId}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.7 11.2l-3.2-2.1a1 1 0 00-1.5.8v4.2a1 1 0 001.5.9l3.2-2.1a1 1 0 000-1.7z"/><circle cx="12" cy="12" r="9"/></svg>
            Launch demo
          </button>
          <a class="btn btn--ghost btn--sm" href="${url}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.79-.26.79-.58v-2.23c-3.34.73-4.03-1.42-4.03-1.42-.55-1.38-1.34-1.75-1.34-1.75-1.08-.75.09-.73.09-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.78.42-1.31.76-1.6-2.67-.31-5.47-1.34-5.47-5.94 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.19.7.8.58A12 12 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            Source
          </a>
        </div>
      </article>`;
  }

  async function initCards() {
    const container = document.getElementById('demo-cards');
    if (!container || !DEMO_PROJECTS.length) return;

    container.innerHTML = DEMO_PROJECTS.map((p) => renderCard(p, null)).join('');
    const results = await Promise.all(DEMO_PROJECTS.map((p) => fetchGitHubData(p.github)));
    container.innerHTML = DEMO_PROJECTS.map((p, i) => renderCard(p, results[i])).join('');

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-start]');
      if (btn) start(btn.dataset.start);
    });
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
    document.getElementById('demo-loading-title').textContent = 'Starting demo container…';
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
    document.querySelectorAll('.demo-btn').forEach((b) => { b.disabled = false; });
  }

  async function start(projectId) {
    const project = DEMO_PROJECTS.find((p) => p.projectId === projectId);
    if (!project) { window.Site.toast('Unknown demo: ' + projectId, false); return; }

    document.querySelectorAll('.demo-btn').forEach((b) => { b.disabled = true; });
    const label = prettify((project.fallback && project.fallback.name) || project.github.split('/')[1]);
    showModal(label);
    window.Site.log('[DEMO] requesting ' + projectId);

    try {
      const res = await fetch(DEMO_API + '/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'busy') {
          fail(
            'Demo currently in use',
            `Another visitor is using this demo. It should free up in about ${Math.ceil((data.remainingSeconds || 60) / 60)} minute(s). Please try again shortly.`
          );
          return;
        }
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
