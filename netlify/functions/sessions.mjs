import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const store = getStore('focusblocks');

function configuredKeys() {
  return (process.env.ACCESS_KEYS || process.env.ACCESS_KEY || '')
    .split(/[\n,]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function authorized(request) {
  const keys = configuredKeys();
  const supplied = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const match = keys.find((key) => supplied.length === key.length
    && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(key)));
  return match ? crypto.createHash('sha256').update(match).digest('hex').slice(0, 24) : null;
}

function clean(record) {
  return {
    id: String(record.id),
    date: String(record.date),
    ts: Number(record.ts),
    task: String(record.task || ''),
    block: String(record.block || 'Unassigned'),
    minutes: Number(record.minutes) || 25,
    updatedAt: Number(record.updatedAt) || Number(record.ts),
  };
}

function mergeSessions(remote, incoming) {
  const byId = new Map(remote.map((session) => [session.id, session]));
  incoming.forEach((record) => {
    const session = clean(record);
    if (!session.id || !Number.isFinite(session.ts)) return;
    const existing = byId.get(session.id);
    if (!existing || session.updatedAt >= existing.updatedAt) byId.set(session.id, session);
  });
  return [...byId.values()].sort((a, b) => a.ts - b.ts);
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!configuredKeys().length) return Response.json({ error: 'ACCESS_KEYS is not configured' }, { status: 503 });
  const ownerId = authorized(request);
  if (!ownerId) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return Response.json({ error: 'method not allowed' }, { status: 405 });
  }

  const storageKey = `sessions-${ownerId}`;
  const current = (await store.get(storageKey, { type: 'json' })) || [];
  if (request.method === 'GET') return Response.json({ sessions: current });

  const body = await request.json().catch(() => ({}));
  const incoming = Array.isArray(body.sessions) ? body.sessions : [];
  const sessions = mergeSessions(current, incoming);
  await store.setJSON(storageKey, sessions);
  return Response.json({ sessions });
};