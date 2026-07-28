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
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function setTheme(theme, announce) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
      localStorage.setItem('darkMode', String(next === 'dark')); // legacy key
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
        if (el) el.textContent = `api ${ms}ms`;
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

    /* Scroll progress */
    const progress = document.getElementById('scrollProgress');
    const nav = document.getElementById('nav');
    const toTop = document.getElementById('toTop');
    let lastY = window.scrollY;
    let ticking = false;

    function onScroll() {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progress) progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      if (nav) {
        nav.classList.toggle('is-stuck', y > 24);
        // Hide on scroll-down, reveal on scroll-up, never over the hero
        nav.classList.toggle('is-hidden', y > 420 && y > lastY && !document.body.classList.contains('is-locked'));
      }
      if (toTop) toTop.classList.toggle('is-visible', y > 700);
      lastY = y;
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    }, { passive: true });
    onScroll();

    if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));

    /* Reveal */
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          revealIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    function observeReveals(root) {
      $$('[data-reveal]', root).forEach((el, i) => {
        if (!el.style.getPropertyValue('--reveal-delay')) {
          el.style.setProperty('--reveal-delay', Math.min(i * 55, 280) + 'ms');
        }
        revealIO.observe(el);
      });
      $$('.tl-item', root).forEach((el) => revealIO.observe(el));
    }
    observeReveals(document);
    Site.observeReveals = observeReveals;

    /* Section rail + nav */
    const sections = $$('main section[id]');
    const railItems = $$('.rail__item');
    const navLinks = $$('.nav__link');
    const indicator = document.getElementById('navIndicator');

    function moveIndicator(link) {
      if (!indicator || !link) return;
      indicator.style.opacity = '1';
      indicator.style.width = link.offsetWidth + 'px';
      indicator.style.transform = `translateX(${link.offsetLeft}px)`;
    }

    function setActive(id) {
      railItems.forEach((r) => r.classList.toggle('is-active', r.getAttribute('href') === '#' + id));
      let matched = null;
      navLinks.forEach((l) => {
        const on = l.getAttribute('href') === '#' + id;
        l.classList.toggle('is-active', on);
        if (on) matched = l;
      });
      if (matched) moveIndicator(matched);
      else if (indicator) indicator.style.opacity = '0';
    }

    const spyIO = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { threshold: [0.25, 0.5], rootMargin: '-15% 0px -45% 0px' });
    sections.forEach((s) => spyIO.observe(s));

    window.addEventListener('resize', () => {
      const active = document.querySelector('.nav__link.is-active');
      if (active) moveIndicator(active);
    });

    /* Mobile drawer */
    const drawer = document.getElementById('drawer');
    const burger = document.getElementById('burger');

    function setDrawer(open) {
      if (!drawer) return;
      drawer.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
      if (burger) burger.setAttribute('aria-expanded', String(open));
      $$('.drawer__link', drawer).forEach((l, i) => {
        l.style.transitionDelay = open ? i * 45 + 'ms' : '0ms';
      });
    }
    if (burger) burger.addEventListener('click', () => setDrawer(true));
    const drawerClose = document.getElementById('drawerClose');
    if (drawerClose) drawerClose.addEventListener('click', () => setDrawer(false));
    if (drawer) {
      $$('.drawer__link', drawer).forEach((l) => l.addEventListener('click', () => setDrawer(false)));
      drawer.addEventListener('click', (e) => { if (e.target === drawer) setDrawer(false); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) setDrawer(false);
    });

    /* Custom cursor */
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (fine && !reduceMotion) {
      const dot = document.getElementById('cursorDot');
      const ring = document.getElementById('cursorRing');
      let rx = window.innerWidth / 2, ry = window.innerHeight / 2;
      let tx = rx, ty = ry;

      window.addEventListener('mousemove', (e) => {
        tx = e.clientX; ty = e.clientY;
        document.body.classList.add('has-cursor');
        if (dot) dot.style.transform = `translate(${tx}px, ${ty}px)`;
      }, { passive: true });

      (function loop() {
        rx += (tx - rx) * 0.18;
        ry += (ty - ry) * 0.18;
        if (ring) ring.style.transform = `translate(${rx}px, ${ry}px)`;
        requestAnimationFrame(loop);
      })();

      const hoverSel = 'a, button, [data-magnetic], .project, .skill-group, .filter, .rail__item, input, .console__tab';
      document.addEventListener('mouseover', (e) => {
        if (e.target.closest && e.target.closest(hoverSel)) document.body.classList.add('cursor-hover');
      });
      document.addEventListener('mouseout', (e) => {
        if (e.target.closest && e.target.closest(hoverSel)) document.body.classList.remove('cursor-hover');
      });
      document.addEventListener('mouseleave', () => document.body.classList.remove('has-cursor'));
    }

    /* Magnetic buttons */
    if (fine && !reduceMotion) {
      $$('[data-magnetic]').forEach(bindMagnetic);
      Site.bindMagnetic = bindMagnetic;
    } else {
      Site.bindMagnetic = () => {};
    }

    function bindMagnetic(el) {
      const strength = 0.28;
      const cap = 12;
      const clamp = (v) => Math.max(-cap, Math.min(cap, v));
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${clamp(mx * strength)}px, ${clamp(my * strength)}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    }

    /* Card spotlight + tilt */
    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest && e.target.closest('.card--spot');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
    }, { passive: true });

    if (fine && !reduceMotion) {
      $$('[data-tilt]').forEach((el) => {
        const wrap = el.parentElement;
        wrap.addEventListener('mousemove', (e) => {
          const r = wrap.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(1000px) rotateY(${px * 9}deg) rotateX(${-py * 9}deg) translateZ(0)`;
        });
        wrap.addEventListener('mouseleave', () => { el.style.transform = ''; });
      });
    }

    /* Counters */
    const counters = $$('[data-count]');
    if (counters.length) {
      const countIO = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          countIO.unobserve(e.target);
          const target = Number(e.target.dataset.count) || 0;
          const out = e.target.querySelector('.val');
          const dur = 1400;
          const t0 = performance.now();
          (function step(now) {
            const p = Math.min((now - t0) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            out.textContent = String(Math.round(target * eased));
            if (p < 1) requestAnimationFrame(step);
          })(t0);
        });
      }, { threshold: 0.6 });
      counters.forEach((c) => countIO.observe(c));
    }

    /* Timeline fill */
    const timeline = document.getElementById('timeline');
    const timelineFill = document.getElementById('timelineFill');
    if (timeline && timelineFill) {
      const updateFill = () => {
        const r = timeline.getBoundingClientRect();
        const start = window.innerHeight * 0.85;
        const p = Math.max(0, Math.min(1, (start - r.top) / (r.height || 1)));
        timelineFill.style.height = p * (timeline.clientHeight - 12) + 'px';
      };
      window.addEventListener('scroll', updateFill, { passive: true });
      window.addEventListener('resize', updateFill);
      updateFill();
    }

    /* Lamp pull cord */
    initLamp();

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
    const svg = document.getElementById("lampSvg");
    const chain = document.getElementById("lampChain");
    const knob = document.getElementById("lampKnob");
    if (!svg || !chain || !knob) return;

    const REST = 180;      // chain end at rest
    const MAX = 330;       // furthest it can be pulled
    const TRIGGER = 232;   // pull past this and the switch clicks
    const KNOB_GAP = 7;    // knob sits just below the chain end

    let y = REST;
    let pulling = false;
    let armed = false;

    function draw() {
      chain.setAttribute("y2", y.toFixed(1));
      knob.setAttribute("cy", (y + KNOB_GAP).toFixed(1));
    }

    /* Map a pointer position into the SVG viewBox */
    function pointerY(e) {
      const src = (e.touches && e.touches[0]) || e;
      const box = svg.getBoundingClientRect();
      const scale = 430 / box.height;
      const local = (src.clientY - box.top) * scale;
      return Math.max(REST, Math.min(MAX, local));
    }

    function start(e) {
      e.preventDefault();
      pulling = true;
      armed = false;
      svg.classList.add("is-pulling");
      y = pointerY(e);
      draw();
    }

    function move(e) {
      if (!pulling) return;
      e.preventDefault();
      y = pointerY(e);
      if (y > TRIGGER) armed = true;
      draw();
    }

    function end() {
      if (!pulling) return;
      pulling = false;
      svg.classList.remove("is-pulling");
      if (armed) window.Site.toggleTheme();
      armed = false;
    }

    svg.addEventListener("mousedown", start);
    svg.addEventListener("touchstart", start, { passive: false });
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);

    svg.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      window.Site.toggleTheme();
      /* Give the chain a visible tug on keyboard use */
      y = TRIGGER + 12;
      draw();
    });

    draw();

    (function spring() {
      if (!pulling && y > REST + 0.3) {
        y += (REST - y) * 0.14;
        draw();
      }
      requestAnimationFrame(spring);
    })();
  }
})();