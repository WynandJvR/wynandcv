/* analytics.js: first-party page metrics, beacon only */
(function () {
  'use strict';

  const ENDPOINT = '/analytics/track';

  function send(payload) {
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
    } catch (e) {}
  }

  function device() {
    if (screen.width < 768) return 'mobile';
    return screen.width < 1024 ? 'tablet' : 'desktop';
  }

  document.addEventListener('DOMContentLoaded', function () {
    send({
      type: 'pageview',
      url: location.pathname,
      title: document.title,
      referrer: document.referrer,
      device: device()
    });

    const opened = Date.now();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden') return;
      send({
        type: 'time_on_page',
        url: location.pathname,
        data: { seconds: Math.round((Date.now() - opened) / 1000) }
      });
    });

    /* Fire once per section, the first time it is half on screen */
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        send({ type: 'section_view', url: location.pathname, data: { section: e.target.id } });
        io.unobserve(e.target);
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('section[id]').forEach(function (el) { io.observe(el); });

    document.addEventListener('click', function (e) {
      const target = e.target.closest('a[href], button, .project, .demo-card');
      if (!target) return;
      send({
        type: 'click',
        url: location.pathname,
        data: {
          tag: target.tagName,
          text: (target.textContent || '').slice(0, 50).trim(),
          href: target.getAttribute('href') || ''
        }
      });
    });
  });
})();
