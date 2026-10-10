/* core.js: shared utilities, theme, navigation, motion */
(function () {
  'use strict';

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Log bus */
  const logBuffer = [];
  const LOG_CAP = 250;

  function log(message, kind) {
    const entry = { t: new Date(), msg: String(message), kind: kind || 'info' };
    logBuffer.push(entry);
    if (logBuffer.length > LOG_CAP) logBuffer.shift();
    renderLogEntry(entry);
  }

  function renderLogEntry(entry) {
    const box = document.getElementById('devLog');
    if (!box) return;
    entry.rendered = true;
    const row = document.createElement('div');
    row.className = 'logs__row';
    row.dataset.kind = entry.kind;
    const time = entry.t.toTimeString().slice(0, 8);
    row.innerHTML = '<span class="logs__time"></span><span class="logs__msg"></span>';
    row.firstChild.textContent = time;
    row.lastChild.textContent = entry.msg;
    box.appendChild(row);
    while (box.childElementCount > LOG_CAP) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  /* Toasts */
  function toast(message, icon) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML =
      (icon !== false
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
        : '') + '<span></span>';
    el.lastChild.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 320);
    }, 2400);
  }

  /* Theme */
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme, announce) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f3f1ec' : '#07080a');
    try {
      localStorage.setItem('theme', next);
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    if (announce) log('[THEME] switched to ' + next);
  }

  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark', true);
  }

  /* Public API */
  const Site = {
    $, $$, log, toast, getTheme, setTheme, toggleTheme, reduceMotion,
    logBuffer,
    openConsole: null,   // filled by terminal.js
    openPalette: null,   // filled by palette.js
    scrollTo: (hash) => {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  };
  window.Site = Site;

  /* Fetch instrumentation */
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    const method = (args[1] && args[1].method) || 'GET';
    const started = performance.now();
    try {
      const res = await nativeFetch(...args);
      const ms = (performance.now() - started).toFixed(0);
      log(`${method} ${url} → ${res.status} (${ms}ms)`, res.ok ? 'net' : 'err');
      if (url.indexOf('/stats') === 0) {
        const el = document.getElementById('footerLatency');
        if (el) el.textContent = ` (it answered in ${ms}ms)`;
      }
      return res;
    } catch (err) {
      log(`${method} ${url} → ${err.message}`, 'err');
      throw err;
    }
  };

  /* DOM-dependent setup */
  document.addEventListener('DOMContentLoaded', function () {
    /* Flush anything logged before the log panel existed */
    logBuffer.filter((e) => !e.rendered).forEach(renderLogEntry);

    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    /* Theme button */
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => toggleTheme());

    /* Lamp pull cord */
    initLamp();

    /* Nav border once the page has scrolled */
    const nav = document.getElementById('nav');
    const onScroll = () => { if (nav) nav.classList.toggle('is-stuck', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    /* Reveal. Anything already on screen or above it shows at once, and a
       fallback timer guarantees nothing can stay hidden if the observer
       never fires (print, background tabs, odd browsers). */
    const revealIO = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add('is-visible'); revealIO.unobserve(e.target); }
          });
        }, { rootMargin: '0px 0px -8% 0px' })
      : null;

    function observeReveals(root) {
      $$('[data-reveal]', root).forEach((el) => {
        if (!revealIO || reduceMotion || el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('is-visible');
        } else {
          revealIO.observe(el);
        }
      });
    }
    observeReveals(document);
    Site.observeReveals = observeReveals;
    setTimeout(() => $$('[data-reveal]').forEach((el) => el.classList.add('is-visible')), 2500);

    /* Active nav link */
    const navLinks = $$('.nav__link');
    const spyIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('main section[id]').forEach((s) => spyIO.observe(s));

    /* Mobile drawer */
    const drawer = document.getElementById('drawer');
    const burger = document.getElementById('burger');

    function setDrawer(open) {
      if (!drawer) return;
      drawer.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
      if (burger) burger.setAttribute('aria-expanded', String(open));
    }
    if (burger) burger.addEventListener('click', () => setDrawer(!drawer.classList.contains('is-open')));
    if (drawer) $$('.drawer__link', drawer).forEach((l) => l.addEventListener('click', () => setDrawer(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) setDrawer(false);
    });

    /* Email reveal */
    // Assembled at runtime so naive scrapers don't get a plain mailto in source.
    const user = ['wynand', '0128'].join('.');
    const host = ['gmail', 'com'].join('.');
    const address = user + String.fromCharCode(64) + host;
    const mailCard = document.getElementById('mailCard');
    const mailText = document.getElementById('mailText');
    if (mailText) mailText.textContent = address;
    if (mailCard) mailCard.href = 'mailto:' + address;
    Site.email = address;

    const copyMail = document.getElementById('copyMail');
    if (copyMail) {
      copyMail.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyText(address, 'Email address copied');
      });
    }

    Site.copyEmail = () => copyText(address, 'Email address copied');

    function copyText(text, message) {
      const done = () => { toast(message); log('[CLIPBOARD] ' + message, 'ok'); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else fallback();

      function fallback() {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { toast('Copy failed. ' + text, false); }
        ta.remove();
      }
    }
    Site.copyText = copyText;

    /* Konami easter egg */
    const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let pos = 0;
    document.addEventListener('keydown', (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = key === seq[pos] ? pos + 1 : (key === seq[0] ? 1 : 0);
      if (pos === seq.length) { pos = 0; goldRain(); }
    });

    function goldRain() {
      if (reduceMotion) { toast('You found it. 🥇'); return; }
      const layer = document.createElement('div');
      layer.className = 'gold-rain';
      document.body.appendChild(layer);
      for (let i = 0; i < 90; i++) {
        const coin = document.createElement('i');
        coin.style.left = Math.random() * 100 + '%';
        coin.style.animationDuration = 2.2 + Math.random() * 2.2 + 's';
        coin.style.animationDelay = Math.random() * 1.4 + 's';
        coin.style.opacity = String(0.55 + Math.random() * 0.45);
        layer.appendChild(coin);
      }
      toast('Konami accepted. Enjoy the gold. 🥇');
      log('[EASTER-EGG] konami code entered', 'ok');
      setTimeout(() => layer.remove(), 6200);
    }
    Site.goldRain = goldRain;

    log('[INIT] portfolio ready', 'ok');
  });

  /* Lamp: drag the beaded chain to switch the lights */
  function initLamp() {
    const svg = document.getElementById('lampSvg');
    const chain = document.getElementById('lampChain');
    const knob = document.getElementById('lampKnob');
    const label = document.getElementById('lampLabel');
    if (!svg || !chain || !knob) return;

    const REST = 180;      // chain end at rest
    const MAX = 330;       // furthest it can be pulled
    const TRIGGER = 232;   // pull past this and the switch clicks
    const KNOB_GAP = 7;    // knob sits just below the chain end

    let y = REST;
    let pulling = false;
    let armed = false;
    let springing = false;

    function draw() {
      chain.setAttribute('y2', y.toFixed(1));
      knob.setAttribute('cy', (y + KNOB_GAP).toFixed(1));
      if (label) label.setAttribute('y', (y + KNOB_GAP + 3.5).toFixed(1));
    }

    /* Map a pointer position into the SVG viewBox */
    function pointerY(e) {
      const box = svg.getBoundingClientRect();
      const local = (e.clientY - box.top) * (430 / box.height);
      return Math.max(REST, Math.min(MAX, local));
    }

    /* Ease the chain back up, then stop the loop */
    function spring() {
      if (pulling || y <= REST + 0.3) {
        if (!pulling) { y = REST; draw(); }
        springing = false;
        return;
      }
      y += (REST - y) * 0.14;
      draw();
      requestAnimationFrame(spring);
    }
    function release() {
      if (!springing) { springing = true; requestAnimationFrame(spring); }
    }

    svg.addEventListener('pointerdown', (e) => {
      if (!e.target.matches('rect[pointer-events="all"]')) return;
      e.preventDefault();
      pulling = true;
      armed = false;
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('is-pulling');
      y = pointerY(e);
      draw();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pulling) return;
      y = pointerY(e);
      if (y > TRIGGER) armed = true;
      draw();
    });
    const end = () => {
      if (!pulling) return;
      pulling = false;
      svg.classList.remove('is-pulling');
      if (armed) toggleTheme();
      armed = false;
      release();
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    svg.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      toggleTheme();
      /* Give the chain a visible tug on keyboard use */
      y = TRIGGER + 12;
      draw();
      release();
    });

    draw();
  }

})();
