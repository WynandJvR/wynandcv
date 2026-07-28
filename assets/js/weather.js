/* weather.js: ambient weather effects driven by the visitor's real location */
(function () {
  'use strict';

  const WEATHER_MAP = {
    clear:        { codes: [0, 1], label: 'clear sky' },
    cloudy:       { codes: [2, 3], label: 'cloudy' },
    fog:          { codes: [45, 48], label: 'foggy' },
    rain:         { codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], label: 'rainy' },
    snow:         { codes: [71, 73, 75, 77, 85, 86], label: 'snowy' },
    thunderstorm: { codes: [95, 96, 99], label: 'thunderstorm' }
  };

  const MAX_PARTICLES = 150;
  /* Used when the visitor blocks geolocation. name:null hides the place entirely. */
  const FALLBACK = { lat: -33.9249, lon: 18.4241, name: null };

  let overlay = null;
  let interval = null;
  let activeType = null;
  let paused = false;
  let live = 0;
  let current = null;

  document.addEventListener('DOMContentLoaded', function () {
    overlay = document.getElementById('weather-overlay');
    if (!overlay) return;

    if (window.Site && window.Site.reduceMotion) {
      // Still report the conditions, just don't animate them.
      locate(true);
    } else {
      locate(false);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (interval) { clearInterval(interval); interval = null; paused = true; }
      } else if (paused && activeType) {
        paused = false;
        startEffect(activeType);
      }
    });

    // Refresh conditions every 15 minutes
    setInterval(() => { if (current) fetchWeather(current.lat, current.lon, current.name); }, 900000);

    window.Site.weather = {
      get current() { return current; },
      refresh: () => current && fetchWeather(current.lat, current.lon, current.name),
      set: (type) => { activeType = type; startEffect(type); }
    };
  });

  function locate(quiet) {
    if (!navigator.geolocation) {
      fetchWeather(FALLBACK.lat, FALLBACK.lon, FALLBACK.name, quiet);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude, '', quiet),
      () => fetchWeather(FALLBACK.lat, FALLBACK.lon, FALLBACK.name, quiet),
      { timeout: 5000 }
    );
  }

  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
      const data = await res.json();
      const a = data.address || {};
      return a.town || a.city || a.village || a.state || '';
    } catch (e) {
      return '';
    }
  }

  async function fetchWeather(lat, lon, fallbackName, quiet) {
    const out = document.getElementById('wxText');
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,temperature_2m&timezone=auto`
      );
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m);
      const entry = Object.entries(WEATHER_MAP).find(([, v]) => v.codes.indexOf(data.current.weather_code) !== -1);

      let label = 'unknown conditions';
      if (entry) {
        activeType = entry[0];
        label = entry[1].label;
        if (!quiet) startEffect(entry[0]);
      } else {
        activeType = null;
        clearEffects();
      }

      const place = fallbackName === null ? '' : (fallbackName || (await reverseGeocode(lat, lon)));
      current = { lat, lon, name: place, temp, label, type: activeType };

      const text = `${temp}°C · ${label}${place ? ' · ' + place : ''}`;
      if (out) out.textContent = text;
      window.Site.log(`[WEATHER] ${text}`);
    } catch (e) {
      if (out) out.textContent = 'Weather unavailable';
      window.Site.log('[WEATHER] lookup failed: ' + e.message, 'err');
    }
  }

  /* Effects */
  function clearEffects() {
    if (interval) clearInterval(interval);
    interval = null;
    live = 0;
    if (overlay) { overlay.innerHTML = ''; overlay.classList.remove('is-active'); }
  }

  function track(el) {
    live++;
    el.addEventListener('animationend', (e) => {
      if (e.target !== el) return;
      if (['rainFall', 'snowFall', 'cloudDrift'].indexOf(e.animationName) !== -1) {
        live--;
        el.remove();
      }
    });
  }

  function startEffect(type) {
    switch (type) {
      case 'clear': return clearSky();
      case 'cloudy': return clouds();
      case 'fog': return fog();
      case 'rain': return rain();
      case 'snow': return snow();
      case 'thunderstorm': return thunderstorm();
      default: return clearEffects();
    }
  }

  function rain() {
    clearEffects();
    overlay.classList.add('is-active');
    interval = setInterval(() => {
      for (let i = 0; i < 3; i++) {
        if (live >= MAX_PARTICLES) return;
        const drop = document.createElement('div');
        drop.className = 'wx-particle';
        drop.style.cssText =
          `left:${Math.random() * 100}%;top:-20px;width:1px;height:${12 + Math.random() * 18}px;` +
          `background:linear-gradient(to bottom,transparent,rgba(180,200,220,.3));` +
          `animation:rainFall ${(0.6 + Math.random() * 0.4).toFixed(2)}s linear forwards;`;
        overlay.appendChild(drop);
        track(drop);
      }
    }, 80);
  }

  function snow() {
    clearEffects();
    overlay.classList.add('is-active');
    interval = setInterval(() => {
      if (live >= MAX_PARTICLES) return;
      const size = 2 + Math.random() * 4;
      const flake = document.createElement('div');
      flake.className = 'wx-particle';
      flake.style.cssText =
        `left:${Math.random() * 100}%;top:-20px;width:${size}px;height:${size}px;` +
        `background:rgba(220,230,240,.4);border-radius:50%;` +
        `animation:snowFall ${(4 + Math.random() * 6).toFixed(2)}s linear forwards,` +
        `snowDrift ${(2 + Math.random() * 3).toFixed(2)}s ease-in-out infinite;`;
      overlay.appendChild(flake);
      track(flake);
    }, 300);
  }

  function clouds() {
    clearEffects();
    overlay.classList.add('is-active');

    function spawn() {
      const cloud = document.createElement('div');
      cloud.className = 'wx-particle';
      const scale = 0.7 + Math.random() * 0.8;
      const w = Math.round(180 * scale);
      const h = Math.round(80 * scale);
      const col = 'rgba(200,205,215,';
      const puffs = [
        { x: 0, y: h * 0.25, s: h * 0.7 },
        { x: w * 0.18, y: 0, s: h * 0.85 },
        { x: w * 0.42, y: h * 0.05, s: h * 0.95 },
        { x: w * 0.65, y: h * 0.15, s: h * 0.75 },
        { x: w * 0.82, y: h * 0.3, s: h * 0.55 }
      ];
      cloud.style.cssText =
        `top:${5 + Math.random() * 25}%;left:-${w + 100}px;width:${w + Math.round(h * 0.55)}px;` +
        `height:${Math.round(h * 1.4)}px;position:absolute;filter:blur(6px);` +
        `animation:cloudDrift ${(25 + Math.random() * 20).toFixed(1)}s linear forwards;`;

      puffs.forEach((p) => {
        const puff = document.createElement('div');
        puff.style.cssText =
          `position:absolute;left:${Math.round(p.x)}px;top:${Math.round(p.y)}px;` +
          `width:${Math.round(p.s)}px;height:${Math.round(p.s)}px;border-radius:50%;` +
          `background:radial-gradient(circle at 40% 40%,${col}.55) 0%,${col}.35) 50%,${col}.15) 80%,transparent);`;
        cloud.appendChild(puff);
      });

      const base = document.createElement('div');
      base.style.cssText =
        `position:absolute;left:${Math.round(w * 0.05)}px;top:${Math.round(h * 0.55)}px;` +
        `width:${Math.round(w * 0.9)}px;height:${Math.round(h * 0.45)}px;border-radius:${Math.round(h * 0.2)}px;` +
        `background:radial-gradient(ellipse,${col}.35) 0%,${col}.15) 70%,transparent);`;
      cloud.appendChild(base);

      overlay.appendChild(cloud);
      track(cloud);
    }

    spawn();
    interval = setInterval(spawn, 8000);
  }

  function fog() {
    clearEffects();
    overlay.classList.add('is-active');
    for (let i = 0; i < 3; i++) {
      const layer = document.createElement('div');
      layer.className = 'wx-particle';
      layer.style.cssText =
        `position:absolute;top:${15 + i * 25}%;left:0;width:100%;height:35%;` +
        `background:radial-gradient(ellipse at ${30 + i * 20}% 50%,rgba(200,205,215,.2) 0%,rgba(200,205,215,.06) 50%,transparent 100%);` +
        `filter:blur(30px);animation:fogPulse ${8 + i * 4}s ease-in-out infinite;animation-delay:${i * 2}s;`;
      overlay.appendChild(layer);
    }
  }

  function thunderstorm() {
    rain();
    [{ a: 0.08, d: 4 }, { a: 0.06, d: 7 }].forEach((cfg) => {
      const flash = document.createElement('div');
      flash.style.cssText =
        `position:absolute;inset:0;background:rgba(200,210,230,${cfg.a});` +
        `animation:lightningFlash ${cfg.d}s ease-in-out infinite;`;
      flash.style.animationDelay = (Math.random() * cfg.d).toFixed(2) + 's';
      overlay.appendChild(flash);
    });
  }

  function clearSky() {
    clearEffects();
    overlay.classList.add('is-active');
    const glow = document.createElement('div');
    glow.style.cssText =
      'position:absolute;top:-30px;right:5%;width:250px;height:250px;' +
      'background:radial-gradient(circle,rgba(212,168,85,.2) 0%,rgba(184,134,11,.08) 40%,transparent 70%);' +
      'border-radius:50%;animation:sunGlow 6s ease-in-out infinite;filter:blur(20px);';
    overlay.appendChild(glow);
  }
})();
