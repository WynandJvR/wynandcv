/* telemetry.js: live Raspberry Pi metrics */
(function () {
  'use strict';

  const POLL_MS = 5000;
  const MAX_POINTS = 60; // 5 minutes at 5s intervals

  const history = { cpu: [], ram: [], temp: [], load1: [], load5: [], load15: [] };
  let firstLoad = true;
  let failures = 0;
  let latest = null;

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('pi-cpu')) return;
    refresh();
    setInterval(refresh, POLL_MS);

    window.Site.stats = {
      get latest() { return latest; },
      get history() { return history; },
      refresh
    };
  });

  /* Fetching */
  async function refresh() {
    try {
      const res = await fetch('/stats', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const s = await res.json();
      failures = 0;
      setLive(true);
      apply(s);
    } catch (e) {
      failures++;
      if (failures >= 2) setLive(false);
      window.Site.log('[STATS] ' + e.message, 'err');
    }
  }

  function setLive(ok) {
    const badge = $('liveBadge');
    const text = $('liveText');
    if (badge) badge.dataset.state = ok ? 'live' : 'offline';
    if (text) text.textContent = ok ? 'Live' : 'Reconnecting';
  }

  function apply(s) {
    latest = s;

    const cpu = Number(s.cpu_usage) || 0;
    const ram = Math.round(Number(s.ram_used_pct) || 0);
    const disk = Math.round(Number(s.disk_root_used_pct) || 0);
    const tempC = s.cpu_temp_c != null ? Number(s.cpu_temp_c) : null;
    const load = Array.isArray(s.load_avg) ? s.load_avg : null;

    if (firstLoad && s.history && Array.isArray(s.history.cpu) && s.history.cpu.length) {
      history.cpu = s.history.cpu.slice(-MAX_POINTS);
      history.ram = (s.history.ram || []).slice(-MAX_POINTS);
      history.temp = (s.history.temp || []).slice(-MAX_POINTS);
      history.load1 = (s.history.load1 || []).slice(-MAX_POINTS);
      history.load5 = (s.history.load5 || []).slice(-MAX_POINTS);
      history.load15 = (s.history.load15 || []).slice(-MAX_POINTS);
      window.Site.log(`[STATS] restored ${history.cpu.length} historical points`, 'ok');
      firstLoad = false;
    } else {
      firstLoad = false;
      push(history.cpu, cpu);
      push(history.ram, ram);
      if (tempC != null) push(history.temp, tempC);
      if (load && load.length >= 3) {
        push(history.load1, load[0]);
        push(history.load5, load[1]);
        push(history.load15, load[2]);
      }
    }

    animate('pi-cpu', Math.round(cpu));
    animate('pi-ram', ram);
    animate('pi-disk', disk);

    setBar('pi-cpu-bar', cpu);
    setBar('pi-ram-bar', ram);
    setDial('disk-dial', disk);

    const tempEl = $('pi-temp');
    if (tempEl) tempEl.innerHTML = tempC != null ? `${tempC.toFixed(1)}<span class="unit">°C</span>` : '...';

    const loadEl = $('pi-load');
    if (loadEl) loadEl.textContent = load ? load.map((v) => Number(v).toFixed(2)).join('  ') : '...';

    const uptimeEl = $('pi-uptime');
    if (uptimeEl) uptimeEl.textContent = formatUptime(s.uptime_seconds || 0);

    const recordEl = $('pi-uptime-record');
    if (recordEl && s.uptime_record_seconds) recordEl.textContent = formatUptime(s.uptime_record_seconds);

    sparkline('cpu-graph', history.cpu, 100);
    sparkline('ram-graph', history.ram, 100);
    sparkline('temp-graph', history.temp, 90);
    multiline('load-graph', [history.load1, history.load5, history.load15]);

    setRange('cpu-range', history.cpu, '%');
    setRange('ram-range', history.ram, '%');
    setRange('temp-range', history.temp, '°C');

    window.Site.log(
      `[PI] cpu ${cpu.toFixed(1)}% · ram ${ram}% · temp ${tempC != null ? tempC.toFixed(1) + '°C' : 'n/a'}`
    );
  }

  function push(arr, value) {
    arr.push(value);
    if (arr.length > MAX_POINTS) arr.shift();
  }

  function setRange(id, data, unit) {
    const el = $(id);
    if (!el) return;
    if (!data.length) { el.textContent = '...'; return; }
    const min = Math.min.apply(null, data);
    const max = Math.max.apply(null, data);
    el.textContent = `${min.toFixed(min < 10 ? 1 : 0)}-${max.toFixed(max < 10 ? 1 : 0)}${unit}`;
  }

  /* Display */
  function animate(id, target) {
    const el = $(id);
    if (!el) return;
    const from = parseFloat(el.textContent) || 0;
    if (window.Site.reduceMotion) { el.textContent = String(target); return; }
    const t0 = performance.now();
    const dur = 520;
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = String(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  function setBar(id, pct) {
    const el = $(id);
    if (!el) return;
    el.style.width = Math.max(0, Math.min(100, pct)) + '%';
    el.classList.toggle('is-warn', pct >= 70 && pct < 88);
    el.classList.toggle('is-bad', pct >= 88);
  }

  function setDial(id, pct) {
    const el = $(id);
    if (!el) return;
    const circumference = 2 * Math.PI * 52; // r = 52
    el.setAttribute('stroke-dasharray', circumference.toFixed(1));
    el.setAttribute('stroke-dashoffset', (circumference * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(1));
  }

  /* Sparkline */
  function scaleFor(values, ceiling) {
    const min = Math.min.apply(null, values);
    const max = Math.max.apply(null, values);
    const range = max - min;
    if (range < ceiling * 0.08) {
      const mid = (min + max) / 2;
      const pad = ceiling * 0.08;
      return { lo: Math.max(0, mid - pad), hi: Math.min(ceiling, mid + pad) || pad };
    }
    return { lo: Math.max(0, min - range * 0.12), hi: Math.min(ceiling, max + range * 0.12) };
  }

  function toPoints(data, lo, hi) {
    const span = hi - lo || 1;
    return data.map((v, i) => {
      const x = data.length === 1 ? 0 : (i / (data.length - 1)) * 100;
      const y = 30 - ((v - lo) / span) * 27;
      return [x, Math.max(1, Math.min(31, y))];
    });
  }

  function pathFrom(points) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  }

  function sparkline(id, data, ceiling) {
    const svg = $(id);
    if (!svg) return;
    if (data.length < 2) {
      svg.innerHTML = '<text x="50" y="19" text-anchor="middle" font-size="6" fill="currentColor" opacity=".35">collecting…</text>';
      return;
    }
    const { lo, hi } = scaleFor(data, ceiling);
    const pts = toPoints(data, lo, hi);
    const line = pathFrom(pts);
    const area = `${line} L100,32 L0,32 Z`;
    const gid = 'sparkFill-' + id;

    svg.innerHTML =
      `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#d4a855" stop-opacity=".30"/>` +
      `<stop offset="100%" stop-color="#d4a855" stop-opacity="0"/>` +
      `</linearGradient></defs>` +
      `<path d="${area}" fill="url(#${gid})"/>` +
      `<path d="${line}" fill="none" stroke="#e6b84f" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
      `<circle cx="${pts[pts.length - 1][0].toFixed(2)}" cy="${pts[pts.length - 1][1].toFixed(2)}" r="1.6" fill="#e6b84f"/>`;
  }

  function multiline(id, series) {
    const svg = $(id);
    if (!svg) return;
    const usable = series.filter((s) => s.length >= 2);
    if (!usable.length) {
      svg.innerHTML = '<text x="50" y="19" text-anchor="middle" font-size="6" fill="currentColor" opacity=".35">collecting…</text>';
      return;
    }
    const all = usable.reduce((acc, s) => acc.concat(s), []);
    const ceiling = Math.max(2, Math.max.apply(null, all) * 1.25);
    const { lo, hi } = scaleFor(all, ceiling);
    const colors = ['#e6b84f', '#7dd3fc', '#f9a8d4'];

    svg.innerHTML = series.map((s, i) => {
      if (s.length < 2) return '';
      return `<path d="${pathFrom(toPoints(s, lo, hi))}" fill="none" stroke="${colors[i]}" ` +
             `stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".9" vector-effect="non-scaling-stroke"/>`;
    }).join('');
  }

  /* Utils */
  function formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }
  window.Site = window.Site || {};
  window.Site.formatUptime = formatUptime;
})();
