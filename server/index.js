import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { listSessions, upsertMany } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

function configuredKeys() {
  return (process.env.ACCESS_KEYS || process.env.ACCESS_KEY || '')
    .split(/[\n,]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function authorized(req) {
  const keys = configuredKeys();
  const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const match = keys.find((key) => supplied.length === key.length
    && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(key)));
  return match ? crypto.createHash('sha256').update(match).digest('hex').slice(0, 24) : null;
}

function requireAccess(req, res, next) {
  if (!configuredKeys().length) return res.status(503).json({ error: 'ACCESS_KEYS is not configured' });
  const ownerId = authorized(req);
  if (!ownerId) return res.status(401).json({ error: 'unauthorized' });
  req.ownerId = ownerId;
  next();
}

if (process.env.ALLOW_ORIGIN) {
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN);
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/sessions', requireAccess, (req, res) => res.json({ sessions: listSessions(req.ownerId) }));

app.put('/api/sessions', requireAccess, (req, res) => {
  const incoming = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  const valid = incoming.filter((session) => (
    session && typeof session.id === 'string' && Number.isFinite(session.ts)
  ));
  upsertMany(req.ownerId, valid);
  res.json({ sessions: listSessions(req.ownerId) });
});

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Focusblocks running on http://localhost:${PORT}`);
});
