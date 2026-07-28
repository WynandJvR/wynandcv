/* hero.js: particle constellation canvas + role typewriter */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    initTypewriter();
    initConstellation();
  });

  /* Typewriter */
  function initTypewriter() {
    const out = document.getElementById('roleText');
    if (!out) return;

    const roles = [
      'Full-stack Developer',
      'Go and PHP, front to back',
      'Serverless on AWS Lambda',
      'Self-hosting enthusiast',
      'Problem solver'
    ];

    if (window.Site && window.Site.reduceMotion) {
      out.textContent = roles[0];
      return;
    }

    let i = 0, j = 0, deleting = false;

    (function tick() {
      const word = roles[i];
      j += deleting ? -1 : 1;
      out.textContent = word.slice(0, j);

      let delay = deleting ? 32 : 62;
      if (!deleting && j === word.length) { delay = 1900; deleting = true; }
      else if (deleting && j === 0) { deleting = false; i = (i + 1) % roles.length; delay = 320; }

      setTimeout(tick, delay);
    })();
  }

  /* Constellation */
  function initConstellation() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    if (window.Site && window.Site.reduceMotion) { canvas.remove(); return; }

    const ctx = canvas.getContext('2d', { alpha: true });
    const hero = canvas.parentElement;
    let w = 0, h = 0, dpr = 1;
    let nodes = [];
    let raf = null;
    let visible = true;

    const pointer = { x: -9999, y: -9999, active: false };
    const LINK_DIST = 132;
    const POINTER_DIST = 168;

    function palette() {
      return document.documentElement.getAttribute('data-theme') === 'light'
        ? { dot: 'rgba(150, 105, 15, ', line: 'rgba(184, 134, 11, ' }
        : { dot: 'rgba(230, 184, 79, ', line: 'rgba(212, 168, 85, ' };
    }
    let colors = palette();

    function resize() {
      const rect = hero.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      // Density scales with area but stays cheap on a phone.
      const target = Math.min(88, Math.max(26, Math.round((w * h) / 17000)));
      nodes = [];
      for (let i = 0; i < target; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.24,
          vy: (Math.random() - 0.5) * 0.24,
          r: 0.8 + Math.random() * 1.5
        });
      }
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;

        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;

        // Gentle repulsion from the cursor
        if (pointer.active) {
          const dx = n.x - pointer.x;
          const dy = n.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < POINTER_DIST * POINTER_DIST && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / POINTER_DIST) * 0.9;
            n.x += (dx / d) * push;
            n.y += (dy / d) * push;
          }
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = colors.dot + '0.55)';
        ctx.fill();
      }

      // Links
      for (let i = 0; i < nodes.length; i++) {
        for (let k = i + 1; k < nodes.length; k++) {
          const a = nodes[i], b = nodes[k];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DIST * LINK_DIST) continue;
          const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.32;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = colors.line + alpha.toFixed(3) + ')';
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }

      // Cursor halo links
      if (pointer.active) {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const dx = n.x - pointer.x, dy = n.y - pointer.y;
          const d = Math.hypot(dx, dy);
          if (d > POINTER_DIST) continue;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.strokeStyle = colors.line + ((1 - d / POINTER_DIST) * 0.4).toFixed(3) + ')';
          ctx.lineWidth = 0.85;
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(frame);
    }

    function start() { if (!raf) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = true;
    }, { passive: true });
    hero.addEventListener('mouseleave', () => { pointer.active = false; });

    window.addEventListener('resize', debounce(resize, 180));
    document.addEventListener('themechange', () => { colors = palette(); });

    // Pause when the hero scrolls out of view or the tab is hidden.
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) start(); else stop();
    }, { threshold: 0.02 });
    io.observe(hero);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else if (visible) start();
    });

    resize();
    start();
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
})();
