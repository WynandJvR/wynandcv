const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');

const app = express();
const REMOTE_HOST = process.env.DEMO_REMOTE_HOST || '127.0.0.1'; // demo host, set in the systemd unit
const docker = new Docker({ host: '127.0.0.1', port: 2375 }); // SSH tunnel to the demo host's docker.sock
const PORT = process.env.PORT || 3001;
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const CONTAINER_NAME = 'demo-session';
const VNC_PORT = 6080;
const ALLOWED_ORIGINS = [
  'https://wynandcv.com',
  'http://wynandcv.com',
  'http://localhost:3000',
];

// Trust reverse proxy (nginx/cloudflare) for correct req.ip
app.set('trust proxy', true);

// Project image map: add new projects here
const PROJECT_IMAGES = {
  expensetracker: {
    image: 'demo-expensetracker',
    label: 'Expense Tracker',
  },
};

// Session state
let activeSession = null;
let sessionTimer = null;

// Rate limiting (1 start request per 10s per IP)
const rateLimitMap = new Map();

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// --- VNC Proxy (must be registered before other routes) ---
const vncProxy = createProxyMiddleware({
  target: `http://${REMOTE_HOST}:${VNC_PORT}`,
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/demo/vnc': '' },
  on: {
    error: (err, req, res) => {
      console.error('VNC proxy error:', err.message);
      if (res.writeHead) {
        res.writeHead(502).end('VNC connection failed');
      }
    },
  },
});

// Proxies /demo/vnc/* to the running container's noVNC on port 6080
app.use(
  '/demo/vnc',
  (req, res, next) => {
    if (!activeSession) {
      return res.status(404).json({ error: 'no_session' });
    }
    next();
  },
  vncProxy
);

// --- API Routes ---

// Get current demo status
app.get('/demo/status', async (req, res) => {
  if (!activeSession) {
    return res.json({ active: false, hostOnline: await hostOnline() });
  }
  const elapsed = Date.now() - activeSession.startTime;
  const remaining = Math.max(0, Math.ceil((SESSION_TIMEOUT - elapsed) / 1000));
  res.json({
    active: true,
    hostOnline: true,
    project: activeSession.project,
    remainingSeconds: remaining,
  });
});

// Whether the demo host's Docker API answers through the tunnel. Cached briefly
// so a page full of visitors does not hammer the tunnel.
let hostCheck = { at: 0, ok: false };
async function hostOnline() {
  if (Date.now() - hostCheck.at < 15000) return hostCheck.ok;
  const ok = await Promise.race([
    docker.ping().then(() => true, () => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 2500)),
  ]);
  hostCheck = { at: Date.now(), ok };
  return ok;
}

// Start a demo session
app.post('/demo/start', async (req, res) => {
  const { project } = req.body;

  // Validate project
  if (!project || !PROJECT_IMAGES[project]) {
    return res.status(400).json({ error: 'invalid_project', message: 'Unknown project ID' });
  }

  // Rate limit
  const ip = req.ip;
  const now = Date.now();
  if (rateLimitMap.has(ip) && now - rateLimitMap.get(ip) < 10000) {
    return res.status(429).json({ error: 'rate_limited', message: 'Please wait before trying again' });
  }
  rateLimitMap.set(ip, now);

  // Check if session is active
  if (activeSession) {
    const elapsed = Date.now() - activeSession.startTime;
    const remaining = Math.max(0, Math.ceil((SESSION_TIMEOUT - elapsed) / 1000));
    return res.status(409).json({ error: 'busy', remainingSeconds: remaining });
  }

  if (!(await hostOnline())) {
    return res.status(503).json({ error: 'offline', message: 'The demo machine is offline right now. Please try again later.' });
  }

  const config = PROJECT_IMAGES[project];

  try {
    console.log(`Starting demo for ${project}...`);

    // Start container
    const container = await docker.createContainer({
      Image: config.image,
      name: CONTAINER_NAME,
      HostConfig: {
        PortBindings: { [`${VNC_PORT}/tcp`]: [{ HostPort: String(VNC_PORT) }] },
        Memory: 2048 * 1024 * 1024, // 2GB
        NanoCpus: 4000000000, // 4 CPUs, JavaFX renders in software so it needs headroom
        PidsLimit: 200,
        AutoRemove: true,
      },
      ExposedPorts: { [`${VNC_PORT}/tcp`]: {} },
    });

    await container.start();

    // Wait for noVNC to become ready (poll up to 30s)
    const ready = await waitForReady(`http://${REMOTE_HOST}:${VNC_PORT}`, 30000);
    if (!ready) {
      console.error('Container started but noVNC not ready, cleaning up');
      await stopContainer();
      return res.status(500).json({ error: 'failed', message: 'Demo failed to start' });
    }

    // Store session
    const sessionId = `${project}-${Date.now()}`;
    activeSession = {
      id: sessionId,
      project,
      containerId: container.id,
      startTime: Date.now(),
    };

    // Auto-timeout
    sessionTimer = setTimeout(() => {
      console.log(`Session ${sessionId} timed out`);
      stopSession();
    }, SESSION_TIMEOUT);

    console.log(`Demo started: ${sessionId}`);
    res.json({
      sessionId,
      vncPath: '/demo/vnc/vnc_embed.html?path=demo/vnc/websockify',
      timeoutSeconds: SESSION_TIMEOUT / 1000,
    });
  } catch (err) {
    console.error('Failed to start demo:', err.message);
    await stopContainer();
    res.status(500).json({ error: 'failed', message: err.message });
  }
});

// Stop a demo session
app.post('/demo/stop', async (req, res) => {
  if (!activeSession) {
    return res.status(404).json({ error: 'no_session' });
  }

  // Validate session ID to prevent other visitors killing the session
  const { sessionId } = req.body;
  if (!sessionId || sessionId !== activeSession.id) {
    return res.status(403).json({ error: 'forbidden', message: 'Session ID mismatch' });
  }

  await stopSession();
  res.json({ success: true });
});

// --- Helpers ---

async function stopSession() {
  if (sessionTimer) {
    clearTimeout(sessionTimer);
    sessionTimer = null;
  }
  await stopContainer();
  activeSession = null;
  console.log('Session stopped');
}

async function stopContainer() {
  try {
    const container = docker.getContainer(CONTAINER_NAME);
    await container.stop({ t: 5 }).catch(() => {});
    // AutoRemove handles cleanup, but force remove if needed
    await container.remove({ force: true }).catch(() => {});
  } catch (err) {
    // Container may already be gone
  }
}

async function waitForReady(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

// Clean up orphaned containers on startup
async function cleanupOrphans() {
  try {
    const container = docker.getContainer(CONTAINER_NAME);
    const info = await container.inspect();
    if (info.State.Running) {
      console.log('Cleaning up orphaned demo container');
      await container.stop({ t: 5 }).catch(() => {});
      await container.remove({ force: true }).catch(() => {});
    }
  } catch {
    // No orphan found
  }
}

// Clean up stale rate limit entries every 60s
setInterval(() => {
  const cutoff = Date.now() - 10000;
  for (const [ip, time] of rateLimitMap) {
    if (time < cutoff) rateLimitMap.delete(ip);
  }
}, 60000);

// --- Start Server ---
cleanupOrphans().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Demo manager running on port ${PORT}`);
  });

  // Handle WebSocket upgrade for VNC proxy
  server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/demo/vnc')) {
      vncProxy.upgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (activeSession) await stopSession();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (activeSession) await stopSession();
  process.exit(0);
});
