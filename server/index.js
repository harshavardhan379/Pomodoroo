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

function authorized(req) {
  const configured = process.env.ACCESS_KEY || '';
  const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!configured || supplied.length !== configured.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

function requireAccess(req, res, next) {
  if (!process.env.ACCESS_KEY) return res.status(503).json({ error: 'ACCESS_KEY is not configured' });
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
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
app.get('/api/sessions', requireAccess, (_req, res) => res.json({ sessions: listSessions() }));

app.put('/api/sessions', requireAccess, (req, res) => {
  const incoming = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  const valid = incoming.filter((session) => (
    session && typeof session.id === 'string' && Number.isFinite(session.ts)
  ));
  upsertMany(valid);
  res.json({ sessions: listSessions() });
});

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Focusblocks running on http://localhost:${PORT}`);
});
