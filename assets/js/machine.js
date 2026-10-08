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

if (stage && canvas && webglAvailable()) init();
else if (stage) stage.classList.add('is-static');

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 13, 17.5);
  camera.lookAt(0, 0, 0);

  scene.environment = buildEnvironment(renderer);

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
  const board = buildBoard();
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

  /* State fed by telemetry */
  const live = { temp: 45, cpu: 5, ram: 20, disk: 50, uptime: 0, ok: false };
  let ledFlash = 0;

  document.addEventListener('pi:stats', (e) => {
    const s = e.detail;
    if (s.cpu_temp_c != null) live.temp = Number(s.cpu_temp_c);
    live.cpu = Number(s.cpu_usage) || 0;
    live.ram = Number(s.ram_used_pct) || 0;
    live.disk = Number(s.disk_root_used_pct) || 0;
    live.uptime = Number(s.uptime_seconds) || 0;
    live.ok = true;
    ledFlash = 1;
    packetT = 0;
  });

  /* Interaction: pointer parallax plus drag to spin */
  const pointer = { x: 0, y: 0 };
  let drag = null;
  let spin = 0;          // extra yaw from dragging
  let spinVel = 0;
  let tilt = 0;

  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      spinVel = dx * 0.008;
      spin += dx * 0.008;
      tilt = Math.max(-0.5, Math.min(0.6, tilt + dy * 0.004));
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  });
  const endDrag = () => { drag = null; stage.classList.remove('is-dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', () => { pointer.x = 0; pointer.y = 0; });

  /* Callouts: HTML labels pinned to points on the model */
  const callouts = Array.from(document.querySelectorAll('[data-anchor]')).map((el) => ({
    el,
    anchor: board.anchors[el.dataset.anchor],
    side: el.dataset.side || 'right',
    lift: Number(el.dataset.lift || 0)
  })).filter((c) => c.anchor);
  const lines = document.getElementById('machine-lines');

  /* Sizing */
  let width = 0, height = 0, compact = false;
  function resize() {
    const r = stage.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    compact = width < 760;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the whole board in frame on narrow screens
    camera.fov = 28;
    // Shrink the board so its full width fits on narrow screens
    const fit = Math.min(1, camera.aspect / 0.95);
    pi.scale.setScalar(compact ? Math.max(0.42, fit) : 1);
    camera.updateProjectionMatrix();
    if (lines) lines.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  window.addEventListener('resize', resize);
  resize();

  /* Run only while visible */
  let visible = true;
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0 }).observe(stage);

  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let elapsed = 0;
  stage.classList.add('is-ready');

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const motion = reduceMotion ? 0 : 1;

    /* Scroll: as the hero leaves, the board tips back and sinks */
    const sr = stage.getBoundingClientRect();
    const scrollP = Math.max(0, Math.min(1, -sr.top / Math.max(1, sr.height)));

    if (!drag) { spin += spinVel; spinVel *= 0.94; spin *= 0.985; tilt *= 0.96; }

    const baseYaw = compact ? -0.35 : -0.55;
    pi.rotation.y = baseYaw + spin + motion * (Math.sin(elapsed * 0.25) * 0.12 + pointer.x * 0.25);
    pi.rotation.x = tilt + motion * pointer.y * 0.1 + scrollP * 0.55;
    pi.position.y = (compact ? 1.6 : 1.0) + motion * Math.sin(elapsed * 0.8) * 0.08 - scrollP * 1.5;
    pi.position.x = compact ? 0 : 2.2;
    pi.position.z = compact ? -2 : -1.2;

    /* Heat from real temperature: 40C is cool, 75C is hot */
    const heat = Math.max(0, Math.min(1, (live.temp - 38) / 37));
    const load = Math.max(0, Math.min(1, live.cpu / 100));
    const hot = new THREE.Color().lerpColors(new THREE.Color(0xffa040), new THREE.Color(0xff3b1f), heat);
    glow.material.color.copy(hot);
    glow.material.opacity = (0.35 + heat * 0.5 + load * 0.3) * (0.92 + Math.sin(elapsed * 2.2) * 0.08);
    const gs = 2.6 + heat * 1.6;
    glow.scale.set(gs, gs, 1);
    heatLight.color.copy(hot);
    heatLight.intensity = 1.2 + heat * 3.5 + load * 2.5;
    board.socMat.emissive.copy(hot);
    board.socMat.emissiveIntensity = 0.05 + heat * 0.25;

    /* Heat particles */
    const rate = 0.25 + load * 1.6 + heat * 0.4;
    for (let i = 0; i < HEAT_COUNT; i++) {
      heatLife[i] += dt * rate * (0.6 + (i % 7) * 0.08) * motion;
      if (heatLife[i] >= 1) resetParticle(i, 0);
      heatPos[i * 3 + 1] = board.anchors.soc.y + 0.15 + heatLife[i] * 2.4;
      heatPos[i * 3] += Math.sin(elapsed * 1.7 + i) * 0.002;
    }
    heatGeo.attributes.position.needsUpdate = true;
    heatPts.material.opacity = 0.25 + heat * 0.4;
    heatPts.material.color.copy(hot);

    /* LEDs: power always on, activity and Ethernet flash on each request */
    ledFlash = Math.max(0, ledFlash - dt * 1.8);
    const blink = ledFlash > 0 ? (Math.sin(elapsed * 40) > 0 ? 1 : 0.15) : 0.1;
    board.leds.act.emissiveIntensity = 0.3 + blink * 4;
    board.leds.ethGreen.emissiveIntensity = 0.4 + blink * 4;
    board.leds.ethAmber.emissiveIntensity = live.ok ? 1.6 : 0.2;
    board.leds.power.emissiveIntensity = 2.5;
    board.traceMat.emissiveIntensity = 0.04 + ledFlash * 0.35;

    /* Packet travel */
    if (packetT >= 0) {
      packetT += dt * 0.9;
      if (packetT >= 1) { packetT = -1; packet.material.opacity = 0; }
      else {
        packetPath.getPointAt(packetT, tmp);
        packet.position.copy(tmp);
        packet.material.opacity = Math.sin(packetT * Math.PI) * 0.95;
      }
    }

    renderer.render(scene, camera);
    placeCallouts(scrollP);
  }
  requestAnimationFrame(frame);

  function placeCallouts(scrollP) {
    if (!callouts.length) return;
    let path = '';
    const fade = 1 - Math.min(1, scrollP * 2.2);
    pi.localToWorld(tmp.set(0, 0, 0));
    tmp.project(camera);
    const cx = (tmp.x * 0.5 + 0.5) * width;
    const cy = (-tmp.y * 0.5 + 0.5) * height;
    callouts.forEach((c) => {
      pi.localToWorld(tmp.copy(c.anchor));
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * width;
      const y = (-tmp.y * 0.5 + 0.5) * height;
      // Push each label outward from the board so it never sits on top of it
      let dx = x - cx, dy = y - cy;
      if (c.el.dataset.dir === 'left') { dx = -1; dy = -0.12; }
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const reach = (compact ? 70 : 150) + c.lift;
      const rawX = x + dx * reach;
      const ly = y + dy * reach * 0.75;
      const left = dx < 0;
      const lx = left ? Math.max(compact ? 84 : 140, rawX) : Math.min(width - (compact ? 96 : 150), rawX);
      c.el.style.transform = `translate(${lx.toFixed(1)}px, ${(ly - 22).toFixed(1)}px)`;
      c.el.style.opacity = String(fade);
      c.el.classList.toggle('is-left', left);
      path += `M${x.toFixed(1)},${y.toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)} `;
      path += `M${(x - 2.5).toFixed(1)},${y.toFixed(1)} a2.5,2.5 0 1,0 5,0 a2.5,2.5 0 1,0 -5,0 `;
    });
    if (lines) {
      lines.firstElementChild.setAttribute('d', path);
      lines.style.opacity = String(fade);
    }
  }
}

/* ------------------------------------------------------------- Geometry */
/* Units: 1 = 10mm. Board is 85 x 56mm. x runs along the long edge, z towards
   the viewer. Ports are on the right edge, the GPIO header on the far edge. */
function buildBoard() {
  const group = new THREE.Group();
  const W = 8.5, D = 5.6, T = 0.14;
  const top = T / 2;

  const mat = (color, metal = 0, rough = 0.6, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
  const box = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  /* PCB with drawn traces */
  const pcb = pcbTextures();
  const traceMat = new THREE.MeshStandardMaterial({
    map: pcb.map, emissiveMap: pcb.emissive, emissive: new THREE.Color(0xffc27a),
    emissiveIntensity: 0.04, metalness: 0.15, roughness: 0.6
  });
  const edgeMat = mat(0x0c1a12, 0, 0.8);
  const pcbMesh = new THREE.Mesh(
    roundedBoard(W, D, T, 0.3),
    [traceMat, edgeMat]
  );
  group.add(pcbMesh);

  /* Mounting holes */
  const ringMat = mat(0xd9b46a, 0.9, 0.3);
  [[-W / 2 + 0.35, -D / 2 + 0.35], [-W / 2 + 0.35, D / 2 - 0.35], [W / 2 - 2.35, -D / 2 + 0.35], [W / 2 - 2.35, D / 2 - 0.35]]
    .forEach(([x, z]) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.27, 24), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, top + 0.002, z);
      group.add(ring);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), mat(0x020202));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(x, top + 0.003, z);
      group.add(hole);
    });

  /* SoC with metal lid */
  const socMat = mat(0xb9bcc2, 0.95, 0.28, { emissive: new THREE.Color(0xff7a2f), emissiveIntensity: 0.1 });
  box(1.55, 0.06, 1.55, mat(0x1b1d20, 0.2, 0.6), -1.25, top + 0.03, -0.25);
  box(1.4, 0.07, 1.4, socMat, -1.25, top + 0.095, -0.25);
  const soc = new THREE.Vector3(-1.25, top + 0.13, -0.25);

  /* RAM */
  box(1.0, 0.11, 1.45, mat(0x111214, 0.1, 0.45), 0.35, top + 0.055, -0.25);
  const ram = new THREE.Vector3(0.35, top + 0.11, -0.25);

  /* USB controller and PMIC */
  box(0.6, 0.08, 0.6, mat(0x15171a, 0.1, 0.5), 1.55, top + 0.04, 0.75);
  box(0.45, 0.06, 0.45, mat(0x15171a, 0.1, 0.5), -2.9, top + 0.03, 1.2);

  /* GPIO header: 2 x 20 */
  const gx0 = -3.1, pitch = 0.254;
  box(20 * pitch, 0.25, 2 * pitch + 0.02, mat(0x0b0b0c, 0, 0.7), gx0 + 10 * pitch - pitch / 2, top + 0.125, -2.5);
  const pinGeo = new THREE.BoxGeometry(0.064, 0.6, 0.064);
  const pinMat = mat(0xe2b864, 1, 0.25);
  const pins = new THREE.InstancedMesh(pinGeo, pinMat, 40);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) for (let r = 0; r < 2; r++) {
    m4.makeTranslation(gx0 + i * pitch, top + 0.4, -2.5 - pitch / 2 + r * pitch);
    pins.setMatrixAt(i * 2 + r, m4);
  }
  group.add(pins);

  /* Ports on the right edge */
  const steel = mat(0xb8bbc0, 0.85, 0.38);
  const dark = mat(0x050506, 0, 0.9);
  // Ethernet
  box(2.1, 1.35, 1.6, steel, 3.55, top + 0.675, 1.75);
  box(0.05, 0.9, 1.2, dark, 4.61, top + 0.6, 1.75);
  const ethGreen = mat(0x113a1f, 0, 0.4, { emissive: new THREE.Color(0x30ff7a), emissiveIntensity: 0.4 });
  const ethAmber = mat(0x3a2a0a, 0, 0.4, { emissive: new THREE.Color(0xffb02e), emissiveIntensity: 0.4 });
  box(0.04, 0.14, 0.22, ethGreen, 4.62, top + 1.18, 2.3);
  box(0.04, 0.14, 0.22, ethAmber, 4.62, top + 1.18, 1.2);
  const eth = new THREE.Vector3(4.6, top + 1.2, 1.75);
  // USB stacks: USB 3 (blue tongues) and USB 2 (black)
  [[0.0, 0x2f6bff], [-1.75, 0x0d0d0f]].forEach(([z, tongue]) => {
    box(1.75, 1.6, 1.45, steel, 3.4, top + 0.8, z);
    [0.42, 1.12].forEach((y) => {
      box(0.04, 0.5, 1.15, dark, 4.29, top + y, z);
      box(0.05, 0.14, 0.95, mat(tongue, 0, 0.5), 4.3, top + y - 0.05, z);
    });
  });

  /* Near edge: USB-C power, two micro HDMI, audio */
  box(0.9, 0.32, 0.75, steel, -3.2, top + 0.16, 2.5);
  box(0.62, 0.12, 0.08, dark, -3.2, top + 0.16, 2.88);
  const power = new THREE.Vector3(-3.2, top + 0.32, 2.6);
  [-1.85, -0.55].forEach((x) => {
    box(0.65, 0.3, 0.75, steel, x, top + 0.15, 2.5);
    box(0.5, 0.12, 0.08, dark, x, top + 0.15, 2.88);
  });
  const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 24), mat(0x0c0c0d, 0.1, 0.5));
  jack.rotation.x = Math.PI / 2;
  jack.position.set(0.95, top + 0.3, 2.55);
  group.add(jack);
  box(0.65, 0.6, 1.2, mat(0x0c0c0d, 0.1, 0.5), 0.95, top + 0.3, 2.0);

  /* Display and camera ribbon connectors */
  box(0.25, 0.28, 2.2, mat(0xe8e4da, 0, 0.6), -3.85, top + 0.14, 0.3);
  box(0.24, 0.08, 2.0, mat(0x1a1a1a, 0, 0.6), -3.85, top + 0.3, 0.3);
  box(2.2, 0.28, 0.25, mat(0xe8e4da, 0, 0.6), 0.75, top + 0.14, 1.45);

  /* PoE header and LEDs */
  box(0.5, 0.2, 0.5, mat(0x0b0b0c), 2.2, top + 0.1, -2.35);
  const power_led = mat(0x2a0505, 0, 0.4, { emissive: new THREE.Color(0xff2a1a), emissiveIntensity: 2.5 });
  const act_led = mat(0x062a10, 0, 0.4, { emissive: new THREE.Color(0x3dff7a), emissiveIntensity: 0.3 });
  box(0.16, 0.06, 0.1, power_led, -4.0, top + 0.03, -1.85);
  box(0.16, 0.06, 0.1, act_led, -4.0, top + 0.03, -1.6);

  /* SD card under the left edge, sticking out */
  box(1.1, 0.08, 1.2, mat(0x1d1f22, 0.3, 0.5), -4.1, -top - 0.06, 0.0);
  const sd = new THREE.Vector3(-4.5, -top, 0.0);

  /* Small surface-mount parts */
  const keepOut = [
    [-2.1, -0.4, -1.1, 0.6], [-0.2, 0.9, -1.1, 0.6], [2.2, 4.6, -2.8, 2.8],
    [-3.5, 2.2, -2.8, -2.1], [-4.0, 1.4, 2.0, 2.9], [-4.1, -3.6, -0.9, 1.5], [-0.4, 1.9, 1.25, 1.65]
  ];
  const smdGeo = new THREE.BoxGeometry(0.1, 0.05, 0.05);
  const smd = new THREE.InstancedMesh(smdGeo, mat(0xffffff, 0.3, 0.5), 260);
  const smdColor = new THREE.Color();
  let n = 0, guard = 0;
  while (n < 260 && guard++ < 5000) {
    const x = (Math.random() - 0.5) * (W - 0.6);
    const z = (Math.random() - 0.5) * (D - 0.6);
    if (keepOut.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) continue;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() < 0.5 ? 0 : Math.PI / 2);
    const s = 0.7 + Math.random() * 0.9;
    m4.compose(new THREE.Vector3(x, top + 0.025, z), q, new THREE.Vector3(s, 1, s));
    smd.setMatrixAt(n, m4);
    smd.setColorAt(n, smdColor.set(Math.random() < 0.7 ? 0x1c1b19 : 0x8c8576));
    n++;
  }
  smd.count = n;
  group.add(smd);

  const packetPath = [
    new THREE.Vector3(4.2, top + 0.05, 1.75),
    new THREE.Vector3(2.2, top + 0.05, 1.75),
    new THREE.Vector3(1.55, top + 0.05, 0.75),
    new THREE.Vector3(1.0, top + 0.05, 0.75),
    new THREE.Vector3(0.35, top + 0.05, 0.6),
    new THREE.Vector3(-1.25, top + 0.14, -0.25)
  ];

  return {
    group, socMat, traceMat,
    leds: { power: power_led, act: act_led, ethGreen, ethAmber },
    anchors: { soc, ram, eth, power, sd, packetPath }
  };
}

function roundedBoard(w, d, t, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -t / 2, 0);
  // Map the top face UVs onto the board so the trace texture lines up
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getZ(i) + d / 2) / d);
  }
  return geo;
}

/* The board's surface: solder mask, copper traces, vias and silkscreen */
function pcbTextures() {
  const W = 2048, H = Math.round(2048 * 5.6 / 8.5);
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const base = make(), glow = make();
  const b = base.getContext('2d'), g = glow.getContext('2d');

  const grad = b.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#08190f');
  grad.addColorStop(1, '#04100a');
  b.fillStyle = grad;
  b.fillRect(0, 0, W, H);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const unit = W / 85; // px per mm

  // Traces: orthogonal runs with 45 degree bends, in bundles
  for (let k = 0; k < 140; k++) {
    let x = rnd() * W, y = rnd() * H;
    const lanes = 1 + Math.floor(rnd() * 5);
    const width = (0.25 + rnd() * 0.35) * unit;
    const steps = 2 + Math.floor(rnd() * 4);
    const pts = [[x, y]];
    let dir = Math.floor(rnd() * 4);
    for (let s = 0; s < steps; s++) {
      const len = (4 + rnd() * 18) * unit;
      const diag = rnd() < 0.35;
      const dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
      if (diag) { x += (dx || (rnd() < 0.5 ? 1 : -1)) * len * 0.5; y += (dy || (rnd() < 0.5 ? 1 : -1)) * len * 0.5; }
      else { x += dx * len; y += dy * len; }
      pts.push([x, y]);
      dir = (dir + (rnd() < 0.5 ? 1 : 3)) % 4;
    }
    for (let l = 0; l < lanes; l++) {
      const o = l * width * 2.4;
      [b, g].forEach((ctx, i) => {
        ctx.beginPath();
        pts.forEach(([px, py], j) => (j ? ctx.lineTo(px + o, py + o) : ctx.moveTo(px + o, py + o)));
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = i === 0 ? 'rgba(30, 92, 58, 0.8)' : 'rgba(255, 170, 90, 0.5)';
        ctx.stroke();
      });
      const [ex, ey] = pts[pts.length - 1];
      b.beginPath();
      b.arc(ex + o, ey + o, width * 1.4, 0, Math.PI * 2);
      b.fillStyle = '#4f5a3a';
      b.fill();
    }
  }

  // Vias
  for (let k = 0; k < 220; k++) {
    const x = rnd() * W, y = rnd() * H, r = (0.35 + rnd() * 0.3) * unit;
    b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fillStyle = '#5c5a44'; b.fill();
    b.beginPath(); b.arc(x, y, r * 0.45, 0, Math.PI * 2); b.fillStyle = '#06110b'; b.fill();
  }

  // Silkscreen, in the clear strip under the GPIO header
  b.fillStyle = 'rgba(235, 235, 225, 0.8)';
  b.font = `500 ${1.5 * unit}px "JetBrains Mono", monospace`;
  b.fillText('wynandcv.com  ·  serving you this page', 9 * unit, 8.6 * unit);
  b.strokeStyle = 'rgba(235, 235, 225, 0.6)';
  b.lineWidth = 0.22 * unit;
  b.strokeRect(21.5 * unit, 17 * unit, 17 * unit, 17 * unit); // SoC outline

  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(glow);
  return { map, emissive };
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
