/* palette.js: Ctrl+K command palette */
(function () {
  'use strict';

  let palette, input, list;
  let items = [];
  let filtered = [];
  let selected = 0;
  let lastFocus = null;

  const ICON = {
    jump: '<path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M4 12h16"/>',
    theme: '<circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/>',
    term: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 17l6-5-6-5M12 19h8"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path stroke-linecap="round" d="M5 15V5a2 2 0 012-2h8"/>',
    link: '<path stroke-linecap="round" stroke-linejoin="round" d="M7 17L17 7m0 0H8m9 0v9"/>',
    play: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M14.7 11.2l-3.2-2.1a1 1 0 00-1.5.8v4.2a1 1 0 001.5.9l3.2-2.1a1 1 0 000-1.7z"/>',
    doc: '<path stroke-linecap="round" stroke-linejoin="round" d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/>',
    game: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M9 12h6M12 9v6"/>'
  };

  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${p}</svg>`;

  /* Build the searchable action list */
  function buildItems() {
    const out = [];

    [
      ['Home', 'home'], ['Work', 'work'], ['Live demo', 'demo'], ['Contact', 'contact']
    ].forEach(([label, id]) => {
      out.push({ group: 'Navigate', label, icon: ICON.jump, hint: '#' + id, run: () => window.Site.scrollTo('#' + id) });
    });

    (window.Site.data ? window.Site.data.projects : []).forEach((p) => {
      out.push({
        group: 'Projects',
        label: p.title,
        icon: ICON.doc,
        hint: p.tags.join(' · '),
        run: () => window.Site.openProject(p.id)
      });
    });

    (window.demoManager ? window.demoManager.list() : []).forEach((id) => {
      out.push({ group: 'Demos', label: 'Launch demo: ' + id, icon: ICON.play, hint: 'container', run: () => window.demoManager.start(id) });
    });

    out.push(
      { group: 'Actions', label: 'Open the terminal', icon: ICON.term, hint: 'Ctrl `', run: () => window.Site.openConsole('shell') },
      { group: 'Actions', label: 'Open the live log', icon: ICON.term, hint: 'logs', run: () => window.Site.openConsole('logs') },
      { group: 'Actions', label: 'Copy email address', icon: ICON.copy, hint: 'clipboard', run: () => window.Site.copyEmail() },
      { group: 'Actions', label: 'Print / save as PDF', icon: ICON.doc, hint: 'Ctrl P', run: () => window.print() },
      { group: 'Links', label: 'GitHub profile', icon: ICON.link, hint: 'external', run: () => window.open('https://github.com/WynandJvR', '_blank', 'noopener') },
      { group: 'Links', label: 'LinkedIn profile', icon: ICON.link, hint: 'external', run: () => window.open('https://www.linkedin.com/in/wynand-janse-van-rensburg-953539352/', '_blank', 'noopener') },
      { group: 'Links', label: 'Play the secret game', icon: ICON.game, hint: '/secret.html', run: () => { window.location.href = '/secret.html'; } }
    );

    return out;
  }

  /* Subsequence match, so "lgm" finds "Launch demo" */
  function score(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (!q) return 1;
    const direct = t.indexOf(q);
    if (direct === 0) return 1000;
    if (direct > 0) return 500 - direct;

    let ti = 0, hits = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const found = t.indexOf(q[qi], ti);
      if (found === -1) return 0;
      hits += found === ti ? 2 : 1;
      ti = found + 1;
    }
    return hits;
  }

  function render() {
    const query = input.value.trim();
    filtered = items
      .map((it) => ({ it, s: score(query, it.label + ' ' + it.group + ' ' + (it.hint || '')) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.it);

    if (!query) filtered = items;
    selected = 0;

    if (!filtered.length) {
      list.innerHTML = '<div class="palette__empty">Nothing matches that.</div>';
      return;
    }

    let html = '';
    let group = null;
    filtered.forEach((it, i) => {
      if (it.group !== group && !query) { group = it.group; html += `<div class="palette__group">${group}</div>`; }
      html += `<button class="palette__item${i === 0 ? ' is-selected' : ''}" data-index="${i}">
        ${svg(it.icon)}<span>${it.label}</span>${it.hint ? `<span class="hint">${it.hint}</span>` : ''}
      </button>`;
    });
    list.innerHTML = html;
  }

  function move(delta) {
    const nodes = list.querySelectorAll('.palette__item');
    if (!nodes.length) return;
    selected = (selected + delta + nodes.length) % nodes.length;
    nodes.forEach((n, i) => n.classList.toggle('is-selected', i === selected));
    const active = nodes[selected];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function run(index) {
    const item = filtered[index];
    if (!item) return;
    close();
    setTimeout(() => {
      item.run();
      window.Site.log('[PALETTE] ' + item.label);
    }, 90);
  }

  function open() {
    if (!palette) return;
    lastFocus = document.activeElement;
    items = buildItems();
    input.value = '';
    render();
    palette.classList.add('is-open');
    document.body.classList.add('is-locked');
    setTimeout(() => input.focus(), 60);
  }

  function close() {
    if (!palette) return;
    palette.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('DOMContentLoaded', function () {
    palette = document.getElementById('palette');
    input = document.getElementById('paletteInput');
    list = document.getElementById('paletteList');
    if (!palette || !input || !list) return;

    window.Site.openPalette = open;
    window.Site.closePalette = close;

    input.addEventListener('input', render);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); run(selected); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.palette__item');
      if (btn) run(Number(btn.dataset.index));
    });

    list.addEventListener('mousemove', (e) => {
      const btn = e.target.closest('.palette__item');
      if (!btn) return;
      selected = Number(btn.dataset.index);
      list.querySelectorAll('.palette__item').forEach((n, i) => n.classList.toggle('is-selected', i === selected));
    });

    palette.addEventListener('click', (e) => { if (e.target === palette) close(); });

    const btn = document.getElementById('paletteBtn');
    if (btn) btn.addEventListener('click', open);
    document.querySelectorAll('[data-cmd="palette"]').forEach((b) => b.addEventListener('click', open));

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        palette.classList.contains('is-open') ? close() : open();
      }
      if (e.key === '/' && !palette.classList.contains('is-open')) {
        const tag = (document.activeElement.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        open();
      }
    });
  });
})();
