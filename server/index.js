import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { listSessions, upsertSession, upsertMany } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const PORT = process.env.PORT || 3000;

// ---------- sync key ----------
// Set SYNC_KEY in the environment for a deployed instance. For local use we
// generate one on first run, persist it, and print it to the console.
function resolveSyncKey() {
  if (process.env.SYNC_KEY) return process.env.SYNC_KEY.trim();
  const keyFile = path.join(DATA_DIR, '.sync-key');
  try {
    return fs.readFileSync(keyFile, 'utf8').trim();
  } catch {
    const key = crypto.randomBytes(24).toString('base64url');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(keyFile, key, { mode: 0o600 });
    return key;
  }
}
const SYNC_KEY = resolveSyncKey();

function authorized(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length !== SYNC_KEY.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(SYNC_KEY));
}

const requireAuth = (req, res, next) => {
  if (!authorized(req)) return res.status(401).json({ error: 'bad sync key' });
  next();
};

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// CORS — only matters if you host the frontend on a different origin (e.g. GitHub
// Pages). Set ALLOW_ORIGIN to that origin; omit it for same-origin deploys.
if (process.env.ALLOW_ORIGIN) {
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN);
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Check a sync key without touching data.
app.get('/api/auth', requireAuth, (_req, res) => res.json({ ok: true }));

// Full session log.
app.get('/api/sessions', requireAuth, (_req, res) => {
  res.json({ sessions: listSessions() });
});

// Push local changes and get the merged set back. Last-writer-wins per record,
// decided by `updatedAt`. Body: { sessions: [...] }.
app.put('/api/sessions', requireAuth, (req, res) => {
  const incoming = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  const valid = incoming.filter((s) => s && typeof s.id === 'string' && Number.isFinite(s.ts));
  upsertMany(valid);
  res.json({ sessions: listSessions() });
});

// Upsert a single session.
app.post('/api/sessions', requireAuth, (req, res) => {
  const s = req.body;
  if (!s || typeof s.id !== 'string' || !Number.isFinite(s.ts)) {
    return res.status(400).json({ error: 'invalid session' });
  }
  res.json({ session: upsertSession(s) });
});

// ---------- static frontend ----------
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log(`Focusblocks running on http://localhost:${PORT}`);
  if (!process.env.SYNC_KEY) {
    console.log(`\n  Sync key (enter this in the app's settings to sync):\n\n    ${SYNC_KEY}\n`);
  }
});
