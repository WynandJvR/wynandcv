/* telemetry.js: live Raspberry Pi readings.
   Polls /stats, fills every [data-stat] element, and broadcasts a `pi:stats`
   event so the 3D board in the hero can react to the real numbers. */
(function () {
  'use strict';

  const POLL_MS = 5000;
  const MAX_POINTS = 60; // 5 minutes at 5s intervals

  const history = { cpu: [], ram: [], temp: [] };
  let failures = 0;
  let latest = null;
  let seeded = false;

  document.addEventListener('DOMContentLoaded', function () {
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);

    window.Site.stats = {
      get latest() { return latest; },
      get history() { return history; },
      refresh
    };
  });

  async function refresh() {
    try {
      const res = await fetch('/stats', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const s = await res.json();
      failures = 0;
      setLive(true);
      apply(s);
      document.dispatchEvent(new CustomEvent('pi:stats', { detail: s }));
    } catch (e) {
      failures++;
      if (failures >= 2) setLive(false);
      window.Site.log('[STATS] ' + e.message, 'err');
    }
  }

  function setLive(ok) {
    document.querySelectorAll('[data-live]').forEach((el) => { el.dataset.live = ok ? 'on' : 'off'; });
  }

  function apply(s) {
    latest = s;
    const cpu = Number(s.cpu_usage) || 0;
    const ram = Number(s.ram_used_pct) || 0;
    const temp = s.cpu_temp_c != null ? Number(s.cpu_temp_c) : null;

    if (!seeded && s.history && Array.isArray(s.history.cpu)) {
      history.cpu = s.history.cpu.slice(-MAX_POINTS);
      history.ram = (s.history.ram || []).slice(-MAX_POINTS);
      history.temp = (s.history.temp || []).slice(-MAX_POINTS);
    } else {
      push(history.cpu, cpu);
      push(history.ram, ram);
      if (temp != null) push(history.temp, temp);
    }
    seeded = true;

    const up = Number(s.uptime_seconds) || 0;
    const values = {
      temp: temp != null ? temp.toFixed(1) : '–',
      cpu: Math.round(cpu),
      ram: Math.round(ram),
      disk: Math.round(Number(s.disk_root_used_pct) || 0),
      load: Array.isArray(s.load_avg) ? Number(s.load_avg[0]).toFixed(2) : '–',
      days: Math.floor(up / 86400),
      hours: Math.floor((up % 86400) / 3600),
      record: s.uptime_record_seconds ? Math.floor(s.uptime_record_seconds / 86400) : '–'
    };
    Object.keys(values).forEach((k) => {
      document.querySelectorAll(`[data-stat="${k}"]`).forEach((el) => { el.textContent = String(values[k]); });
    });

    document.querySelectorAll('[data-spark]').forEach((svg) => {
      const key = svg.dataset.spark;
      sparkline(svg, history[key] || [], key === 'temp' ? 90 : 100);
    });

    window.Site.log(`[PI] cpu ${cpu.toFixed(1)}% · ram ${Math.round(ram)}% · temp ${temp != null ? temp.toFixed(1) + '°C' : 'n/a'}`);
  }

  function push(arr, value) {
    arr.push(value);
    if (arr.length > MAX_POINTS) arr.shift();
  }

  function sparkline(svg, data, ceiling) {
    if (data.length < 2) { svg.innerHTML = ''; return; }
    let lo = Math.min.apply(null, data), hi = Math.max.apply(null, data);
    if (hi - lo < ceiling * 0.08) { const mid = (lo + hi) / 2; lo = mid - ceiling * 0.04; hi = mid + ceiling * 0.04; }
    const span = hi - lo || 1;
    const pts = data.map((v, i) => `${((i / (data.length - 1)) * 100).toFixed(2)},${(30 - ((v - lo) / span) * 27).toFixed(2)}`);
    svg.innerHTML =
      `<path d="M${pts.join(' L')}" fill="none" stroke="currentColor" stroke-width="1.25" ` +
      `stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  }

  function formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }
  window.Site = window.Site || {};
  window.Site.formatUptime = formatUptime;
})();
