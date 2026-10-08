/* machine.js: the hero. A Raspberry Pi 4 built in three.js and driven by the
   real readings of the Pi serving the page. The SoC glows with its actual
   temperature, heat rises with CPU load, and every telemetry request flashes
   the Ethernet LEDs and sends a packet along the board to the chip. */
import * as THREE from '../vendor/three.module.min.js';

const stage = document.getElementById('machine');
const canvas = document.getElementById('machine-canvas');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/* Build the scene after the page has painted, so the text appears at once and
   the heavier work (textures, geometry) happens while the visitor reads. */
function start() {
  const go = () => init();
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 600 });
  else setTimeout(go, 60);
}
if (stage && canvas && webglAvailable()) {
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
if (stage && !(canvas && webglAvailable())) stage.classList.add('is-static');

async function init() {
  // Yield to the browser between the heavy steps so input stays responsive
  const breathe = () => new Promise((r) => setTimeout(r, 0));
  const small = window.innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 13, 17.5);
  camera.lookAt(0, 0, 0);

  scene.environment = buildEnvironment(renderer);
  await breathe();
  const pcb = pcbTextures(small ? 1024 : 2048);
  await breathe();

  /* Lights */
  scene.add(new THREE.AmbientLight(0x404650, 0.6));
  const key = new THREE.DirectionalLight(0xf4f2ee, 2.4);
  key.position.set(-6, 10, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb4ff, 0.55);
  rim.position.set(6, 3, -8);
  scene.add(rim);

  /* Board */
  const pi = new THREE.Group();
  const board = buildBoard(pcb);
  await breathe();
  pi.add(board.group);
  scene.add(pi);

  /* Heat: a glow sprite and a light that track the SoC's real temperature */
  const heatTex = radialTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: heatTex, color: 0xff7a2f, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glow.position.copy(board.anchors.soc).add(new THREE.Vector3(0, 0.25, 0));
  glow.scale.set(3.2, 3.2, 1);
  pi.add(glow);

  const heatLight = new THREE.PointLight(0xff6a2a, 0, 2.6, 2);
  heatLight.position.copy(board.anchors.soc).add(new THREE.Vector3(0, 0.6, 0));
  pi.add(heatLight);

  /* Rising heat particles, more of them the busier the CPU is */
  const HEAT_COUNT = 70;
  const heatGeo = new THREE.BufferGeometry();
  const heatPos = new Float32Array(HEAT_COUNT * 3);
  const heatLife = new Float32Array(HEAT_COUNT);
  for (let i = 0; i < HEAT_COUNT; i++) resetParticle(i, Math.random());
  heatGeo.setAttribute('position', new THREE.BufferAttribute(heatPos, 3));
  const heatPts = new THREE.Points(heatGeo, new THREE.PointsMaterial({
    map: heatTex, color: 0xffa060, size: 0.16, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  pi.add(heatPts);

  function resetParticle(i, life) {
    const s = board.anchors.soc;
    heatPos[i * 3] = s.x + (Math.random() - 0.5) * 1.2;
    heatPos[i * 3 + 1] = s.y + 0.15;
    heatPos[i * 3 + 2] = s.z + (Math.random() - 0.5) * 1.2;
    heatLife[i] = life;
  }

  /* Packet: travels from the Ethernet jack to the SoC on every request */
  const packet = new THREE.Sprite(new THREE.SpriteMaterial({
    map: heatTex, color: 0x9ff0c0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  packet.scale.set(0.7, 0.7, 1);
  pi.add(packet);
  const packetPath = new THREE.CurvePath();
  const pp = board.anchors.packetPath;
  for (let i = 0; i < pp.length - 1; i++) packetPath.add(new THREE.LineCurve3(pp[i], pp[i + 1]));
  let packetT = -1;

  /* State fed by telemetry. `live` holds the latest reading; `shown` eases
     towards it so a new reading never makes the glow jump. */
  const live = { temp: 45, cpu: 5, ok: false };
  const shown = { heat: 0.2, load: 0.05 };
  let ledFlash = 0;

  document.addEventListener('pi:stats', (e) => {
    const s = e.detail;
    if (s.cpu_temp_c != null) live.temp = Number(s.cpu_temp_c);
    live.cpu = Number(s.cpu_usage) || 0;
    live.ok = true;
    ledFlash = 1;
    packetT = 0;
  });

  /* Frame-rate independent easing: the same feel at 60Hz and 144Hz */
  const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

  /* Interaction. The pointer is tracked on the whole window, so passing over
     the hero text never freezes the board, and every input only sets a
     target that the frame loop eases towards. */
  const pointer = { x: 0, y: 0 };        // target, -1..1 across the hero
  const look = { x: 0, y: 0 };           // eased pointer
  let drag = null;
  let yaw = 0, yawTarget = 0, yawVel = 0; // drag rotation, kept after release
  let pitch = 0, pitchTarget = 0;        // drag tilt, eases back slowly

  window.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const now = performance.now();
      const step = Math.max(1, now - drag.t);
      yawTarget += dx * 0.006;
      yawVel = (dx * 0.006) / (step / 1000);    // radians per second, for the flick
      pitchTarget = Math.max(-0.35, Math.min(0.45, pitchTarget + dy * 0.003));
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
      return;
    }
    if (e.pointerType !== 'mouse') return;
    pointer.x = (e.clientX / Math.max(1, width)) * 2 - 1;
    pointer.y = Math.max(-1, Math.min(1, (e.clientY / Math.max(1, height)) * 2 - 1));
  }, { passive: true });

  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    yawVel = 0;
    canvas.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  });
  const endDrag = () => {
    if (!drag) return;
    // A drag that stopped moving before release should not fling
    if (performance.now() - drag.t > 80) yawVel = 0;
    yawVel = Math.max(-6, Math.min(6, yawVel));
    drag = null;
    stage.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  document.documentElement.addEventListener('pointerleave', () => { pointer.x = 0; pointer.y = 0; });

  /* Callouts: HTML labels pinned to points on the model. Each has a fixed
     screen-space offset, so labels move rigidly with the board and never
     swap sides mid-animation. */
  const OFFSETS = {
    soc: { dx: -1, dy: -0.1, reach: 330, side: 'left' },
    ram: { dx: 0.5, dy: -0.85, reach: 150, side: 'right' },
    eth: { dx: 1, dy: 0.08, reach: 110, side: 'right' },
    power: { dx: -1, dy: 0.02, reach: 150, side: 'left' }
  };
  const callouts = Array.from(document.querySelectorAll('[data-anchor]')).map((el) => {
    const o = OFFSETS[el.dataset.anchor];
    if (o) el.classList.toggle('is-left', o.side === 'left');
    return { el, anchor: board.anchors[el.dataset.anchor], o };
  }).filter((c) => c.anchor && c.o);
  const lines = document.getElementById('machine-lines');
  const linePath = lines && lines.firstElementChild;

  /* Sizing: watch the element itself, and ignore the small height changes
     mobile browsers make when the address bar shows and hides. */
  let width = 0, height = 0, compact = false;
  let maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize(force) {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    if (!force && w === width && Math.abs(h - height) < 90) return;
    width = w; height = h;
    compact = width < 760;
    renderer.setPixelRatio(maxDpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = 28;
    camera.updateProjectionMatrix();
    pi.scale.setScalar(compact ? Math.max(0.42, Math.min(1, camera.aspect / 0.95)) : 1);
    if (lines) lines.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => resize(false)).observe(stage);
  else window.addEventListener('resize', () => resize(false));
  resize(true);

  /* Run only while visible */
  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0 }).observe(stage);

  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  const hot = new THREE.Color();
  const COOL = new THREE.Color(0xffa040);
  const HOT = new THREE.Color(0xff3b1f);
  let elapsed = 0;
  let scrollP = 0;
  let slowFrames = 0, sampled = 0;
  // Compile shaders off the main thread where supported, before the first frame
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { /* first render compiles */ }
  await breathe();
  stage.classList.add('is-ready');

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 1 / 20);
    elapsed += dt;
    const motion = reduceMotion ? 0 : 1;

    /* Drop to 1x resolution if this device cannot hold ~45fps */
    if (sampled < 120 && maxDpr > 1) {
      sampled++;
      if (dt > 1 / 45) slowFrames++;
      if (sampled === 120 && slowFrames > 40) { maxDpr = 1; resize(true); }
    }

    /* Scroll: as the hero leaves, the board tips back and sinks. The hero is
       the first thing on the page, so scrollY is all that is needed. */
    scrollP = damp(scrollP, Math.max(0, Math.min(1, window.scrollY / height)), 12, dt);

    /* Rotation: drag, flick inertia, pointer parallax and an idle sway */
    if (!drag) {
      yawTarget += yawVel * dt;
      yawVel *= Math.exp(-3.2 * dt);
      pitchTarget = damp(pitchTarget, 0, 0.8, dt);
    }
    yaw = damp(yaw, yawTarget, 16, dt);
    pitch = damp(pitch, pitchTarget, 12, dt);
    const lookRate = drag ? 2 : 4;
    look.x = damp(look.x, drag ? look.x : pointer.x, lookRate, dt);
    look.y = damp(look.y, drag ? look.y : pointer.y, lookRate, dt);

    const baseYaw = compact ? -0.35 : -0.55;
    pi.rotation.y = baseYaw + yaw + motion * (Math.sin(elapsed * 0.25) * 0.1 + look.x * 0.22);
    pi.rotation.x = pitch + motion * look.y * 0.08 + scrollP * 0.55;
    pi.position.set(
      compact ? 0 : 2.2,
      (compact ? 1.6 : 1.0) + motion * Math.sin(elapsed * 0.8) * 0.06 - scrollP * 1.5,
      compact ? -2 : -1.2
    );

    /* Heat from the real temperature (38C cool, 75C hot), eased over ~2s */
    shown.heat = damp(shown.heat, Math.max(0, Math.min(1, (live.temp - 38) / 37)), 1.5, dt);
    shown.load = damp(shown.load, Math.max(0, Math.min(1, live.cpu / 100)), 1.5, dt);
    const heat = shown.heat, load = shown.load;
    hot.lerpColors(COOL, HOT, heat);
    glow.material.color.copy(hot);
    glow.material.opacity = (0.35 + heat * 0.5 + load * 0.3) * (0.93 + Math.sin(elapsed * 1.6) * 0.07 * motion);
    const gs = 2.6 + heat * 1.6;
    glow.scale.set(gs, gs, 1);
    heatLight.color.copy(hot);
    heatLight.intensity = 1.2 + heat * 3.5 + load * 2.5;
    board.socMat.emissive.copy(hot);
    board.socMat.emissiveIntensity = 0.05 + heat * 0.25;

    /* Heat particles */
    const rate = (0.25 + load * 1.6 + heat * 0.4) * motion;
    for (let i = 0; i < HEAT_COUNT; i++) {
      heatLife[i] += dt * rate * (0.6 + (i % 7) * 0.08);
      if (heatLife[i] >= 1) resetParticle(i, 0);
      heatPos[i * 3 + 1] = board.anchors.soc.y + 0.15 + heatLife[i] * 2.4;
      heatPos[i * 3] += Math.sin(elapsed * 1.7 + i) * 0.12 * dt;
    }
    heatGeo.attributes.position.needsUpdate = true;
    heatPts.material.opacity = 0.25 + heat * 0.4;
    heatPts.material.color.copy(hot);

    /* LEDs: power always on, activity and Ethernet flicker on each request */
    ledFlash = Math.max(0, ledFlash - dt * 1.6);
    const flicker = ledFlash > 0 ? 0.55 + 0.45 * Math.sin(elapsed * 28) : 0;
    board.leds.act.emissiveIntensity = 0.3 + ledFlash * flicker * 4;
    board.leds.ethGreen.emissiveIntensity = 0.4 + ledFlash * flicker * 4;
    board.leds.ethAmber.emissiveIntensity = live.ok ? 1.6 : 0.2;
    board.leds.power.emissiveIntensity = 2.5;
    board.traceMat.emissiveIntensity = 0.04 + ledFlash * 0.3;

    /* Packet travel, eased in and out along the path */
    if (packetT >= 0) {
      packetT += dt * 0.8;
      if (packetT >= 1) { packetT = -1; packet.material.opacity = 0; }
      else {
        const t = packetT < 0.5 ? 2 * packetT * packetT : 1 - Math.pow(-2 * packetT + 2, 2) / 2;
        packetPath.getPointAt(t, tmp);
        packet.position.copy(tmp);
        packet.material.opacity = Math.sin(packetT * Math.PI) * 0.95;
      }
    }

    renderer.render(scene, camera);
    if (!compact) placeCallouts();
  }
  requestAnimationFrame(frame);

  function placeCallouts() {
    if (!callouts.length) return;
    let path = '';
    const fade = Math.max(0, 1 - scrollP * 2.2);
    callouts.forEach((c) => {
      pi.localToWorld(tmp.copy(c.anchor));
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * width;
      const y = (-tmp.y * 0.5 + 0.5) * height;
      const { dx, dy, reach, side } = c.o;
      const len = Math.hypot(dx, dy);
      let lx = x + (dx / len) * reach;
      const ly = y + (dy / len) * reach;
      lx = side === 'left' ? Math.max(140, lx) : Math.min(width - 150, lx);
      c.el.style.transform = `translate3d(${lx.toFixed(1)}px, ${(ly - 22).toFixed(1)}px, 0)`;
      c.el.style.opacity = fade.toFixed(3);
      path += `M${x.toFixed(1)},${y.toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)} `;
      path += `M${(x - 2.5).toFixed(1)},${y.toFixed(1)} a2.5,2.5 0 1,0 5,0 a2.5,2.5 0 1,0 -5,0 `;
    });
    if (linePath) {
      linePath.setAttribute('d', path);
      lines.style.opacity = fade.toFixed(3);
    }
  }
}

/* ------------------------------------------------------------- Geometry */
/* Units: 1 = 10mm. Board is 85 x 56mm. x runs along the long edge, z towards
   the viewer. Ports are on the right edge, the GPIO header on the far edge.
   The layout follows a real Pi 4 Model B closely enough to read as one. */
function buildBoard(pcb) {
  const group = new THREE.Group();
  const W = 8.5, D = 5.6, T = 0.14;
  const top = T / 2;

  const mat = (color, metal = 0, rough = 0.6, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
  const add = (geo, m, x, y, z, ry = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    group.add(mesh);
    return mesh;
  };
  const box = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const rbox = (w, h, d, r, m, x, y, z) => add(roundedBox(w, h, d, r), m, x, y, z);

  /* Shared materials */
  const steel = mat(0xc3c6cb, 0.9, 0.34);
  const steelDark = mat(0x8c9096, 0.9, 0.45);
  const gold = mat(0xe0b55e, 1, 0.28);
  const blackPlastic = mat(0x0d0d0f, 0, 0.55);
  const void_ = mat(0x020203, 0, 1);
  const chipBlack = mat(0x141518, 0.15, 0.42);

  /* PCB */
  const traceMat = new THREE.MeshStandardMaterial({
    map: pcb.map, emissiveMap: pcb.emissive, emissive: new THREE.Color(0xffc27a),
    emissiveIntensity: 0.04, metalness: 0.15, roughness: 0.55,
    bumpMap: pcb.bump, bumpScale: 0.6
  });
  group.add(new THREE.Mesh(roundedBoard(W, D, T, 0.3), [traceMat, mat(0x0a1a10, 0, 0.8)]));

  /* Mounting holes: plated rings */
  [[-W / 2 + 0.35, -D / 2 + 0.35], [-W / 2 + 0.35, D / 2 - 0.35], [W / 2 - 2.35, -D / 2 + 0.35], [W / 2 - 2.35, D / 2 - 0.35]]
    .forEach(([x, z]) => {
      const ring = add(new THREE.RingGeometry(0.14, 0.31, 32), gold, x, top + 0.002, z);
      ring.rotation.x = -Math.PI / 2;
      const hole = add(new THREE.CylinderGeometry(0.14, 0.14, T + 0.01, 24, 1, true), void_, x, 0, z);
      hole.material = new THREE.MeshStandardMaterial({ color: 0x020202, side: THREE.BackSide });
      const cap = add(new THREE.CircleGeometry(0.14, 24), void_, x, top + 0.003, z);
      cap.rotation.x = -Math.PI / 2;
    });

  /* SoC: package substrate, then a rounded metal lid with markings */
  rbox(1.62, 0.07, 1.62, 0.05, mat(0x1d2a20, 0.1, 0.6), -1.25, top + 0.035, -0.25);
  const socMat = new THREE.MeshStandardMaterial({
    map: markingTexture(['BROADCOM', 'BCM2711B0T', 'HZRG 2213', '● e3'], '#b9bcc2', '#5a5d63', 'metal'),
    color: 0xffffff, metalness: 0.95, roughness: 0.3,
    emissive: new THREE.Color(0xff7a2f), emissiveIntensity: 0.1
  });
  rbox(1.42, 0.07, 1.42, 0.08, [steel, steel, socMat, steel, steel, steel], -1.25, top + 0.105, -0.25);
  const soc = new THREE.Vector3(-1.25, top + 0.14, -0.25);

  /* RAM */
  const ramTop = new THREE.MeshStandardMaterial({ map: markingTexture(['Micron', '1WG32 D9ZCL', 'LPDDR4'], '#121316', '#7c7f86'), roughness: 0.45 });
  rbox(1.0, 0.11, 1.45, 0.03, [chipBlack, chipBlack, ramTop, chipBlack, chipBlack, chipBlack], 0.35, top + 0.055, -0.25);
  const ram = new THREE.Vector3(0.35, top + 0.11, -0.25);

  /* USB 3 controller, Ethernet PHY and PMIC, each with its own markings */
  const chip = (w, d, h, lines, x, z) => {
    const t = new THREE.MeshStandardMaterial({ map: markingTexture(lines, '#141518', '#6f7279'), roughness: 0.45 });
    rbox(w, h, d, 0.02, [chipBlack, chipBlack, t, chipBlack, chipBlack, chipBlack], x, top + h / 2, z);
  };
  chip(0.62, 0.62, 0.08, ['VIA', 'VL805'], 1.55, 0.75);
  chip(0.5, 0.5, 0.07, ['BCM', '54213PE'], 2.15, 1.7);
  chip(0.45, 0.45, 0.06, ['MXL', '7704'], -2.9, 1.15);

  /* Wireless module: stamped shield can, and the PCB antenna is in the texture */
  const shieldTop = new THREE.MeshStandardMaterial({ map: shieldTexture(), metalness: 0.9, roughness: 0.38 });
  rbox(1.15, 0.14, 0.95, 0.04, [steelDark, steelDark, shieldTop, steelDark, steelDark, steelDark], -2.95, top + 0.07, -1.55);

  /* Crystal oscillator and power inductors */
  rbox(0.32, 0.08, 0.2, 0.04, steel, -0.3, top + 0.04, 0.85);
  [[-2.55, 2.0], [-2.15, 2.0], [-1.0, 1.15]].forEach(([x, z]) => rbox(0.3, 0.14, 0.3, 0.04, mat(0x2b2c2f, 0.4, 0.6), x, top + 0.07, z));

  /* GPIO header: 2 x 20, black base blocks and gold square pins */
  const gx0 = -3.1, pitch = 0.254;
  const base = new THREE.InstancedMesh(roundedBox(pitch * 0.94, 0.25, pitch * 1.94, 0.02), blackPlastic, 20);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) {
    m4.makeTranslation(gx0 + i * pitch, top + 0.125, -2.5);
    base.setMatrixAt(i, m4);
  }
  group.add(base);
  const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.064, 0.85, 0.064), gold, 40);
  for (let i = 0; i < 20; i++) for (let r = 0; r < 2; r++) {
    m4.makeTranslation(gx0 + i * pitch, top + 0.3, -2.5 - pitch / 2 + r * pitch);
    pins.setMatrixAt(i * 2 + r, m4);
  }
  group.add(pins);

  /* PoE header (4 pins) and the fan header */
  const smallHeader = (cols, rows, x, z) => {
    box(cols * pitch, 0.2, rows * pitch, blackPlastic, x, top + 0.1, z);
    for (let i = 0; i < cols; i++) for (let r = 0; r < rows; r++) {
      box(0.06, 0.55, 0.06, gold, x - (cols - 1) * pitch / 2 + i * pitch, top + 0.3, z - (rows - 1) * pitch / 2 + r * pitch);
    }
  };
  smallHeader(2, 2, 2.2, -2.35);

  /* Ethernet: steel shell with a real RJ45 opening, latch notch and LED windows */
  const ethFront = new THREE.Shape();
  ethFront.moveTo(-0.8, 0); ethFront.lineTo(0.8, 0); ethFront.lineTo(0.8, 1.35); ethFront.lineTo(-0.8, 1.35); ethFront.lineTo(-0.8, 0);
  const rj = new THREE.Path();
  rj.moveTo(-0.6, 0.18); rj.lineTo(0.6, 0.18); rj.lineTo(0.6, 0.95); rj.lineTo(0.22, 0.95); rj.lineTo(0.22, 1.12);
  rj.lineTo(-0.22, 1.12); rj.lineTo(-0.22, 0.95); rj.lineTo(-0.6, 0.95); rj.lineTo(-0.6, 0.18);
  ethFront.holes.push(rj);
  const ethShell = new THREE.ExtrudeGeometry(ethFront, { depth: 2.1, bevelEnabled: false });
  ethShell.translate(0, 0, -2.1);
  const eth = add(ethShell, steel, 4.6, top, 1.75, Math.PI / 2);
  eth.rotation.y = Math.PI / 2;
  box(0.05, 1.0, 1.25, void_, 3.0, top + 0.6, 1.75);                      // back of the cavity
  for (let i = 0; i < 8; i++) box(0.5, 0.012, 0.035, gold, 3.6, top + 0.88, 1.75 - 0.42 + i * 0.12); // contacts
  const ethGreen = mat(0x113a1f, 0, 0.3, { emissive: new THREE.Color(0x30ff7a), emissiveIntensity: 0.4 });
  const ethAmber = mat(0x3a2a0a, 0, 0.3, { emissive: new THREE.Color(0xffb02e), emissiveIntensity: 0.4 });
  box(0.03, 0.13, 0.24, ethGreen, 4.61, top + 1.2, 2.33);
  box(0.03, 0.13, 0.24, ethAmber, 4.61, top + 1.2, 1.17);
  box(2.08, 0.006, 1.58, new THREE.MeshStandardMaterial({ map: stampTexture(true), metalness: 0.9, roughness: 0.36 }), 3.55, top + 1.353, 1.75);
  const ethAnchor = new THREE.Vector3(4.6, top + 1.2, 1.75);

  /* USB stacks: steel shells with seams, two openings each, coloured tongues */
  const stampTop = new THREE.MeshStandardMaterial({ map: stampTexture(false), metalness: 0.9, roughness: 0.36 });
  const usbStack = (z, tongueColor) => {
    rbox(1.75, 1.6, 1.45, 0.03, [steel, steel, stampTop, steel, steel, steel], 3.4, top + 0.8, z);
    box(1.76, 0.02, 1.46, steelDark, 3.4, top + 0.8, z);                   // seam between the two ports
    [0.42, 1.18].forEach((y) => {
      box(0.06, 0.52, 1.2, void_, 4.25, top + y, z);                          // opening
      box(0.07, 0.56, 0.04, steelDark, 4.26, top + y, z - 0.6);               // frame
      box(0.07, 0.56, 0.04, steelDark, 4.26, top + y, z + 0.6);
      box(0.03, 0.13, 0.95, mat(tongueColor, 0, 0.45), 4.29, top + y - 0.07, z); // tongue
      for (let i = 0; i < 4; i++) box(0.02, 0.012, 0.1, gold, 4.305, top + y - 0.003, z - 0.3 + i * 0.2);
    });
    // Little spring tabs on top
    [-0.4, 0.4].forEach((dz) => box(0.4, 0.02, 0.12, steelDark, 3.9, top + 1.61, z + dz));
  };
  usbStack(0.0, 0x2f6bff);
  usbStack(-1.75, 0x111114);

  /* Near edge: USB-C power, two micro HDMI, audio jack */
  const portShell = (w, h, len, r, x) => {
    const outer = roundedRectShape(w, h, r);
    outer.holes.push(roundedRectPath(w - 0.12, h - 0.12, Math.max(0.01, r - 0.05)));
    const g = new THREE.ExtrudeGeometry(outer, { depth: len, bevelEnabled: false, curveSegments: 8 });
    g.translate(0, h / 2, -len);
    add(g, steel, x, top, 2.9);
    box(w - 0.13, h - 0.13, 0.04, void_, x, top + h / 2, 2.9 - len + 0.05);
    box(w * 0.55, 0.05, len * 0.7, blackPlastic, x, top + h / 2, 2.9 - len * 0.45);
  };
  portShell(0.9, 0.32, 0.75, 0.15, -3.2);
  portShell(0.66, 0.3, 0.75, 0.06, -1.85);
  portShell(0.66, 0.3, 0.75, 0.06, -0.55);
  const power = new THREE.Vector3(-3.2, top + 0.32, 2.6);

  const jackBody = rbox(0.65, 0.6, 1.2, 0.05, blackPlastic, 0.95, top + 0.3, 2.0);
  const barrel = add(new THREE.CylinderGeometry(0.3, 0.3, 0.35, 32), blackPlastic, 0.95, top + 0.3, 2.72);
  barrel.rotation.x = Math.PI / 2;
  const ring = add(new THREE.TorusGeometry(0.17, 0.03, 12, 32), steel, 0.95, top + 0.3, 2.9);
  const hole = add(new THREE.CircleGeometry(0.15, 24), void_, 0.95, top + 0.3, 2.895);
  void jackBody; void ring; void hole;

  /* Display and camera ribbon connectors: white housing, dark latch, contacts */
  const ribbon = (len, alongX, x, z) => {
    const w = alongX ? len : 0.25, d = alongX ? 0.25 : len;
    box(w, 0.26, d, mat(0xeae6dc, 0, 0.55), x, top + 0.13, z);
    box(alongX ? len * 0.95 : 0.12, 0.08, alongX ? 0.12 : len * 0.95, mat(0x2a2522, 0, 0.5), x + (alongX ? 0 : 0.07), top + 0.3, z + (alongX ? 0.07 : 0));
    const n = Math.floor(len / 0.1);
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + 0.05 + i * 0.1;
      box(alongX ? 0.03 : 0.12, 0.01, alongX ? 0.12 : 0.03, gold, x + (alongX ? o : -0.2), top + 0.005, z + (alongX ? -0.2 : o));
    }
  };
  ribbon(2.2, false, -3.85, 0.3);
  ribbon(2.2, true, 0.75, 1.45);

  /* Status LEDs */
  const power_led = mat(0x2a0505, 0, 0.3, { emissive: new THREE.Color(0xff2a1a), emissiveIntensity: 2.5 });
  const act_led = mat(0x062a10, 0, 0.3, { emissive: new THREE.Color(0x3dff7a), emissiveIntensity: 0.3 });
  rbox(0.16, 0.06, 0.1, 0.02, power_led, -4.0, top + 0.03, -1.85);
  rbox(0.16, 0.06, 0.1, 0.02, act_led, -4.0, top + 0.03, -1.6);

  /* microSD card under the left edge, with its contacts showing */
  rbox(1.15, 0.06, 1.25, 0.04, steelDark, -3.75, -top - 0.03, 0.0);
  const card = rbox(1.1, 0.06, 1.1, 0.05, mat(0x15161a, 0.2, 0.5), -4.35, -top - 0.09, 0.0);
  void card;
  for (let i = 0; i < 8; i++) box(0.22, 0.005, 0.07, gold, -4.6, -top - 0.125, -0.42 + i * 0.12);
  const sd = new THREE.Vector3(-4.6, -top, 0.0);

  /* Surface-mount parts: bodies with metal end caps. Decoupling capacitors
     cluster around the SoC and RAM, the rest scatter across free board. */
  const keepOut = [
    [-2.15, -0.35, -1.15, 0.65], [-0.2, 0.9, -1.1, 0.6], [2.2, 4.6, -2.8, 2.8],
    [-3.6, 2.2, -2.8, -2.1], [-4.1, 1.4, 1.95, 2.9], [-4.1, -3.6, -0.9, 1.5],
    [-0.4, 1.95, 1.25, 1.65], [-3.6, -2.3, -2.1, -1.0], [1.2, 1.9, 0.4, 1.1], [1.85, 2.45, 1.4, 2.0],
    [-3.2, -2.6, 0.85, 1.45], [-2.75, -1.95, 1.8, 2.2], [-1.2, -0.8, 0.95, 1.35], [-0.5, -0.1, 0.72, 0.98]
  ];
  const free = (x, z) => !keepOut.some(([x0, x1, z0, z1]) => x > x0 - 0.04 && x < x1 + 0.04 && z > z0 - 0.04 && z < z1 + 0.04);
  const MAX = 520;
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), mat(0xffffff, 0.1, 0.55), MAX);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.042, 0.052), mat(0xd6d0c2, 0.9, 0.3), MAX * 2);
  const c = new THREE.Color();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const place = (x, z, turn, s) => {
    if (n >= MAX || !free(x, z)) return;
    q.setFromAxisAngle(up, turn ? Math.PI / 2 : 0);
    const scale = new THREE.Vector3(s, 1, s);
    m4.compose(new THREE.Vector3(x, top + 0.02, z), q, scale);
    bodies.setMatrixAt(n, m4);
    const tone = rnd();
    bodies.setColorAt(n, c.set(tone < 0.55 ? 0x8a7454 : tone < 0.85 ? 0x1b1a18 : 0x3a3a36));
    const off = 0.042 * s;
    [-1, 1].forEach((side, k) => {
      const ox = turn ? 0 : side * off, oz = turn ? side * off : 0;
      m4.compose(new THREE.Vector3(x + ox, top + 0.021, z + oz), q, scale);
      caps.setMatrixAt(n * 2 + k, m4);
    });
    n++;
  };
  // Rows of decoupling caps around the SoC and RAM
  for (let i = 0; i < 12; i++) {
    place(-1.95 + i * 0.12, -1.18, true, 0.9);
    place(-1.95 + i * 0.12, 0.7, true, 0.9);
    place(-2.2, -0.9 + i * 0.12, false, 0.9);
  }
  for (let i = 0; i < 10; i++) place(0.95, -0.85 + i * 0.13, false, 0.9);
  // Everything else
  for (let k = 0; k < 4000 && n < MAX; k++) {
    place((rnd() - 0.5) * (W - 0.7), (rnd() - 0.5) * (D - 0.7), rnd() < 0.5, 0.8 + rnd() * 1.1);
  }
  bodies.count = n;
  caps.count = n * 2;
  group.add(bodies, caps);

  const packetPath = [
    new THREE.Vector3(4.2, top + 0.05, 1.75),
    new THREE.Vector3(2.15, top + 0.05, 1.75),
    new THREE.Vector3(1.55, top + 0.05, 0.75),
    new THREE.Vector3(1.0, top + 0.05, 0.75),
    new THREE.Vector3(0.35, top + 0.05, 0.6),
    new THREE.Vector3(-1.25, top + 0.14, -0.25)
  ];

  return {
    group, socMat, traceMat,
    leds: { power: power_led, act: act_led, ethGreen, ethAmber },
    anchors: { soc, ram, eth: ethAnchor, power, sd, packetPath }
  };
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function roundedRectPath(w, h, r) {
  const p = new THREE.Path();
  const x = -w / 2, y = -h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

/* A box with softly rounded vertical edges, centred like BoxGeometry. Material
   groups follow BoxGeometry order closely enough for a top-only texture:
   index 2 is the top cap. */
function roundedBox(w, h, d, r) {
  const shape = roundedRectShape(w, d, Math.min(r, w / 2 - 0.001, d / 2 - 0.001));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2, 0);
  // Remap groups: ExtrudeGeometry gives [caps, sides]; split caps into top/bottom
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const capGroup = g.groups[0], sideGroup = g.groups[1];
  const capIdx = g.index ? null : null; void capIdx;
  // Non-indexed: caps are the first `capGroup.count` vertices; top ones have y > 0
  const topVerts = [], bottomVerts = [];
  for (let i = capGroup.start; i < capGroup.start + capGroup.count; i += 3) {
    (pos.getY(i) > 0 ? topVerts : bottomVerts).push(i);
  }
  // Planar UVs on the caps so textures map across the face
  for (let i = capGroup.start; i < capGroup.start + capGroup.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getZ(i) + d / 2) / d);
  }
  // Reorder cap triangles so top ones are contiguous
  const order = topVerts.concat(bottomVerts);
  const tmpPos = [], tmpUv = [], tmpNorm = [];
  const norm = g.attributes.normal;
  order.forEach((i) => {
    for (let k = 0; k < 3; k++) {
      tmpPos.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      tmpUv.push(uv.getX(i + k), uv.getY(i + k));
      tmpNorm.push(norm.getX(i + k), norm.getY(i + k), norm.getZ(i + k));
    }
  });
  for (let j = 0; j < order.length * 3; j++) {
    pos.setXYZ(capGroup.start + j, tmpPos[j * 3], tmpPos[j * 3 + 1], tmpPos[j * 3 + 2]);
    uv.setXY(capGroup.start + j, tmpUv[j * 2], tmpUv[j * 2 + 1]);
    norm.setXYZ(capGroup.start + j, tmpNorm[j * 3], tmpNorm[j * 3 + 1], tmpNorm[j * 3 + 2]);
  }
  const topCount = topVerts.length * 3;
  g.clearGroups();
  g.addGroup(sideGroup.start, sideGroup.count, 0);              // sides
  g.addGroup(capGroup.start + topCount, capGroup.count - topCount, 3); // bottom
  g.addGroup(capGroup.start, topCount, 2);                       // top
  return g;
}

function roundedBoard(w, d, t, r) {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), { depth: t, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -t / 2, 0);
  // Map the top face UVs onto the board so the trace texture lines up
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getZ(i) + d / 2) / d);
  }
  return geo;
}

/* Laser-etched part markings for chip tops */
function markingTexture(lines, bg, fg, finish) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  if (finish === 'metal') {
    // Brushed look
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.lineTo(256, y + Math.random() * 4 - 2); g.stroke();
    }
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  const size = lines.length > 3 ? 26 : 30;
  lines.forEach((l, i) => {
    g.font = `${i === 0 ? 700 : 500} ${i === 0 ? size + 4 : size}px "JetBrains Mono", monospace`;
    g.fillText(l, 128, 128 - ((lines.length - 1) * (size + 8)) / 2 + i * (size + 8) + size / 3);
  });
  g.beginPath(); g.arc(30, 30, 9, 0, Math.PI * 2); g.fill(); // pin 1 dot
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* Pressed-steel tops for the USB and Ethernet shells: brushed grain, a
   formed rim, ventilation slots and spring tabs */
function stampTexture(ethernet) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 220;
  const g = c.getContext('2d');
  g.fillStyle = '#b7bac0';
  g.fillRect(0, 0, 256, 220);
  for (let i = 0; i < 320; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,42,46'},${Math.random() * 0.06})`;
    g.beginPath(); const x = Math.random() * 256; g.moveTo(x, 0); g.lineTo(x + Math.random() * 3 - 1.5, 220); g.stroke();
  }
  g.strokeStyle = 'rgba(60,62,66,0.55)';
  g.lineWidth = 3;
  g.strokeRect(8, 8, 240, 204);
  g.fillStyle = 'rgba(25,26,29,0.75)';
  const slot = (x, y, w, h) => { g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill(); };
  if (ethernet) {
    for (let i = 0; i < 5; i++) slot(40 + i * 38, 60, 12, 100);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
    g.strokeRect(24, 30, 208, 160);
  } else {
    slot(36, 52, 70, 12); slot(150, 52, 70, 12);
    slot(36, 156, 70, 12); slot(150, 156, 70, 12);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(118, 20, 20, 180);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* Wireless shield can: stamped steel with a raised rim and a logo */
function shieldTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 212;
  const g = c.getContext('2d');
  g.fillStyle = '#9da1a7';
  g.fillRect(0, 0, 256, 212);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 236, 192);
  g.fillStyle = 'rgba(40,42,46,0.55)';
  for (let x = 30; x < 240; x += 22) for (let y = 30; y < 196; y += 22) {
    if (Math.hypot(x - 128, y - 106) < 46) continue;
    g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
  }
  // A simple stamped raspberry: leaves and berry
  g.fillStyle = 'rgba(30,32,36,0.6)';
  g.beginPath(); g.ellipse(112, 76, 16, 8, -0.6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(144, 76, 16, 8, 0.6, 0, Math.PI * 2); g.fill();
  [[128, 100], [114, 112], [142, 112], [128, 124], [114, 136], [142, 136], [128, 146]].forEach(([x, y]) => {
    g.beginPath(); g.arc(x, y, 8.5, 0, Math.PI * 2); g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* The board's surface: solder mask, copper traces, vias, pads, the antenna
   and silkscreen. Also returns an emissive map (traces only) and a bump map. */
function pcbTextures(size) {
  const W = size, H = Math.round(size * 5.6 / 8.5);
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const base = make(), glow = make(), bump = make();
  const b = base.getContext('2d'), g = glow.getContext('2d'), u = bump.getContext('2d');
  const mm = W / 85; // px per mm
  // Board coordinates (units of 10mm, origin at centre) to texture pixels
  const px = (x) => (x + 4.25) * 10 * mm;
  const pz = (z) => (z + 2.8) * 10 * mm;

  const grad = b.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#08190f');
  grad.addColorStop(1, '#04100a');
  b.fillStyle = grad;
  b.fillRect(0, 0, W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  u.fillStyle = '#000'; u.fillRect(0, 0, W, H);

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Copper pour hatching in the background, barely visible through the mask
  b.strokeStyle = 'rgba(30, 80, 50, 0.18)';
  b.lineWidth = 1;
  for (let x = -H; x < W; x += 9) { b.beginPath(); b.moveTo(x, 0); b.lineTo(x + H, H); b.stroke(); }

  // Traces: orthogonal runs with 45 degree bends, in bundles
  for (let k = 0; k < 170; k++) {
    let x = rnd() * W, y = rnd() * H;
    const lanes = 1 + Math.floor(rnd() * 6);
    const width = (0.2 + rnd() * 0.3) * mm;
    const steps = 2 + Math.floor(rnd() * 4);
    const pts = [[x, y]];
    let dir = Math.floor(rnd() * 4);
    for (let s = 0; s < steps; s++) {
      const len = (4 + rnd() * 18) * mm;
      const diag = rnd() < 0.35;
      const dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
      if (diag) { x += (dx || (rnd() < 0.5 ? 1 : -1)) * len * 0.5; y += (dy || (rnd() < 0.5 ? 1 : -1)) * len * 0.5; }
      else { x += dx * len; y += dy * len; }
      pts.push([x, y]);
      dir = (dir + (rnd() < 0.5 ? 1 : 3)) % 4;
    }
    for (let l = 0; l < lanes; l++) {
      const o = l * width * 2.4;
      [b, g, u].forEach((ctx, i) => {
        ctx.beginPath();
        pts.forEach(([qx, qy], j) => (j ? ctx.lineTo(qx + o, qy + o) : ctx.moveTo(qx + o, qy + o)));
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = ['rgba(30, 92, 58, 0.85)', 'rgba(255, 170, 90, 0.5)', 'rgba(255,255,255,0.6)'][i];
        ctx.stroke();
      });
    }
  }

  // Vias
  for (let k = 0; k < 360; k++) {
    const x = rnd() * W, y = rnd() * H, r = (0.25 + rnd() * 0.25) * mm;
    b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fillStyle = '#5c5a44'; b.fill();
    b.beginPath(); b.arc(x, y, r * 0.45, 0, Math.PI * 2); b.fillStyle = '#04100a'; b.fill();
  }

  // Exposed gold test pads near the edges
  b.fillStyle = '#c9a256';
  for (let k = 0; k < 26; k++) {
    const x = px(-3.9 + rnd() * 5.5), y = pz(rnd() < 0.5 ? 1.55 + rnd() * 0.3 : -1.95 + rnd() * 0.25);
    b.beginPath(); b.arc(x, y, 0.55 * mm, 0, Math.PI * 2); b.fill();
  }

  // PCB antenna for the wireless module: a meander of exposed copper
  b.strokeStyle = '#c9a256';
  b.lineWidth = 0.55 * mm;
  b.beginPath();
  let ax = px(-4.0), ay = pz(-2.6);
  b.moveTo(ax, ay);
  for (let i = 0; i < 6; i++) {
    ay += 0.9 * mm * 10 * 0.06; b.lineTo(ax, ay);
    ax += (i % 2 ? -1 : 1) * 0.55 * mm * 10 * 0.12; b.lineTo(ax, ay);
  }
  b.stroke();

  // Pads under the big parts so they read as soldered
  b.fillStyle = 'rgba(201, 162, 86, 0.9)';
  const padRow = (x0, z0, count, dx, dz, w, h) => {
    for (let i = 0; i < count; i++) b.fillRect(px(x0 + i * dx) - w / 2, pz(z0 + i * dz) - h / 2, w, h);
  };
  padRow(-2.0, -1.0, 12, 0, 0.13, 0.5 * mm, 0.25 * mm);   // SoC left side
  padRow(-0.5, -1.0, 12, 0, 0.13, 0.5 * mm, 0.25 * mm);   // SoC right side

  // Silkscreen: outlines, reference designators and the board name
  b.strokeStyle = 'rgba(232, 232, 222, 0.65)';
  b.fillStyle = 'rgba(232, 232, 222, 0.8)';
  b.lineWidth = 0.2 * mm;
  const outline = (x, z, w, d) => b.strokeRect(px(x - w / 2), pz(z - d / 2), w * 10 * mm, d * 10 * mm);
  outline(-1.25, -0.25, 1.75, 1.75);     // SoC
  outline(0.35, -0.25, 1.15, 1.6);       // RAM
  outline(-2.95, -1.55, 1.3, 1.1);       // wireless
  outline(-0.67, -2.5, 5.3, 0.7);        // GPIO
  const label = (text, x, z, size = 1.3, align = 'left') => {
    b.font = `600 ${size * mm}px "JetBrains Mono", monospace`;
    b.textAlign = align;
    b.fillText(text, px(x), pz(z));
  };
  label('J8', -3.45, -2.05);
  label('GPIO', -3.1, -2.05);
  label('PoE', 2.0, -1.95);
  label('U1', -2.15, -1.12);
  label('U2', -0.2, -1.12);
  label('USB 3', 2.25, 0.5);
  label('USB 2', 2.25, -1.3);
  label('CAMERA', 0.2, 1.25);
  label('DISPLAY', -3.6, 1.5, 1.2);
  label('POWER IN', -3.6, 1.85, 1.1);
  label('HDMI0', -2.15, 2.2, 1.1);
  label('HDMI1', -0.85, 2.2, 1.1);
  label('A/V', 0.75, 1.55, 1.1);
  b.font = `700 ${2.1 * mm}px Archivo, Arial, sans-serif`;
  b.textAlign = 'left';
  b.fillText('Raspberry Pi 4 Model B', px(-2.05), pz(1.0));
  b.font = `500 ${1.25 * mm}px "JetBrains Mono", monospace`;
  b.fillText('wynandcv.com · serving you this page', px(-2.05), pz(1.22));

  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(glow);
  const bumpTex = new THREE.CanvasTexture(bump);
  return { map, emissive, bump: bumpTex };
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* A small studio for reflections on the metal parts */
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0b0c0f);
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.BackSide }));
  env.add(room);
  const panel = (color, w, h, x, y, z, ry, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; m.rotation.x = rx;
    env.add(m);
  };
  panel(0xffffff, 8, 3, 0, 9.5, 0, 0, Math.PI / 2);
  panel(0xffd9b0, 4, 6, -9.5, 2, 0, Math.PI / 2);
  panel(0x8fa8ff, 3, 6, 9.5, 1, -2, -Math.PI / 2);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.04).texture;
  pm.dispose();
  return tex;
}
